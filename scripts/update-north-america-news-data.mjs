import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DATA_PATH = path.join(ROOT, 'assets', 'news-data.json');
const DATA_PATH = path.join(ROOT, 'assets', 'north-america-news-data.json');
const CANADA_NEWS_API = 'https://api.io.canada.ca/io-server/gc/news/en/v2?sort=publishedDate&orderBy=desc&pick=100&format=json';
const CANADA_WEATHER_URL = 'https://weather.gc.ca/index_e.html?alertTabName=public';
const CANADA_HOLIDAY_SOURCE = 'https://www.canada.ca/en/revenue-agency/services/tax/public-holidays.html';
const HISTORY_LIMIT = 90;
const HORIZON_DAYS = 60;
const MAX_ITEMS = 4;

const AMAZON_PATTERN = /\b(?:amazon|fba|asin|seller central|listing|inbound performance|brand registry)\b/i;
const CANADA_RELEVANCE_PATTERN = /\b(?:customs?|border services?|tariffs?|trade|imports?|exports?|CARM|assessment and revenue management|supply chain|transport(?:ation)?|ports?|terminals?|rail(?:way)?|trucking|freight|shipping|cargo|strike|labou?r disruption|work stoppage|closures?|closed|product safety|consumer products?|regulations?|regulatory|compliance)\b/i;
const CONFIRMED_DISRUPTION_PATTERN = /\b(?:closed|closure|shutdown|work stoppage|operations? suspended|strike (?:begins|started|underway)|service interruption)\b/i;
const UNCERTAIN_PATTERN = /\b(?:potential|possible|risk|threat|may|could|proposed|planned|scheduled)\b/i;
const CANADA_PROVINCES = {
  ab: '阿尔伯塔省',
  bc: '不列颠哥伦比亚省',
  on: '安大略省',
  qc: '魁北克省'
};
const HIGH_IMPACT_WEATHER = /(?:blizzard|winter storm|ice storm|freezing rain|hurricane|tropical storm|storm surge|extreme cold|snowfall|flood|high wind)/i;

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hashId(...values) {
  return crypto.createHash('sha256').update(values.map(cleanText).join('|')).digest('hex').slice(0, 20);
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function compareDate(date, start, end) {
  return date >= start && date <= end;
}

function absoluteUrl(value, base) {
  try {
    return new URL(value, base).toString();
  } catch {
    return base;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json,text/html,application/xhtml+xml',
          'User-Agent': 'weather-monitor-north-america/1.0 (https://labslyon.github.io/weather-monitor/)'
        },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${url} failed: ${lastError.message}`);
}

function canadaSource(link) {
  if (/border-services-agency/i.test(link)) return '加拿大边境服务局（CBSA）';
  if (/transport-canada/i.test(link)) return '加拿大交通部';
  if (/department-finance/i.test(link)) return '加拿大财政部';
  if (/global-affairs/i.test(link)) return '加拿大外交事务部';
  if (/environment-climate-change/i.test(link)) return '加拿大环境与气候变化部';
  if (/innovation-science-economic-development/i.test(link)) return '加拿大创新、科学与经济发展部';
  return '加拿大政府新闻中心';
}

function canadaCategory(text) {
  if (/product safety|consumer product|recall|compliance|regulatory|regulation/i.test(text)) {
    return { category: 'compliance', category_zh: '产品与合规' };
  }
  if (/port|terminal|rail|truck|freight|shipping|cargo|transport|strike|work stoppage|closure|closed|supply chain/i.test(text)) {
    return { category: 'logistics', category_zh: '供应链与物流' };
  }
  return { category: 'policy', category_zh: '政策与贸易' };
}

function canadaFact(category, title) {
  if (/tariff/i.test(title)) return '加拿大政府发布应对关税影响的企业支持动态，具体适用对象与实施范围需查看原文。';
  if (/CARM|assessment and revenue management/i.test(title)) return '加拿大边境服务部门发布进口评估与税收管理系统相关动态。';
  if (category === 'logistics') return '加拿大政府发布供应链、交通运输或物流节点相关动态。';
  if (category === 'compliance') return '加拿大政府发布产品合规、安全或监管要求相关动态。';
  return '加拿大政府发布贸易、海关或边境政策相关动态。';
}

function canadaImpact(category) {
  if (category === 'logistics') return '可能影响加拿大境内运输、跨境时效或到港安排；建议相关团队核对承运商状态与重点节点。';
  if (category === 'compliance') return '可能影响产品进入加拿大市场的合规要求；建议先确认适用品类、正式生效范围和过渡期。';
  return '可能影响北美贸易或跨境流程；建议确认是否涉及当前商品、申报方式或成本测算。';
}

async function collectCanadaNews(coverage) {
  const payload = await fetchWithRetry(CANADA_NEWS_API).then((response) => response.json());
  const entries = payload.feed?.entry || [];
  return entries.flatMap((entry) => {
    const title = cleanText(entry.title);
    const teaser = cleanText(entry.teaser);
    const link = cleanText(entry.link);
    const publishedDate = String(entry.publishedDate || '').slice(0, 10);
    const text = `${title} ${teaser}`;
    if (!publishedDate || !compareDate(publishedDate, coverage.start, coverage.end)) return [];
    if (!CANADA_RELEVANCE_PATTERN.test(text) || AMAZON_PATTERN.test(text)) return [];
    const meta = canadaCategory(text);
    const confirmedDisruption = CONFIRMED_DISRUPTION_PATTERN.test(text) && !UNCERTAIN_PATTERN.test(text);
    const highPriority = confirmedDisruption || /tariff|customs|CARM|takes effect|effective|deadline|product safety|recall/i.test(text);
    return [{
      id: hashId('canada-news', link, title),
      source: 'canada_news',
      source_name: canadaSource(link),
      source_tier: 'official',
      source_tier_zh: '加拿大官方来源',
      country_code: 'CA',
      country_zh: '加拿大',
      ...meta,
      status: confirmedDisruption ? 'confirmed_disruption' : 'published',
      status_zh: confirmedDisruption ? '已确认中断' : '官方发布',
      published_at: entry.publishedDate,
      published_date_et: publishedDate,
      title,
      fact_zh: canadaFact(meta.category, title),
      impact_zh: canadaImpact(meta.category),
      impact_is_inference: true,
      url: link,
      priority: confirmedDisruption ? 'critical' : highPriority ? 'high' : 'medium',
      emergency_push: confirmedDisruption,
      emergency_title_zh: confirmedDisruption ? '加拿大确认发生供应链或运输中断' : '',
      action_zh: confirmedDisruption ? '立即核对加拿大相关订单、在途货件和承运安排，并确认替代路径与客户沟通方案。' : '',
      tags: ['加拿大官方', meta.category_zh],
      monitoring_reason: 'new_publication',
      monitoring_reason_zh: '加拿大 · 本期发布',
      effective_date: null,
      deadline_date: null,
      active_until: null
    }];
  });
}

function weatherLabel(value) {
  const labels = [
    [/freezing rain/i, '冻雨预警'],
    [/winter storm/i, '冬季风暴预警'],
    [/blizzard/i, '暴风雪预警'],
    [/hurricane/i, '飓风预警'],
    [/tropical storm/i, '热带风暴预警'],
    [/storm surge/i, '风暴潮预警'],
    [/extreme cold/i, '极寒预警'],
    [/snowfall/i, '强降雪预警'],
    [/flood/i, '洪水预警'],
    [/high wind/i, '大风预警']
  ];
  return labels.find(([pattern]) => pattern.test(value))?.[1] || `${value}预警`;
}

function warningLevelZh(value) {
  if (/red/i.test(value)) return '红色预警';
  if (/orange/i.test(value)) return '橙色预警';
  if (/yellow/i.test(value)) return '黄色预警';
  return '天气提示';
}

async function collectCanadaWeather(coverage, previousItems) {
  const html = await fetchWithRetry(CANADA_WEATHER_URL).then((response) => response.text());
  const dom = load(html);
  const grouped = new Map();
  dom('div[role=row].alert-prv-tb-row-std').each((_, element) => {
    const row = dom(element);
    const link = row.find('a.ga-map-table-alert-link').first();
    const href = link.attr('href') || '';
    const provinceCode = href.match(/\?([a-z]{2})/i)?.[1]?.toLowerCase();
    if (!CANADA_PROVINCES[provinceCode]) return;
    const alert = cleanText(link.text());
    const level = cleanText(row.find('strong').first().text());
    const zone = cleanText(row.find('.alert-prv-tb-zone-name').first().text());
    const severeLevel = /red|orange/i.test(level);
    if (!severeLevel && !HIGH_IMPACT_WEATHER.test(alert)) return;
    const key = `${provinceCode}|${level}|${alert}`;
    const current = grouped.get(key) || { provinceCode, alert, level, zones: [], href };
    if (zone && current.zones.length < 8) current.zones.push(zone);
    grouped.set(key, current);
  });

  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  return [...grouped.values()].map((entry) => {
    const province = CANADA_PROVINCES[entry.provinceCode];
    const label = weatherLabel(entry.alert);
    const levelZh = warningLevelZh(entry.level);
    const emergency = /red|orange/i.test(entry.level) && HIGH_IMPACT_WEATHER.test(entry.alert);
    const id = hashId('canada-weather', entry.provinceCode, entry.alert, entry.href);
    return {
      id,
      source: 'canada_weather',
      source_name: '加拿大环境与气候变化部',
      source_tier: 'official',
      source_tier_zh: '加拿大官方来源',
      country_code: 'CA',
      country_zh: '加拿大',
      category: 'weather',
      category_zh: '天气与运营',
      status: 'active_alert',
      status_zh: '当前生效',
      published_at: `${coverage.end}T12:00:00-05:00`,
      published_date_et: coverage.end,
      title: `${entry.alert} - ${province}`,
      fact_zh: `加拿大环境与气候变化部对${province}发布${label}，当前页面涉及 ${entry.zones.length || 1} 个预报区域。`,
      impact_zh: '可能影响当地办公、道路运输和配送时效；建议相关团队核对人员安排、承运商通知及客户沟通。',
      impact_is_inference: true,
      url: absoluteUrl(entry.href, CANADA_WEATHER_URL),
      priority: emergency ? 'critical' : 'high',
      emergency_push: emergency,
      emergency_title_zh: emergency ? `${province}${label}升级` : '',
      action_zh: emergency ? '立即核对受影响地区的人员安全、运输节点和配送承诺，并持续查看加拿大官方预警。' : '',
      detected_at: emergency ? previousById.get(id)?.detected_at || new Date().toISOString() : undefined,
      tags: [province, label, levelZh],
      monitoring_reason: 'active_alert',
      monitoring_reason_zh: `加拿大 · ${levelZh}`,
      effective_date: null,
      deadline_date: null,
      active_until: null
    };
  });
}

function generalUsItems(base) {
  return (base.latest?.items || []).flatMap((item) => {
    const text = [item.source_name, item.title, item.fact_zh, item.impact_zh, ...(item.tags || [])].join(' ');
    if (item.category === 'platform' || AMAZON_PATTERN.test(text)) return [];
    return [{
      ...item,
      country_code: 'US',
      country_zh: '美国',
      monitoring_reason_zh: `美国 · ${item.monitoring_reason_zh || '本期关注'}`
    }];
  });
}

function nthWeekday(year, monthIndex, weekday, occurrence) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + offset + (occurrence - 1) * 7)).toISOString().slice(0, 10);
}

function mondayBeforeMay25(year) {
  const date = new Date(Date.UTC(year, 4, 24));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function canadaHolidayCatalog(year) {
  return [
    ['元旦', `${year}-01-01`],
    ['维多利亚日／爱国者日', mondayBeforeMay25(year)],
    ['加拿大日', `${year}-07-01`],
    ['劳动节', nthWeekday(year, 8, 1, 1)],
    ['全国真相与和解日', `${year}-09-30`],
    ['感恩节', nthWeekday(year, 9, 1, 2)],
    ['阵亡将士纪念日', `${year}-11-11`],
    ['圣诞节', `${year}-12-25`],
    ['节礼日', `${year}-12-26`]
  ];
}

function canadaHolidays(afterDate) {
  const year = Number(afterDate.slice(0, 4));
  const end = addDays(afterDate, HORIZON_DAYS);
  return [...canadaHolidayCatalog(year), ...canadaHolidayCatalog(year + 1)].flatMap(([title, date]) => {
    if (date <= afterDate || date > end) return [];
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const weekend = weekday === 5 ? `${date}—${addDays(date, 2)}` : weekday === 1 ? `${addDays(date, -2)}—${date}` : date;
    return [{
      type: 'federal_holiday',
      country_code: 'CA',
      country_zh: '加拿大',
      date,
      date_display: weekend,
      title_zh: title,
      scope_zh: '加拿大公共假日；各省、私营企业及连续运营单位的实际安排可能不同。',
      impact_zh: '临近日期应确认办公室、承运商、仓库及客户支持安排，不把公共假日直接等同于全行业停运。',
      source_name: '加拿大政府',
      source_url: CANADA_HOLIDAY_SOURCE
    }];
  });
}

function northAmericaCalendar(base, afterDate) {
  const us = (base.latest?.upcoming || [])
    .filter((item) => item.type === 'federal_holiday')
    .map((item) => ({
      ...item,
      scope_zh: cleanText(item.scope_zh).replace(/Amazon|亚马逊|FBA|ASIN|Listing/gi, '平台与仓库'),
      impact_zh: cleanText(item.impact_zh).replace(/Amazon|亚马逊|FBA|ASIN|Listing/gi, '平台与仓库'),
      country_code: 'US',
      country_zh: '美国'
    }));
  return [...us, ...canadaHolidays(afterDate)].sort((left, right) => left.date.localeCompare(right.date));
}

function priorityRank(item) {
  return item.priority === 'critical' ? 3 : item.priority === 'high' ? 2 : 1;
}

function selectBalancedItems(items) {
  const unique = [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((left, right) => priorityRank(right) - priorityRank(left) || String(right.published_at).localeCompare(String(left.published_at)));
  const selected = [];
  for (const code of ['US', 'CA']) {
    const item = unique.find((candidate) => candidate.country_code === code);
    if (item) selected.push(item);
  }
  for (const item of unique) {
    if (selected.length >= MAX_ITEMS) break;
    if (!selected.some((candidate) => candidate.id === item.id)) selected.push(item);
  }
  return selected.slice(0, MAX_ITEMS);
}

function editionKey(edition) {
  if (!edition) return '';
  return JSON.stringify({ id: edition.id, coverage: edition.coverage, items: edition.items, upcoming: edition.upcoming });
}

async function main() {
  const now = new Date();
  const [base, existing] = await Promise.all([
    readJson(BASE_DATA_PATH, null),
    readJson(DATA_PATH, { schema_version: 1, editions: [] })
  ]);
  if (!base?.latest?.coverage || !Array.isArray(base.latest.items)) throw new Error('Base U.S. news data is unavailable');

  const coverage = base.latest.coverage;
  const previousItems = (existing.editions || []).flatMap((edition) => edition.items || []);
  const [canadaNews, canadaWeather] = await Promise.all([
    collectCanadaNews(coverage),
    collectCanadaWeather(coverage, previousItems)
  ]);
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const candidates = [...generalUsItems(base), ...canadaNews, ...canadaWeather].map((item) => {
    if (!item.emergency_push) return item;
    return { ...item, detected_at: item.detected_at || previousById.get(item.id)?.detected_at || now.toISOString() };
  });
  const items = selectBalancedItems(candidates);
  if (items.some((item) => AMAZON_PATTERN.test([item.source_name, item.title, item.fact_zh, item.impact_zh].join(' ')))) {
    throw new Error('Amazon-specific content reached the North America edition');
  }

  const edition = {
    id: coverage.end,
    generated_at: now.toISOString(),
    mode: 'north-america-general-team-rules',
    delivery_status: 'scf_ready',
    coverage,
    items,
    upcoming: northAmericaCalendar(base, coverage.end),
    source_runs: [
      { id: 'us_general', name: '美国官方及行业来源（已过滤平台专属内容）', status: 'ok', relevant_count: generalUsItems(base).length },
      { id: 'canada_news', name: '加拿大政府新闻 API', status: 'ok', relevant_count: canadaNews.length, url: CANADA_NEWS_API },
      { id: 'canada_weather', name: '加拿大环境与气候变化部天气预警', status: 'ok', relevant_count: canadaWeather.length, url: CANADA_WEATHER_URL }
    ]
  };
  const editions = [edition, ...(existing.editions || []).filter((item) => item.id !== edition.id)]
    .sort((left, right) => right.id.localeCompare(left.id))
    .slice(0, HISTORY_LIMIT);
  const data = {
    schema_version: 1,
    generated_at: now.toISOString(),
    mode: 'north-america-general-team-rules',
    audience: 'all_teams',
    excluded_content: 'marketplace_specific_operations',
    automated_push_ready: true,
    source_strategy: {
      united_states_general: true,
      canada_government_news: true,
      canada_weather_alerts: true,
      public_holidays: true
    },
    latest: edition,
    editions
  };
  const unchanged = editionKey(existing.latest) === editionKey(edition);
  if (!hasFlag('no-write') && !unchanged) await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    wrote_file: !hasFlag('no-write') && !unchanged,
    unchanged,
    coverage,
    selected_items: items.length,
    us_items: items.filter((item) => item.country_code === 'US').length,
    canada_items: items.filter((item) => item.country_code === 'CA').length,
    canada_news_candidates: canadaNews.length,
    canada_weather_candidates: canadaWeather.length,
    upcoming: edition.upcoming.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
