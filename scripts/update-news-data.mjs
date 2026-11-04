import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_JSON = path.join(ROOT, 'assets', 'news-data.json');
const DATA_JS = path.join(ROOT, 'assets', 'news-data.js');
const WATCHLIST_JSON = path.join(ROOT, 'state', 'news-watchlist.json');
const EASTERN_TIMEZONE = 'America/New_York';
const BEIJING_TIMEZONE = 'Asia/Shanghai';
const MAX_DAILY_ITEMS = 5;
const HISTORY_LIMIT = 90;
const CALENDAR_HORIZON_DAYS = 60;

const SOURCE_META = {
  federal_register: {
    name: 'Federal Register',
    organization: '美国联邦公报',
    homepage: 'https://www.federalregister.gov/'
  },
  cpsc: {
    name: 'U.S. Consumer Product Safety Commission',
    organization: '美国消费品安全委员会',
    homepage: 'https://www.cpsc.gov/Recalls'
  },
  nws: {
    name: 'National Weather Service',
    organization: '美国国家气象局',
    homepage: 'https://www.weather.gov/'
  },
  amazon_seller_news: {
    name: 'Amazon Seller News',
    organization: '亚马逊卖家新闻',
    homepage: 'https://sellercentral.amazon.com/seller-forums/discussions?categories=amzn1.spce.category.8b1ad9d2'
  },
  ustr: {
    name: 'Office of the U.S. Trade Representative',
    organization: '美国贸易代表办公室',
    homepage: 'https://ustr.gov/about-us/policy-offices/press-office/press-releases'
  },
  port_la: {
    name: 'Port of Los Angeles',
    organization: '洛杉矶港',
    homepage: 'https://portoflosangeles.org/news/news-release-archive'
  },
  ongoing_watchlist: {
    name: 'Operational Watchlist',
    organization: '持续事项监控（STG／Amazon）',
    homepage: 'https://www.stgusa.com/alerts/'
  },
  calendar_registry: {
    name: 'Events and Federal Holidays',
    organization: '赛事与 OPM 假日日历',
    homepage: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/'
  }
};

const CATEGORY_LABELS = {
  policy: '政策与贸易',
  compliance: '产品合规',
  logistics: '物流与入仓',
  platform: '亚马逊平台',
  weather: '物流天气'
};

const EXCLUDED_PRODUCT_PATTERN = /\b(swing seats?|porch swings?|hanging chairs?|hammock chairs?|suspension trainers?|suspension training hooks?)\b/i;
const OUTDOOR_PRODUCT_PATTERN = /\b(bicycles?|e-?bikes?|cycling|bike helmets?|ski(?:s|ing)?|snowboards?|snow sports?|outdoor|camping|hand warmers?|sports equipment|protective gear|lithium(?:-ion)? batter(?:y|ies))\b/i;
const AMAZON_RELEVANCE_PATTERN = /\b(FBA|fulfillment|inbound|inventory|shipment|shipping|storage|fee|policy|compliance|insurance|product safety|listing|product title|account health|returns?|Brand Registry|intellectual property|Prime Day|holiday|peak season)\b/i;
const TRADE_RELEVANCE_PATTERN = /\b(tariffs?|customs|imports?|de minimis|forced labor|trade policy|section 301|section 232|ocean shipping|maritime|containers?|freight|supply chain|ports?|foreign-trade zone)\b/i;
const TARGET_STATE_CODES = new Set(['CA', 'WA', 'TX', 'GA', 'FL', 'NY', 'NJ', 'PA', 'IL', 'OH', 'TN', 'KY', 'VA', 'SC']);
const SEVERE_WEATHER_EVENTS = /(?:Blizzard|Winter Storm|Ice Storm|Hurricane|Tropical Storm|Storm Surge|High Wind|Extreme Wind|Flood|Flash Flood|Coastal Flood|Tornado|Severe Thunderstorm|Freezing Rain|Heavy Snow) (?:Warning|Watch|Emergency)/i;
const BROAD_WEATHER_EVENTS = /(?:Blizzard|Winter Storm|Ice Storm|Hurricane|Tropical Storm|Storm Surge|High Wind|Extreme Wind) (?:Warning|Watch|Emergency)/i;
const LOGISTICS_HUB_PATTERN = /\b(Los Angeles|Long Beach|San Pedro|Seattle|Tacoma|Dallas|Fort Worth|Houston|New York|Newark|Elizabeth|Savannah|Atlanta|Miami|Jacksonville|Chicago|Columbus|Memphis|Louisville|Charleston|Norfolk|Philadelphia|Inland Empire)\b/i;
const PRODUCT_SPECIFIC_TRADE_CASE_PATTERN = /\b(antidumping|countervailing|five-year reviews?|sunset reviews?|institution of investigation|from (?:China|Canada|Indonesia|Malaysia|Thailand|Vietnam|India|Mexico|Korea|Japan|Germany))\b/i;
const GENERIC_TRADE_POLICY_PATTERN = /\b(de minimis|customs procedures?|tariff policy|trade policy|section 301|section 232|forced labor|all imports?|entry procedures?|ocean shipping|maritime transportation|containers?|freight|supply chain|ports?)\b/i;

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value) {
  return cleanText(value).toLocaleLowerCase('en-US').replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim();
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function compareDate(date, start, end) {
  return date >= start && date <= end;
}

function zonedParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value);
  const result = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${result.year}-${result.month}-${result.day}`,
    weekday: result.weekday,
    time: `${result.hour}:${result.minute}`
  };
}

function coverageWindow(now) {
  const overrideStart = option('coverage-start');
  const overrideEnd = option('coverage-end');
  if (overrideStart || overrideEnd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(overrideStart) || !/^\d{4}-\d{2}-\d{2}$/.test(overrideEnd)) {
      throw new Error('Both --coverage-start and --coverage-end must use YYYY-MM-DD');
    }
    return { start: overrideStart, end: overrideEnd, reason: 'manual override', shouldRun: true };
  }

  const beijing = zonedParts(now, BEIJING_TIMEZONE);
  const eastern = zonedParts(now, EASTERN_TIMEZONE);
  const shouldRun = !['Sat', 'Sun'].includes(beijing.weekday);
  const end = addDays(eastern.date, -1);
  const start = beijing.weekday === 'Mon' ? addDays(end, -2) : end;
  return {
    start,
    end,
    reason: beijing.weekday === 'Mon' ? 'Monday covers U.S. Friday through Sunday' : 'Previous U.S. Eastern date',
    shouldRun
  };
}

function absoluteUrl(value, base) {
  try {
    return new URL(value, base).toString();
  } catch {
    return base;
  }
}

function itemId(source, url, title, versionKey = '') {
  return crypto.createHash('sha256').update(`${source}|${url}|${normalizeTitle(title)}|${versionKey}`).digest('hex').slice(0, 20);
}

function buildItem(input) {
  const meta = SOURCE_META[input.source];
  const url = absoluteUrl(input.url, meta.homepage);
  return {
    id: itemId(input.source, url, input.title, input.version_key),
    source: input.source,
    source_name: input.source_name || meta.organization,
    source_tier: input.source_tier || 'official',
    source_tier_zh: input.source_tier_zh || (input.source_tier === 'industry_advisory' ? '行业预警' : '官方来源'),
    category: input.category,
    category_zh: CATEGORY_LABELS[input.category],
    status: input.status || 'announced',
    status_zh: input.status_zh || '已发布',
    published_at: input.published_at || `${input.published_date}T12:00:00-05:00`,
    published_date_et: input.published_date,
    title: cleanText(input.title),
    fact_zh: cleanText(input.fact_zh),
    impact_zh: cleanText(input.impact_zh),
    impact_is_inference: true,
    url,
    priority: input.priority || 'medium',
    score: input.score || 50,
    emergency_push: input.emergency_push === true,
    emergency_title_zh: cleanText(input.emergency_title_zh),
    action_zh: cleanText(input.action_zh),
    tags: [...new Set(input.tags || [])],
    monitoring_reason: input.monitoring_reason || 'new_publication',
    monitoring_reason_zh: input.monitoring_reason_zh || '本期新发布',
    effective_date: input.effective_date || null,
    deadline_date: input.deadline_date || null,
    active_until: input.active_until || null
  };
}

async function fetchWithRetry(url, options = {}) {
  const delays = [0, 1200, 3500];
  let lastError;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: options.accept || '*/*',
          'User-Agent': 'weather-monitor-news-prototype/0.1 (https://labslyon.github.io/weather-monitor/)'
        },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${url} failed: ${lastError.message}`);
}

async function fetchJson(url) {
  return fetchWithRetry(url, { accept: 'application/json' }).then((response) => response.json());
}

async function fetchText(url) {
  return fetchWithRetry(url, { accept: 'text/html,application/xhtml+xml' }).then((response) => response.text());
}

function dateDistance(fromDate, toDate) {
  const from = new Date(`${fromDate}T12:00:00Z`);
  const to = new Date(`${toDate}T12:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

async function readWatchlist() {
  const payload = JSON.parse(await fs.readFile(WATCHLIST_JSON, 'utf8'));
  if (!Array.isArray(payload.tracked_items) || !Array.isArray(payload.events)) {
    throw new Error('state/news-watchlist.json must contain tracked_items and events arrays');
  }
  return payload;
}

function trackedItemReason(entry, window) {
  if (entry.active_until && entry.active_until < window.end) return null;
  if (entry.updated_date && compareDate(entry.updated_date, window.start, window.end)) {
    return { key: `updated-${entry.updated_date}`, code: 'updated', label: `本期更新 · ${entry.updated_date}` };
  }
  if (entry.published_date && compareDate(entry.published_date, window.start, window.end)) {
    return { key: `published-${entry.published_date}`, code: 'new_publication', label: '本期新发布' };
  }
  if (entry.deadline_date) {
    const days = dateDistance(window.end, entry.deadline_date);
    const threshold = Number(entry.deadline_window_days ?? 7);
    if (days >= 0 && days <= threshold) {
      return {
        key: `deadline-${entry.deadline_date}`,
        code: 'deadline_approaching',
        label: days === 0 ? `今日截止 · ${entry.deadline_date}` : `${days} 天后截止 · ${entry.deadline_date}`
      };
    }
  }
  if (entry.effective_date) {
    const days = dateDistance(window.end, entry.effective_date);
    const before = Number(entry.effective_window_days_before ?? 3);
    const after = Number(entry.effective_window_days_after ?? 3);
    if (days >= -after && days <= before) {
      return {
        key: `effective-${entry.effective_date}`,
        code: days > 0 ? 'effective_soon' : 'recently_effective',
        label: days > 0 ? `${days} 天后生效 · ${entry.effective_date}` : `近期生效 · ${entry.effective_date}`
      };
    }
  }
  if (entry.published_date) {
    const age = dateDistance(entry.published_date, window.end);
    const recentWindow = Number(entry.recent_window_days ?? 0);
    if (recentWindow > 0 && age >= 0 && age <= recentWindow) {
      return { key: `recent-${entry.published_date}`, code: 'recent_watch', label: `近期发布 · ${entry.published_date}` };
    }
  }
  return null;
}

async function verifyTrackedPage(entry) {
  const html = await fetchText(entry.url);
  const normalized = cleanText(load(html).text()).toLocaleLowerCase('en-US');
  const missing = (entry.expected_phrases || []).filter((phrase) => !normalized.includes(cleanText(phrase).toLocaleLowerCase('en-US')));
  if (missing.length) throw new Error(`${entry.id} missing expected text: ${missing.join(' | ')}`);
  return html.length;
}

async function collectOngoingWatchlist(catalog, window) {
  const entries = catalog.tracked_items || [];
  const settled = await Promise.allSettled(entries.map(async (entry) => {
    await verifyTrackedPage(entry);
    const reason = trackedItemReason(entry, window);
    if (!reason) return null;
    return buildItem({
      source: 'ongoing_watchlist',
      source_name: entry.source_name,
      source_tier: entry.source_tier,
      category: entry.category,
      status: entry.status,
      status_zh: entry.status_zh,
      published_date: entry.published_date,
      published_at: entry.published_at,
      title: entry.title,
      fact_zh: entry.fact_zh,
      impact_zh: entry.impact_zh,
      url: entry.url,
      priority: entry.priority,
      score: entry.score,
      emergency_push: entry.emergency_push === true,
      emergency_title_zh: entry.emergency_title_zh,
      action_zh: entry.action_zh,
      tags: entry.tags,
      version_key: `${entry.revision || entry.id}|${reason.key}`,
      monitoring_reason: reason.code,
      monitoring_reason_zh: reason.label,
      effective_date: entry.effective_date,
      deadline_date: entry.deadline_date,
      active_until: entry.active_until
    });
  }));
  const failures = settled.filter((result) => result.status === 'rejected');
  const verified = settled.length - failures.length;
  if (!verified && entries.length) throw new Error(failures.map((result) => result.reason.message).join('; '));
  return {
    items: settled.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []),
    fetched: entries.length,
    relevant: verified,
    warning: failures.length ? `${failures.length} 个持续事项页面校验失败` : '',
    url: SOURCE_META.ongoing_watchlist.homepage
  };
}

async function collectCalendarRegistry(catalog) {
  const checks = [
    {
      id: 'opm-holidays',
      url: SOURCE_META.calendar_registry.homepage,
      expected_phrases: ['2026 Holiday Schedule', 'Wednesday, November 11', 'Friday, December 25']
    },
    ...(catalog.events || []).map((event) => ({
      id: event.id,
      url: event.source_url,
      expected_phrases: event.expected_phrases || []
    }))
  ];
  const settled = await Promise.allSettled(checks.map(verifyTrackedPage));
  const failures = settled.filter((result) => result.status === 'rejected');
  const verified = settled.length - failures.length;
  if (!verified && checks.length) throw new Error(failures.map((result) => result.reason.message).join('; '));
  return {
    items: [],
    fetched: checks.length,
    relevant: verified,
    warning: failures.length ? `${failures.length} 个日历来源校验失败` : '',
    url: SOURCE_META.calendar_registry.homepage
  };
}

function federalStatus(document) {
  if (/^Notice of Agreements Filed$/i.test(document.title || '')) return { status: 'filing', label: '海运协议备案' };
  if (document.type === 'Proposed Rule') return { status: 'proposed', label: '拟议规则' };
  if (document.type === 'Rule') return { status: 'final_rule', label: '最终规则' };
  return { status: 'notice', label: '官方公告' };
}

function federalImpact(text) {
  if (/Notice of Agreements Filed/i.test(text)) {
    return '这是海运协议备案公告，不等于港口停工或运价已经调整；仅当协议主体或航线与在途货件相关时继续核对。';
  }
  if (/de minimis|customs|tariff|import|forced labor|section 301|section 232/i.test(text)) {
    return '可能影响进口税负、清关或申报要求；需核对适用品类、生效日期和过渡安排后再调整成本测算。';
  }
  if (/maritime|ocean shipping|container|freight|port/i.test(text)) {
    return '可能影响海运服务、港口衔接或运输成本；建议核对承运人、目的港和在途批次是否涉及。';
  }
  return '可能涉及产品合规或贸易程序；当前为规则筛选结果，建议先核对正文适用范围。';
}

function federalFact(document, state, agencies) {
  if (/^Notice of Agreements Filed$/i.test(document.title || '') && /Federal Maritime Commission/i.test(agencies)) {
    return '美国联邦海事委员会公布新提交的海运协议备案，具体协议主体和内容需查看原文。';
  }
  return `美国《联邦公报》发布“${document.title}”，文件类型为${state.label}。`;
}

async function collectFederalRegister(window) {
  const params = new URLSearchParams({
    per_page: '1000',
    order: 'newest',
    'conditions[publication_date][gte]': window.start,
    'conditions[publication_date][lte]': window.end
  });
  const url = `https://www.federalregister.gov/api/v1/documents.json?${params}`;
  const payload = await fetchJson(url);
  const items = (payload.results || []).flatMap((document) => {
    const agencies = (document.agencies || []).map((agency) => agency.name).join(' ');
    const text = `${document.title || ''} ${document.abstract || ''} ${document.action || ''} ${agencies}`;
    const strongAgency = /Customs and Border Protection|Federal Maritime Commission|United States Trade Representative|Consumer Product Safety Commission/i.test(agencies);
    const broadTrade = /\b(de minimis|customs|tariffs?|forced labor|section 301|section 232|ocean shipping|maritime|containers?|freight|supply chain|ports?)\b/i.test(text);
    const outdoorSpecific = OUTDOOR_PRODUCT_PATTERN.test(text);
    if (!strongAgency && !broadTrade && !outdoorSpecific) return [];
    if (/foreign-trade zone/i.test(text) && !outdoorSpecific) return [];
    if (PRODUCT_SPECIFIC_TRADE_CASE_PATTERN.test(text) && !outdoorSpecific && !GENERIC_TRADE_POLICY_PATTERN.test(document.title || '')) return [];
    if (EXCLUDED_PRODUCT_PATTERN.test(text) && !broadTrade) return [];

    const state = federalStatus(document);
    const category = /Consumer Product Safety Commission|product safety/i.test(text)
      ? 'compliance'
      : /maritime|ocean shipping|container|freight|port/i.test(text)
        ? 'logistics'
        : 'policy';
    const baseScore = state.status === 'final_rule' ? 82 : state.status === 'proposed' ? 68 : 58;
    return [buildItem({
      source: 'federal_register',
      category,
      status: state.status,
      status_zh: state.label,
      published_date: document.publication_date,
      title: document.title,
      fact_zh: federalFact(document, state, agencies),
      impact_zh: federalImpact(text),
      url: document.html_url,
      priority: state.status === 'final_rule' ? 'high' : 'medium',
      score: baseScore + (broadTrade ? 8 : 0),
      tags: [state.label, ...((document.agencies || []).map((agency) => agency.name).slice(0, 2))]
    })];
  });
  return { items, fetched: payload.results?.length || 0, url };
}

function joinedNames(rows, key = 'Name') {
  return (rows || []).map((row) => cleanText(row?.[key])).filter(Boolean).join('、');
}

async function collectCpsc(window) {
  const params = new URLSearchParams({
    format: 'json',
    RecallDateStart: window.start,
    RecallDateEnd: window.end
  });
  const url = `https://www.saferproducts.gov/RestWebServices/Recall?${params}`;
  const payload = await fetchJson(url);
  const rows = Array.isArray(payload) ? payload : [];
  const items = rows.flatMap((recall) => {
    const products = joinedNames(recall.Products);
    const hazards = joinedNames(recall.Hazards);
    const text = `${recall.Title || ''} ${recall.Description || ''} ${products} ${hazards}`;
    if (EXCLUDED_PRODUCT_PATTERN.test(text)) return [];
    if (!OUTDOOR_PRODUCT_PATTERN.test(text)) return [];
    return [buildItem({
      source: 'cpsc',
      category: 'compliance',
      status: 'recall',
      status_zh: '已发布召回',
      published_date: String(recall.RecallDate || window.end).slice(0, 10),
      title: recall.Title,
      fact_zh: `CPSC 发布与运动或户外产品相关的召回：${recall.Title}`,
      impact_zh: `若经营同类产品，建议核对品牌、型号、ASIN 和在库批次，并检查供应商测试资料及停售/召回要求。${hazards ? `主要风险：${hazards}。` : ''}`,
      url: recall.URL || SOURCE_META.cpsc.homepage,
      priority: 'high',
      score: 92,
      tags: ['产品召回', products || '运动户外']
    })];
  });
  return { items, fetched: rows.length, url };
}

function amazonSummary(title) {
  if (/temporary peak season extensions/i.test(title)) return '亚马逊临时延长国际 FBA 旺季入仓时限。';
  if (/commercial liability insurance/i.test(title)) return '亚马逊更新美国站商业责任保险要求。';
  if (/product bundles?/i.test(title)) return '亚马逊公布新的产品捆绑政策要求。';
  if (/product titles?|item highlights?/i.test(title)) return '亚马逊更新商品标题及 Item Highlights 规则。';
  if (/intellectual property|infringement/i.test(title)) return '亚马逊上线知识产权举报辅助功能。';
  if (/FBA|fulfillment|inbound|shipment/i.test(title)) return `亚马逊发布 FBA/入仓更新：${title}`;
  return `亚马逊发布美国站运营更新：${title}`;
}

function amazonImpact(text) {
  if (/shipment|inbound|FBA|fulfillment/i.test(text)) {
    return '可能影响入仓计划、到仓时限或缺陷费用；建议核对正在运输及准备创建的美国 FBA 货件。';
  }
  if (/fee|storage|cost/i.test(text)) {
    return '可能改变单件履约或仓储成本；建议按尺寸段和库存周转重新测算利润。';
  }
  if (/insurance/i.test(text)) {
    return '可能影响账户合规和保险续保安排；建议核对适用品类、保单渠道及到期时间。';
  }
  if (/product safety|compliance|listing|title|bundle/i.test(text)) {
    return '可能影响 Listing 合规或商品可售状态；建议核对受影响 ASIN，并在生效日前完成调整。';
  }
  return '属于平台工具或政策更新；建议先确认账号是否已开放该功能，再决定是否调整当前流程。';
}

async function collectAmazon(window) {
  const url = SOURCE_META.amazon_seller_news.homepage;
  const html = await fetchText(url);
  const $ = load(html);
  const items = [];
  $('[data-testid="search-post-compact-layout"]').each((_, element) => {
    const card = $(element);
    if (!/News_Amazon/.test(card.text())) return;
    const anchor = card.find('a[href*="/seller-forums/discussions/t/"]').first();
    const title = cleanText(anchor.text());
    const publishedAt = card.find('time[datetime]').first().attr('datetime');
    if (!title || !publishedAt) return;
    const publishedDate = zonedParts(new Date(publishedAt), EASTERN_TIMEZONE).date;
    if (!compareDate(publishedDate, window.start, window.end)) return;
    const excerpt = cleanText(card.find('.search-content-post').first().text()).slice(0, 1200);
    const text = `${title} ${excerpt}`;
    if (!AMAZON_RELEVANCE_PATTERN.test(text)) return;
    if (EXCLUDED_PRODUCT_PATTERN.test(text)) return;
    const highPriority = /FBA|fulfillment|inbound|shipment|fee|insurance|compliance|product safety|policy/i.test(text);
    items.push(buildItem({
      source: 'amazon_seller_news',
      category: 'platform',
      status: /effective|starting|temporary|now available|can now/i.test(text) ? 'active' : 'announced',
      status_zh: /effective|starting|temporary/i.test(text) ? '已生效/临时措施' : '平台公告',
      published_date: publishedDate,
      published_at: publishedAt,
      title,
      fact_zh: amazonSummary(title),
      impact_zh: amazonImpact(text),
      url: anchor.attr('href'),
      priority: highPriority ? 'high' : 'medium',
      score: highPriority ? 88 : 62,
      tags: ['Amazon US', /FBA|fulfillment|inbound|shipment/i.test(text) ? 'FBA' : '平台政策']
    }));
  });
  return { items, fetched: $('[data-testid="search-post-compact-layout"]').length, url };
}

async function collectUstr(window) {
  const url = SOURCE_META.ustr.homepage;
  const html = await fetchText(url);
  const $ = load(html);
  const items = [];
  $('ul.listing > li').each((_, element) => {
    const row = $(element);
    const text = cleanText(row.text());
    const date = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
    const anchor = row.find('a[href]').first();
    const title = cleanText(anchor.text());
    if (!date || !title || !compareDate(date, window.start, window.end)) return;
    const relevant = /China|tariff|trade agreement|trade policy|Section 301|Section 232|import|customs|supply chain/i.test(title);
    if (!relevant) return;
    items.push(buildItem({
      source: 'ustr',
      category: 'policy',
      status: 'announced',
      status_zh: '官方声明',
      published_date: date,
      title,
      fact_zh: `美国贸易代表办公室发布贸易政策动态：“${title}”。`,
      impact_zh: '可能影响对美出口政策环境或关税预期；建议先确认是否涉及中国商品、目标 HTS 税号及正式生效文件。',
      url: anchor.attr('href'),
      priority: /tariff|Section 301|Section 232|China/i.test(title) ? 'high' : 'medium',
      score: /tariff|Section 301|Section 232|China/i.test(title) ? 86 : 64,
      tags: ['贸易政策']
    }));
  });
  return { items, fetched: $('ul.listing > li').length, url };
}

function parseUsDate(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/.exec(cleanText(value));
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : null;
}

async function collectPortLa(window) {
  const url = SOURCE_META.port_la.homepage;
  const html = await fetchText(url);
  const $ = load(html);
  const items = [];
  $('table tbody tr').each((_, element) => {
    const row = $(element);
    const cells = row.find('td');
    const date = parseUsDate(cells.last().text());
    const anchor = cells.eq(Math.max(0, cells.length - 2)).find('a[href]').first();
    const title = cleanText(anchor.text());
    if (!date || !title || !compareDate(date, window.start, window.end)) return;
    if (!/cargo|container|terminal|truck|rail|labor|closure|congestion|shipping|port|interchange/i.test(title)) return;
    const confirmedDisruption = /\b(closed|closure|shutdown|work stoppage|operations? suspended|terminal shutdown)\b/i.test(title)
      && /\b(terminal|port|cargo|container|labor|gate|operations?)\b/i.test(title)
      && !/\b(potential|possible|risk|threat|may|could|planned|scheduled|holiday|maintenance)\b/i.test(title);
    items.push(buildItem({
      source: 'port_la',
      category: 'logistics',
      status: confirmedDisruption ? 'confirmed_disruption' : 'announced',
      status_zh: confirmedDisruption ? '已确认中断' : '港口公告',
      published_date: date,
      title,
      fact_zh: `洛杉矶港发布物流动态：“${title}”。`,
      impact_zh: confirmedDisruption
        ? '已确认的港口作业中断可能影响美西到港、提柜和后续 FBA 送仓时效，需立即核对受影响货件。'
        : '可能影响美西到港、提柜或内陆转运判断；当前为港口公告，需进一步核对是否存在实际停工、关闭或拥堵。',
      url: anchor.attr('href'),
      priority: confirmedDisruption ? 'critical' : /closure|labor|congestion|terminal/i.test(title) ? 'high' : 'medium',
      score: confirmedDisruption ? 100 : /closure|labor|congestion|terminal/i.test(title) ? 87 : 60,
      emergency_push: confirmedDisruption,
      emergency_title_zh: confirmedDisruption ? '洛杉矶港确认发生作业中断' : '',
      action_zh: confirmedDisruption ? '立即核对美西在途货件、提柜预约、免堆期和 FBA 送仓安排，并向货代确认替代方案。' : '',
      tags: ['美西港口']
    }));
  });
  return { items, fetched: $('table tbody tr').length, url };
}

const EVENT_TRANSLATIONS = {
  'Blizzard Warning': '暴风雪警报',
  'Winter Storm Warning': '冬季风暴警报',
  'Ice Storm Warning': '冰暴警报',
  'Hurricane Warning': '飓风警报',
  'Tropical Storm Warning': '热带风暴警报',
  'Storm Surge Warning': '风暴潮警报',
  'High Wind Warning': '大风警报',
  'Extreme Wind Warning': '极端大风警报',
  'Flash Flood Warning': '山洪警报',
  'Flood Warning': '洪水警报',
  'Coastal Flood Warning': '沿海洪水警报',
  'Tornado Warning': '龙卷风警报',
  'Severe Thunderstorm Warning': '强雷暴警报'
};

function alertStateCodes(properties) {
  const ugc = properties?.geocode?.UGC || [];
  return [...new Set(ugc.map((code) => String(code).slice(0, 2)).filter((code) => TARGET_STATE_CODES.has(code)))];
}

async function collectNws() {
  const url = 'https://api.weather.gov/alerts/active?status=actual';
  const payload = await fetchJson(url);
  const grouped = new Map();
  (payload.features || []).forEach((feature) => {
    const properties = feature.properties || {};
    const event = cleanText(properties.event);
    const states = alertStateCodes(properties);
    if (!states.length || !SEVERE_WEATHER_EVENTS.test(event)) return;
    if (!BROAD_WEATHER_EVENTS.test(event) && !LOGISTICS_HUB_PATTERN.test(properties.areaDesc || '')) return;
    const key = `${event}|${states.sort().join(',')}`;
    const current = grouped.get(key);
    const candidate = { feature, event, states };
    if (!current || new Date(properties.sent) > new Date(current.feature.properties.sent)) grouped.set(key, candidate);
  });

  const items = [...grouped.values()].map(({ feature, event, states }) => {
    const properties = feature.properties;
    const translated = EVENT_TRANSLATIONS[event] || event;
    const areaDesc = cleanText(properties.areaDesc);
    const observedExtreme = properties.severity === 'Extreme' && properties.certainty === 'Observed';
    const majorHubWarning = /^(?:Hurricane|Storm Surge|Blizzard|Ice Storm) Warning$/i.test(event)
      && LOGISTICS_HUB_PATTERN.test(areaDesc);
    const emergencyPush = observedExtreme || majorHubWarning;
    const severityScore = emergencyPush ? 100 : properties.severity === 'Extreme' ? 99 : 92;
    return buildItem({
      source: 'nws',
      category: 'weather',
      status: 'active_alert',
      status_zh: '当前生效',
      published_date: zonedParts(new Date(properties.sent || Date.now()), EASTERN_TIMEZONE).date,
      published_at: properties.sent,
      title: properties.headline || `${event}: ${properties.areaDesc}`,
      fact_zh: `美国国家气象局对 ${states.join('、')} 发布${translated}，影响区域包括 ${areaDesc.slice(0, 180)}。`,
      impact_zh: '若货件途经相关港口、铁路或卡车线路，建议核对承运人时效、仓库预约及末端配送延误；这是天气风险预警，不代表港口已经停工。',
      url: properties['@id'] || properties.id || SOURCE_META.nws.homepage,
      priority: emergencyPush ? 'critical' : 'high',
      score: severityScore,
      emergency_push: emergencyPush,
      emergency_title_zh: emergencyPush ? `${translated}影响美国重点物流区域` : '',
      action_zh: emergencyPush ? '立即核对相关州的在途货件、仓库预约与承运人时效，并准备延迟或改线方案。' : '',
      tags: ['当前预警', ...states]
    });
  }).sort((left, right) => right.score - left.score).slice(0, 2);
  return { items, fetched: payload.features?.length || 0, url };
}

async function safeCollect(id, collector) {
  const started = Date.now();
  try {
    const result = await collector();
    return {
      id,
      name: SOURCE_META[id].organization,
      status: 'ok',
      fetched_count: result.fetched,
      relevant_count: result.relevant ?? result.items.length,
      elapsed_ms: Date.now() - started,
      url: result.url || SOURCE_META[id].homepage,
      warning: result.warning || '',
      items: result.items
    };
  } catch (error) {
    return {
      id,
      name: SOURCE_META[id].organization,
      status: 'error',
      fetched_count: 0,
      relevant_count: 0,
      elapsed_ms: Date.now() - started,
      url: SOURCE_META[id].homepage,
      error: error.message,
      items: []
    };
  }
}

function assertSourceContinuity(runs, existing, editionId) {
  const degraded = new Map();
  for (const source of ['ongoing_watchlist', 'nws', 'port_la', 'calendar_registry']) {
    const run = runs.find((item) => item.id === source);
    if (!run || run.status !== 'ok' || run.warning) {
      degraded.set(source, run?.warning || run?.error || 'unavailable');
    }
  }
  if (existing.latest?.id !== editionId) {
    if (degraded.size) {
      throw new Error(`Required source check failed; keeping the previous edition: ${[...degraded].map(([source, detail]) => `${source}: ${detail}`).join('; ')}`);
    }
    return;
  }
  const previousCounts = new Map();
  (existing.latest.items || []).forEach((item) => {
    previousCounts.set(item.source, (previousCounts.get(item.source) || 0) + 1);
  });
  for (const [source, previousCount] of previousCounts) {
    const run = runs.find((item) => item.id === source);
    const currentCount = run?.status === 'ok' ? run.items.length : 0;
    if (!run || run.status !== 'ok' || run.warning || currentCount < previousCount) {
      degraded.set(source, `${currentCount}/${previousCount}${run?.warning ? ` (${run.warning})` : ''}`);
    }
  }
  if (degraded.size) {
    throw new Error(`Source continuity check failed; keeping the previous edition: ${[...degraded].map(([source, detail]) => `${source}: ${detail}`).join('; ')}`);
  }
}

function uniqueItems(items) {
  const byUrl = new Map();
  const byTitle = new Set();
  items.sort((left, right) => right.score - left.score).forEach((item) => {
    const titleKey = normalizeTitle(item.title);
    if (byUrl.has(item.url) || byTitle.has(titleKey)) return;
    byUrl.set(item.url, item);
    byTitle.add(titleKey);
  });
  return [...byUrl.values()];
}

function selectItems(items, existing, editionId) {
  const previouslySent = new Set(
    (existing.editions || [])
      .filter((edition) => edition.id !== editionId)
      .flatMap((edition) => edition.items || [])
      .map((item) => item.id)
  );
  const candidates = uniqueItems(items).filter((item) => !previouslySent.has(item.id));
  const selected = [];
  const categoryCounts = new Map();
  for (const item of candidates) {
    if (selected.length >= MAX_DAILY_ITEMS) break;
    const count = categoryCounts.get(item.category) || 0;
    if (count >= 2) continue;
    selected.push(item);
    categoryCounts.set(item.category, count + 1);
  }
  if (selected.length < MAX_DAILY_ITEMS) {
    for (const item of candidates) {
      if (selected.length >= MAX_DAILY_ITEMS) break;
      if (!selected.some((selectedItem) => selectedItem.id === item.id)) selected.push(item);
    }
  }
  return selected.map(({ score, ...item }) => item);
}

function nthWeekday(year, monthIndex, weekday, occurrence) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (occurrence - 1) * 7;
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function lastWeekday(year, monthIndex, weekday) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  last.setUTCDate(last.getUTCDate() - offset);
  return last.toISOString().slice(0, 10);
}

function federalHolidays(year) {
  return [
    ['元旦', `${year}-01-01`],
    ['马丁·路德·金纪念日', nthWeekday(year, 0, 1, 3)],
    ['华盛顿诞辰纪念日', nthWeekday(year, 1, 1, 3)],
    ['阵亡将士纪念日', lastWeekday(year, 4, 1)],
    ['六月节', `${year}-06-19`],
    ['独立日', `${year}-07-04`],
    ['劳动节', nthWeekday(year, 8, 1, 1)],
    ['哥伦布日', nthWeekday(year, 9, 1, 2)],
    ['退伍军人节', `${year}-11-11`],
    ['感恩节', nthWeekday(year, 10, 4, 4)],
    ['圣诞节', `${year}-12-25`]
  ];
}

function upcomingHolidays(afterDate) {
  const year = Number(afterDate.slice(0, 4));
  const end = addDays(afterDate, CALENDAR_HORIZON_DAYS);
  return [...federalHolidays(year), ...federalHolidays(year + 1)].flatMap(([name, date]) => {
    if (date <= afterDate || date > end) return [];
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    let dateDisplay = date;
    let title = name;
    let scope = '美国联邦假日；政府机构和部分企业休息，私营企业不一定停工。';
    if (name === '感恩节' && weekday === 4) {
      dateDisplay = `${date}—${addDays(date, 3)}`;
      title = '感恩节周末';
      scope = '感恩节为周四；周五也休息的单位可形成四天周末，但并非全国统一四天假。';
    } else if (weekday === 5) {
      dateDisplay = `${date}—${addDays(date, 2)}`;
      title = `${name}周末`;
      scope = `${name}为周五，适用休假者可与周末形成三天假期；私营企业安排并不统一。`;
    } else if (weekday === 1) {
      dateDisplay = `${addDays(date, -2)}—${date}`;
      title = `${name}周末`;
      scope = `${name}为周一，适用休假者可与前一周末形成三天假期；私营企业安排并不统一。`;
    }
    return [{
      type: 'federal_holiday',
      date,
      date_display: dateDisplay,
      title_zh: title,
      scope_zh: scope,
      impact_zh: '临近日期应核对承运人、港口、卡车公司及 FBA 仓库的实际工作安排，不把联邦假日直接等同于全行业停运。',
      source_name: '美国人事管理局（OPM）',
      source_url: SOURCE_META.calendar_registry.homepage
    }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function upcomingCalendar(catalog, afterDate) {
  const end = addDays(afterDate, CALENDAR_HORIZON_DAYS);
  const events = (catalog.events || [])
    .filter((event) => event.date > afterDate && event.date <= end)
    .map((event) => ({
      type: event.type || 'event',
      date: event.date,
      date_display: event.date_display || event.date,
      title_zh: event.title_zh,
      scope_zh: event.scope_zh,
      impact_zh: event.impact_zh,
      source_name: event.source_name,
      source_url: event.source_url
    }));
  return [...events, ...upcomingHolidays(afterDate)].sort((left, right) => left.date.localeCompare(right.date));
}

async function readExisting() {
  try {
    return JSON.parse(await fs.readFile(DATA_JSON, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { schema_version: 1, editions: [] };
    throw error;
  }
}

function editionContentKey(edition) {
  if (!edition) return '';
  return JSON.stringify({
    id: edition.id,
    coverage: edition.coverage,
    items: edition.items,
    upcoming: edition.upcoming
  });
}

function buildPreview(edition) {
  const lines = [
    `【美国跨境简报｜${edition.id}】`,
    `覆盖日期：${edition.coverage.start === edition.coverage.end ? edition.coverage.end : `${edition.coverage.start} 至 ${edition.coverage.end}`}（美国东部时间）`,
    ''
  ];
  if (!edition.items.length) lines.push('未发现达到推送阈值的重要内容，不凑数。');
  edition.items.forEach((item, index) => {
    lines.push(`${index + 1}. 【${item.category_zh}｜${item.status_zh}｜${item.monitoring_reason_zh}】${item.fact_zh}`);
    lines.push(`   影响／建议：${item.impact_zh}`);
    lines.push(`   ${item.url}`);
  });
  if (edition.upcoming.length) {
    lines.push('', '【赛事与短假预告】');
    const events = edition.upcoming.filter((item) => item.type !== 'federal_holiday');
    const holidays = edition.upcoming.filter((item) => item.type === 'federal_holiday');
    if (events.length) {
      lines.push('骑行赛事');
      events.forEach((item) => lines.push(`${item.date_display || item.date}｜${item.title_zh}：${item.impact_zh}`));
    }
    if (holidays.length) {
      lines.push('', '美国假期与短假');
      holidays.forEach((item) => lines.push(`${item.date_display || item.date}｜${item.title_zh}：${item.impact_zh}`));
    }
  }
  lines.push('', '注：影响／建议为规则生成的条件式判断，不是官方结论。');
  return lines.join('\n');
}

async function main() {
  const nowValue = option('now');
  const now = nowValue ? new Date(nowValue) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowValue}`);
  const window = coverageWindow(now);
  const [existing, catalog] = await Promise.all([readExisting(), readWatchlist()]);

  const runs = await Promise.all([
    safeCollect('federal_register', () => collectFederalRegister(window)),
    safeCollect('cpsc', () => collectCpsc(window)),
    safeCollect('nws', collectNws),
    safeCollect('amazon_seller_news', () => collectAmazon(window)),
    safeCollect('ustr', () => collectUstr(window)),
    safeCollect('port_la', () => collectPortLa(window)),
    safeCollect('ongoing_watchlist', () => collectOngoingWatchlist(catalog, window)),
    safeCollect('calendar_registry', () => collectCalendarRegistry(catalog))
  ]);

  const successful = runs.filter((run) => run.status === 'ok');
  if (successful.length < 5) throw new Error(`Only ${successful.length} news sources succeeded; refusing to publish`);

  const editionId = window.end;
  assertSourceContinuity(runs, existing, editionId);
  const previousLatestItems = new Map((existing.latest?.items || []).map((item) => [item.id, item]));
  const selected = selectItems(runs.flatMap((run) => run.items), existing, editionId).map((item) => {
    if (!item.emergency_push) return item;
    return {
      ...item,
      detected_at: previousLatestItems.get(item.id)?.detected_at || now.toISOString()
    };
  });
  const edition = {
    id: editionId,
    generated_at: now.toISOString(),
    mode: 'fixed-source-rules-with-watchlist-prototype',
    delivery_status: 'preview_only',
    coverage: {
      start: window.start,
      end: window.end,
      timezone: EASTERN_TIMEZONE,
      reason: window.reason
    },
    items: selected,
    upcoming: upcomingCalendar(catalog, window.end),
    source_runs: runs.map(({ items, ...run }) => run)
  };

  const editions = [edition, ...(existing.editions || []).filter((item) => item.id !== editionId)]
    .sort((left, right) => right.id.localeCompare(left.id))
    .slice(0, HISTORY_LIMIT);
  const data = {
    schema_version: 2,
    generated_at: now.toISOString(),
    mode: 'fixed-source-rules-with-watchlist-prototype',
    ai_summary_enabled: false,
    search_api_enabled: false,
    automated_push_enabled: false,
    source_strategy: {
      daily_publications: true,
      rolling_watchlist: true,
      events_and_holidays: true,
      calendar_horizon_days: CALENDAR_HORIZON_DAYS
    },
    timezone_rules: {
      run_timezone: BEIJING_TIMEZONE,
      source_date_timezone: EASTERN_TIMEZONE,
      weekday_target: '16:00 Asia/Shanghai',
      monday_window: 'U.S. Friday through Sunday'
    },
    latest: edition,
    editions
  };

  const unchanged = !hasFlag('force-write') && editionContentKey(existing.latest) === editionContentKey(edition);
  if (!hasFlag('no-write') && !unchanged) {
    await fs.writeFile(DATA_JSON, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    const safeJson = JSON.stringify(data).replace(/<\//g, '<\\/');
    await fs.writeFile(DATA_JS, `window.NEWS_DATA = ${safeJson};\n`, 'utf8');
  }

  if (hasFlag('preview') || hasFlag('no-write')) console.log(buildPreview(edition));
  console.log(JSON.stringify({
    ok: true,
    wrote_files: !hasFlag('no-write') && !unchanged,
    unchanged,
    should_run_today: window.shouldRun,
    coverage: window,
    selected_items: selected.length,
    sources_ok: successful.length,
    sources_failed: runs.filter((run) => run.status === 'error').map((run) => ({ id: run.id, error: run.error })),
    source_counts: runs.map((run) => ({ id: run.id, fetched: run.fetched_count, relevant: run.relevant_count }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
