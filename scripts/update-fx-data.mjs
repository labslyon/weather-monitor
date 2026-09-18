import fs from 'node:fs/promises';

const DATA_JSON = 'assets/fx-data.json';
const DATA_JS = 'assets/fx-data.js';
const CURRENCIES = ['USD', 'CAD', 'AUD'];
const COUNTRY_BY_CURRENCY = { USD: 'US', CAD: 'CA', AUD: 'AU' };
const NAME_BY_CURRENCY = {
  USD: 'US Dollar',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar'
};

function generatedAt() {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function percentChange(current, baseline) {
  if (current == null || baseline == null || baseline === 0) return null;
  return round(((current / baseline) - 1) * 100, 4);
}

function monthKey(date) {
  return date.slice(0, 7);
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/vnd.sdmx.data+json;version=1.0.0-wd' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`ECB API returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function parseSdmx(payload) {
  const seriesDimensions = payload?.structure?.dimensions?.series || [];
  const observationDimensions = payload?.structure?.dimensions?.observation || [];
  const timeDimension = observationDimensions.find((dimension) => dimension.id === 'TIME_PERIOD');
  const series = payload?.dataSets?.[0]?.series || {};

  if (!timeDimension || !Object.keys(series).length) {
    throw new Error('ECB response did not contain exchange-rate observations');
  }

  const ratesByDate = new Map();

  Object.entries(series).forEach(([seriesKey, seriesValue]) => {
    const indexes = seriesKey.split(':').map(Number);
    const attributes = Object.fromEntries(seriesDimensions.map((dimension, index) => {
      return [dimension.id, dimension.values?.[indexes[index]]?.id];
    }));
    const currency = attributes.CURRENCY;
    if (![...CURRENCIES, 'CNY'].includes(currency)) return;

    Object.entries(seriesValue.observations || {}).forEach(([observationIndex, observation]) => {
      const date = timeDimension.values?.[Number(observationIndex)]?.id;
      const value = Number(observation?.[0]);
      if (!date || !Number.isFinite(value)) return;
      if (!ratesByDate.has(date)) ratesByDate.set(date, {});
      ratesByDate.get(date)[currency] = value;
    });
  });

  return [...ratesByDate.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function buildCrossRates(entries) {
  return entries.map(([date, rates]) => {
    if (!rates.CNY || CURRENCIES.some((currency) => !rates[currency])) return null;
    return {
      date,
      ...Object.fromEntries(CURRENCIES.map((currency) => [
        currency,
        round(rates.CNY / rates[currency])
      ]))
    };
  }).filter(Boolean);
}

function lastByMonth(rows) {
  const result = new Map();
  rows.forEach((row) => result.set(monthKey(row.date), row));
  return result;
}

function currencySummary(currency, rows, currentMonthRows, previousMonthRow) {
  const latestRow = rows.at(-1);
  const monthStartRow = currentMonthRows[0] || latestRow;
  const comparisonRow = previousMonthRow || rows[0];
  const currentValues = (currentMonthRows.length ? currentMonthRows : [latestRow])
    .map((row) => row?.[currency])
    .filter((value) => value != null);
  const latest = latestRow?.[currency] ?? null;
  const monthStart = monthStartRow?.[currency] ?? null;
  const previousMonthEnd = comparisonRow?.[currency] ?? null;

  return {
    country: COUNTRY_BY_CURRENCY[currency],
    name: NAME_BY_CURRENCY[currency],
    pair: `${currency}/CNY`,
    latest,
    latest_date: latestRow?.date || null,
    month_start: monthStart,
    month_change_pct: percentChange(latest, monthStart),
    previous_month_end: previousMonthEnd,
    previous_month_change_pct: percentChange(latest, previousMonthEnd),
    month_min: currentValues.length ? Math.min(...currentValues) : null,
    month_max: currentValues.length ? Math.max(...currentValues) : null,
    per_10000_change_cny: latest == null || monthStart == null
      ? null
      : round((latest - monthStart) * 10000, 2)
  };
}

async function main() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const currentMonth = now.toISOString().slice(0, 7);
  const startPeriod = `${year}-01-01`;
  const queryStartPeriod = `${year - 1}-12-01`;
  const endPeriod = now.toISOString().slice(0, 10);
  const apiUrl = `https://data-api.ecb.europa.eu/service/data/EXR/D.USD%2BCAD%2BAUD%2BCNY.EUR.SP00.A?startPeriod=${queryStartPeriod}&endPeriod=${endPeriod}&format=jsondata`;

  let payload;
  try {
    payload = await fetchWithRetry(apiUrl);
  } catch (error) {
    if (await fileExists(DATA_JSON) && await fileExists(DATA_JS)) {
      console.warn(`Keeping existing FX data: ${error.message}`);
      return;
    }
    throw error;
  }

  const allDaily = buildCrossRates(parseSdmx(payload));
  if (!allDaily.length) throw new Error('No complete ECB cross-rate rows were produced');
  const daily = allDaily.filter((row) => row.date >= startPeriod);
  const latestRows = daily.length ? daily : allDaily.slice(-1);
  const priorPeriodRow = allDaily.filter((row) => row.date < startPeriod).at(-1) || null;

  const monthEnds = lastByMonth(daily);
  const completedMonthRows = [...monthEnds.entries()]
    .filter(([month]) => month < currentMonth)
    .map(([, row]) => ({ ...row }));
  const currentMonthRows = daily.filter((row) => monthKey(row.date) === currentMonth);
  const previousMonthRow = completedMonthRows.at(-1) || priorPeriodRow;
  const currencies = Object.fromEntries(CURRENCIES.map((currency) => [
    currency,
    currencySummary(currency, latestRows, currentMonthRows, previousMonthRow)
  ]));

  const data = {
    generated_at: generatedAt(),
    source: {
      name: 'European Central Bank',
      page_url: 'https://data.ecb.europa.eu/currency-converter',
      api_url: apiUrl,
      method: 'ECB euro reference rates converted into CNY cross rates',
      note: 'Reference rates for information purposes only; not transaction or settlement quotes.'
    },
    base_currency: 'CNY',
    direction: '1 foreign currency = CNY',
    year,
    latest_date: latestRows.at(-1).date,
    current_month: currentMonth,
    currencies,
    month_end: completedMonthRows,
    current_month_daily: currentMonthRows,
    daily
  };

  await fs.writeFile(DATA_JSON, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.writeFile(DATA_JS, `window.FX_DATA = ${JSON.stringify(data)};\n`, 'utf8');

  console.log(JSON.stringify({
    generated_at: data.generated_at,
    latest_date: data.latest_date,
    daily_count: daily.length,
    completed_month_count: completedMonthRows.length,
    current_month_daily_count: currentMonthRows.length,
    pairs: CURRENCIES.map((currency) => ({
      pair: currencies[currency].pair,
      latest: currencies[currency].latest,
      month_change_pct: currencies[currency].month_change_pct
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
