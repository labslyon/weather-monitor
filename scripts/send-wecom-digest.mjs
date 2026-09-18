import fs from 'node:fs/promises';

const WEATHER_FILE = 'assets/weather-data.json';
const FX_FILE = 'assets/fx-data.json';
const DASHBOARD_URL = 'https://labslyon.github.io/weather-monitor/';
const previewOnly = process.argv.includes('--preview');

const COUNTRY_LABELS = { US: '美国', CA: '加拿大', AU: '澳大利亚' };
const CURRENCY_META = {
  USD: { name: '美元', pair: 'USD/CNY' },
  CAD: { name: '加元', pair: 'CAD/CNY' },
  AUD: { name: '澳元', pair: 'AUD/CNY' }
};

const OPERATIONAL_REGIONS = {
  US: [
    { name: '美东北', points: ['us-east', 'us-northeast-buffalo'] },
    { name: '美东南', points: ['us-south', 'us-southeast-atlanta'] },
    { name: '中西部与五大湖', points: ['us-north', 'us-midwest-minneapolis'] },
    { name: '美南部', points: ['us-central', 'us-south-houston'] },
    { name: '美西南', points: ['us-southwest', 'us-southwest-albuquerque'] },
    { name: '美西海岸', points: ['us-west', 'us-west-sf', 'us-pnw'] },
    { name: '落基山脉', points: ['us-rockies', 'us-rockies-slc', 'us-rockies-aspen'] }
  ],
  CA: [
    { name: 'Ontario', points: ['ca-ontario', 'ca-ontario-ottawa'] },
    { name: 'Quebec', points: ['ca-quebec-province', 'ca-quebec-city'] },
    { name: 'British Columbia', points: ['ca-british-columbia-vancouver', 'ca-british-columbia'] },
    { name: 'Alberta', points: ['ca-alberta', 'ca-alberta-edmonton'] }
  ],
  AU: [
    { name: '东部沿海', points: ['au-east', 'au-east-canberra'] },
    { name: '东北部', points: ['au-ne', 'au-ne-cairns'] },
    { name: '南部', points: ['au-south', 'au-south-adelaide'] },
    { name: '西部', points: ['au-west', 'au-west-albany'] },
    { name: '北部热带', points: ['au-north', 'au-north-broome'] }
  ]
};

function numeric(values) {
  return (values || []).filter((value) => typeof value === 'number' && Number.isFinite(value));
}

function average(values) {
  const clean = numeric(values);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function median(values) {
  const clean = numeric(values).sort((left, right) => left - right);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function min(values) {
  const clean = numeric(values);
  return clean.length ? Math.min(...clean) : null;
}

function max(values) {
  const clean = numeric(values);
  return clean.length ? Math.max(...clean) : null;
}

function toC(fahrenheit) {
  return fahrenheit == null ? null : (fahrenheit - 32) * 5 / 9;
}

function midpoint(row, index) {
  const daily = row.daily || {};
  const high = daily.temp_max?.[index];
  const low = daily.temp_min?.[index];
  if (high == null && low == null) return null;
  if (high == null) return low;
  if (low == null) return high;
  return (high + low) / 2;
}

function pointOutlook(row) {
  const daily = row.daily || {};
  const forecastLength = Math.max(
    daily.dates?.length || 0,
    daily.temp_max?.length || 0,
    daily.temp_min?.length || 0
  );
  const lastIndex = forecastLength ? Math.min(6, forecastLength - 1) : 0;
  const startF = midpoint(row, 0);
  const endF = midpoint(row, lastIndex);
  const precipitation = numeric(daily.precipitation);
  const snowfall = numeric(daily.snowfall);
  const lows = numeric(daily.temp_min);
  const highs = numeric(daily.temp_max);
  const snowDays = snowfall.filter((value) => value >= 0.04).length;

  return {
    currentF: row.current?.temperature ?? startF,
    minF: lows.length ? Math.min(...lows) : null,
    maxF: highs.length ? Math.max(...highs) : null,
    trendC: startF == null || endF == null ? null : (endF - startF) * 5 / 9,
    rainyDays: precipitation.filter((value) => value >= 0.1).length,
    snowfallCm: snowfall.reduce((sum, value) => sum + value, 0) * 2.54,
    snowDays
  };
}

function regionOutlook(country, group, snapshot) {
  const rows = snapshot.regions || {};
  const points = group.points.map((key) => rows[key]).filter(Boolean).map(pointOutlook);
  const minF = min(points.map((point) => point.minF));
  const trendC = median(points.map((point) => point.trendC));
  const snowfallCm = max(points.map((point) => point.snowfallCm)) || 0;

  return {
    country,
    name: group.name,
    pointCount: points.length,
    currentF: median(points.map((point) => point.currentF)),
    minF,
    maxF: max(points.map((point) => point.maxF)),
    trendC,
    rainyDays: max(points.map((point) => point.rainyDays)) || 0,
    snowfallCm,
    hasCooling: points.some((point) => point.trendC != null && point.trendC <= -2),
    hasWarming: points.some((point) => point.trendC != null && point.trendC >= 2),
    isRainy: points.some((point) => point.rainyDays >= 2),
    isCold: points.some((point) => point.snowDays > 0 || (point.minF != null && toC(point.minF) <= 2))
  };
}

function buildWeatherOverview(weather) {
  const snapshot = weather.today_data || {};
  const regions = Object.entries(OPERATIONAL_REGIONS).flatMap(([country, groups]) => {
    return groups.map((group) => regionOutlook(country, group, snapshot)).filter((region) => region.pointCount);
  });

  const countries = Object.keys(OPERATIONAL_REGIONS).map((country) => {
    const items = regions.filter((region) => region.country === country);
    return {
      country,
      currentC: toC(average(items.map((item) => item.currentF))),
      minC: toC(min(items.map((item) => item.minF))),
      maxC: toC(max(items.map((item) => item.maxF))),
      cooling: items.filter((item) => item.hasCooling).length,
      warming: items.filter((item) => item.hasWarming).length,
      rainy: items.filter((item) => item.isRainy).length
    };
  });

  return { countries, regions };
}

function signedPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
}

function rateChangeMarkup(value, threshold = 0.5) {
  const formatted = signedPercent(value);
  return Math.abs(value || 0) >= threshold ? `<font color="warning">${formatted}</font>` : formatted;
}

function dayChange(fx, currency) {
  const rows = (fx.daily || []).filter((row) => row[currency] != null);
  if (rows.length < 2) return null;
  const latest = rows.at(-1)[currency];
  const previous = rows.at(-2)[currency];
  return previous ? ((latest / previous) - 1) * 100 : null;
}

function formatCountryWeather(item) {
  const signals = [];
  if (item.cooling) signals.push(`降温 ${item.cooling} 区`);
  if (item.warming) signals.push(`升温 ${item.warming} 区`);
  if (item.rainy) signals.push(`降雨 ${item.rainy} 区`);
  if (!signals.length) signals.push('趋势平稳');
  return `> ${COUNTRY_LABELS[item.country]}：典型 **${item.currentC.toFixed(1)}°C**｜范围 ${Math.round(item.minC)}–${Math.round(item.maxC)}°C｜${signals.join(' / ')}`;
}

function compactRegions(items) {
  return Object.keys(COUNTRY_LABELS).map((country) => {
    const names = items.filter((item) => item.country === country).map((item) => item.name);
    if (!names.length) return null;
    const display = names.length > 2 ? `${names.slice(0, 2).join('、')}等 ${names.length} 区` : names.join('、');
    return `${COUNTRY_LABELS[country]} ${display}`;
  }).filter(Boolean).join('；');
}

function signalLine(label, items, emptyText) {
  return `> ${label}：${items.length ? compactRegions(items) : emptyText}`;
}

function beijingNow() {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Shanghai'
  }).format(new Date()).replace(/\//g, '-');
}

function buildMessage(weather, fx) {
  const overview = buildWeatherOverview(weather);
  const rainy = overview.regions.filter((item) => item.isRainy);
  const cooling = overview.regions.filter((item) => item.hasCooling);
  const snowfall = overview.regions.filter((item) => item.snowfallCm >= 1);
  const cold = overview.regions.filter((item) => item.isCold);

  const rateLines = Object.keys(CURRENCY_META).map((currency) => {
    const item = fx.currencies[currency];
    const meta = CURRENCY_META[currency];
    return `> ${meta.name} ${meta.pair}：**${item.latest.toFixed(4)}**｜日变 ${rateChangeMarkup(dayChange(fx, currency))}｜月内 ${rateChangeMarkup(item.month_change_pct, 2)}`;
  });

  const weatherLines = overview.countries.map(formatCountryWeather);
  const focusLines = [
    signalLine('降雨', rainy, '暂无明显信号'),
    signalLine('降温', cooling, '暂无明显信号'),
    snowfall.length
      ? signalLine('降雪', snowfall, '暂无明显信号')
      : signalLine('低温', cold, '暂无明显信号')
  ];

  const cyclingTip = rainy.length || cooling.length
    ? `> 骑行：${rainy.length ? '降雨区域关注防水装备与天气素材' : ''}${rainy.length && cooling.length ? '；' : ''}${cooling.length ? '降温区域关注保暖骑行服' : ''}。`
    : '> 骑行：暂无明显降雨或降温信号。';
  const skiTip = snowfall.length
    ? '> 滑雪：已有区域达到降雪关注阈值，关注雪服、雪镜及保暖装备需求。'
    : cold.length
      ? '> 滑雪：已有区域进入低温关注范围，继续观察后续降雪预报。'
      : '> 滑雪：暂无新增低温或降雪信号。';

  return [
    '## 美加澳运营日报',
    `<font color="comment">北京时间：${beijingNow()}</font>`,
    '',
    '### 汇率 · 兑人民币',
    ...rateLines,
    `<font color="comment">汇率日期：${fx.latest_date}，ECB 最近有效工作日参考汇率。</font>`,
    '',
    '### 天气 · 未来 7 日',
    ...weatherLines,
    '',
    '### 重点区域',
    ...focusLines,
    '',
    '### 运营提示',
    cyclingTip,
    skiTip,
    '',
    `[查看完整运营看板](${DASHBOARD_URL})`
  ].join('\n');
}

function validateWebhook(value) {
  if (!value) throw new Error('WECOM_WEBHOOK_URL is not configured');
  const url = new URL(value);
  const valid = url.protocol === 'https:' &&
    url.hostname === 'qyapi.weixin.qq.com' &&
    url.pathname === '/cgi-bin/webhook/send' &&
    url.searchParams.has('key');
  if (!valid) throw new Error('WECOM_WEBHOOK_URL is not a valid WeCom group robot webhook');
  return url.toString();
}

async function sendMessage(webhook, content) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok || result.errcode !== 0) {
        throw new Error(`WeCom returned ${result.errcode ?? response.status}: ${result.errmsg || 'unknown error'}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`WeCom delivery failed after 3 attempts: ${lastError.message}`);
}

async function main() {
  const [weather, fx] = await Promise.all([
    fs.readFile(WEATHER_FILE, 'utf8').then(JSON.parse),
    fs.readFile(FX_FILE, 'utf8').then(JSON.parse)
  ]);
  const content = buildMessage(weather, fx);
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > 4000) throw new Error(`WeCom digest is too long: ${bytes} bytes`);

  if (previewOnly) {
    console.log(content);
    console.log(`\nPreview size: ${bytes} bytes`);
    return;
  }

  const webhook = validateWebhook(process.env.WECOM_WEBHOOK_URL);
  await sendMessage(webhook, content);
  console.log(`WeCom digest delivered successfully (${bytes} bytes)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
