import fs from 'node:fs/promises';

const DATA_JSON = 'assets/weather-data.json';
const DATA_JS = 'assets/weather-data.js';

const COUNTRY_META = {
  US: { name: 'United States', flag: '\u{1F1FA}\u{1F1F8}' },
  CA: { name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' },
  AU: { name: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' }
};

function seed(country, regionKey, city, region, lat, lon) {
  return {
    city,
    region,
    region_key: regionKey,
    country,
    country_name: COUNTRY_META[country].name,
    country_flag: COUNTRY_META[country].flag,
    lat,
    lon
  };
}

const REGION_SEEDS = {
  'us-east': seed('US', 'us-east', 'New York', 'Northeast', 40.7128, -74.006),
  'us-northeast-buffalo': seed('US', 'us-northeast-buffalo', 'Buffalo', 'Northeast', 42.8864, -78.8784),
  'us-south': seed('US', 'us-south', 'Miami', 'Southeast', 25.7617, -80.1918),
  'us-southeast-atlanta': seed('US', 'us-southeast-atlanta', 'Atlanta', 'Southeast', 33.749, -84.388),
  'us-north': seed('US', 'us-north', 'Chicago', 'Midwest / Great Lakes', 41.8781, -87.6298),
  'us-midwest-minneapolis': seed('US', 'us-midwest-minneapolis', 'Minneapolis', 'Midwest / Great Lakes', 44.9778, -93.265),
  'us-central': seed('US', 'us-central', 'Dallas', 'South', 32.7767, -96.797),
  'us-south-houston': seed('US', 'us-south-houston', 'Houston', 'South', 29.7604, -95.3698),
  'us-southwest': seed('US', 'us-southwest', 'Phoenix', 'Southwest', 33.4484, -112.074),
  'us-southwest-albuquerque': seed('US', 'us-southwest-albuquerque', 'Albuquerque', 'Southwest', 35.0844, -106.6504),
  'us-west': seed('US', 'us-west', 'Los Angeles', 'West Coast', 34.0522, -118.2437),
  'us-west-sf': seed('US', 'us-west-sf', 'San Francisco', 'West Coast', 37.7749, -122.4194),
  'us-pnw': seed('US', 'us-pnw', 'Seattle', 'West Coast', 47.6062, -122.3321),
  'us-rockies': seed('US', 'us-rockies', 'Denver', 'Rocky Mountains', 39.7392, -104.9903),
  'us-rockies-slc': seed('US', 'us-rockies-slc', 'Salt Lake City', 'Rocky Mountains', 40.7608, -111.891),
  'us-rockies-aspen': seed('US', 'us-rockies-aspen', 'Aspen', 'Rocky Mountains', 39.1911, -106.8175),
  'ca-ontario': seed('CA', 'ca-ontario', 'Toronto', 'Ontario', 43.6532, -79.3832),
  'ca-ontario-ottawa': seed('CA', 'ca-ontario-ottawa', 'Ottawa', 'Ontario', 45.4215, -75.6972),
  'ca-quebec-province': seed('CA', 'ca-quebec-province', 'Montreal', 'Quebec', 45.5017, -73.5673),
  'ca-quebec-city': seed('CA', 'ca-quebec-city', 'Quebec City', 'Quebec', 46.8139, -71.208),
  'ca-british-columbia': seed('CA', 'ca-british-columbia', 'Whistler', 'British Columbia', 50.1163, -122.9574),
  'ca-british-columbia-vancouver': seed('CA', 'ca-british-columbia-vancouver', 'Vancouver', 'British Columbia', 49.2827, -123.1207),
  'ca-alberta': seed('CA', 'ca-alberta', 'Calgary', 'Alberta', 51.0447, -114.0719),
  'ca-alberta-edmonton': seed('CA', 'ca-alberta-edmonton', 'Edmonton', 'Alberta', 53.5461, -113.4938),
  'au-east': seed('AU', 'au-east', 'Sydney', 'East Coast', -33.8688, 151.2093),
  'au-east-canberra': seed('AU', 'au-east-canberra', 'Canberra', 'East Coast', -35.2809, 149.13),
  'au-ne': seed('AU', 'au-ne', 'Brisbane', 'Northeast', -27.4698, 153.0251),
  'au-ne-cairns': seed('AU', 'au-ne-cairns', 'Cairns', 'Northeast', -16.9186, 145.7781),
  'au-south': seed('AU', 'au-south', 'Melbourne', 'South', -37.8136, 144.9631),
  'au-south-adelaide': seed('AU', 'au-south-adelaide', 'Adelaide', 'South', -34.9285, 138.6007),
  'au-west': seed('AU', 'au-west', 'Perth', 'West', -31.9505, 115.8605),
  'au-west-albany': seed('AU', 'au-west-albany', 'Albany', 'West', -35.0269, 117.8839),
  'au-north': seed('AU', 'au-north', 'Darwin', 'Tropical North', -12.4634, 130.8456),
  'au-north-broome': seed('AU', 'au-north-broome', 'Broome', 'Tropical North', -17.9614, 122.2359)
};

const COUNTRY_REGION_KEYS = {
  US: ['us-east', 'us-northeast-buffalo', 'us-south', 'us-southeast-atlanta', 'us-north', 'us-midwest-minneapolis', 'us-central', 'us-south-houston', 'us-southwest', 'us-southwest-albuquerque', 'us-west', 'us-west-sf', 'us-pnw', 'us-rockies', 'us-rockies-slc', 'us-rockies-aspen'],
  CA: ['ca-ontario', 'ca-ontario-ottawa', 'ca-quebec-province', 'ca-quebec-city', 'ca-british-columbia', 'ca-british-columbia-vancouver', 'ca-alberta', 'ca-alberta-edmonton'],
  AU: ['au-east', 'au-east-canberra', 'au-ne', 'au-ne-cairns', 'au-south', 'au-south-adelaide', 'au-west', 'au-west-albany', 'au-north', 'au-north-broome']
};

const WEATHER_CODES = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Depositing rime fog', '🌫️'],
  51: ['Light drizzle', '🌧️'],
  53: ['Moderate drizzle', '🌧️'],
  55: ['Dense drizzle', '🌧️'],
  61: ['Slight rain', '🌧️'],
  63: ['Moderate rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Light freezing rain', '🌧️'],
  67: ['Heavy freezing rain', '🌧️'],
  71: ['Slight snow', '❄️'],
  73: ['Moderate snow', '❄️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '❄️'],
  80: ['Slight rain showers', '🌦️'],
  81: ['Moderate rain showers', '🌦️'],
  82: ['Violent rain showers', '🌦️'],
  85: ['Slight snow showers', '🌨️'],
  86: ['Heavy snow showers', '🌨️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm w/ slight hail', '⛈️'],
  99: ['Thunderstorm w/ heavy hail', '⛈️']
};

function round(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function generatedAt() {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function addDays(date, days) {
  const dt = new Date(`${date}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function previousYearDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const previousYear = year - 1;
  const lastDay = new Date(Date.UTC(previousYear, month, 0)).getUTCDate();
  return previousYear + '-' +
    String(month).padStart(2, '0') + '-' +
    String(Math.min(day, lastDay)).padStart(2, '0');
}

function monthStart(date) {
  return `${date.slice(0, 7)}-01`;
}

function minDate(a, b) {
  return a < b ? a : b;
}

function celsiusFromFahrenheit(fahrenheit) {
  return Math.round((fahrenheit - 32) * 5 / 9);
}

function weatherInfo(code) {
  return WEATHER_CODES[Number(code)] || ['Unknown', '?'];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, regionKey, label) {
  const delays = [1000, 3000, 7000];
  let lastError;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'weather-monitor-github-actions'
        }
      });

      if (response.ok) {
        return await response.json();
      }

      const body = await response.text().catch(() => '');
      lastError = new Error(`${label} request failed for ${regionKey}: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 240)}` : ''}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < delays.length) {
      console.warn(`${label} request retry ${attempt + 1}/${delays.length} for ${regionKey}: ${lastError.message}`);
      await sleep(delays[attempt]);
    }
  }

  throw lastError;
}
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
function buildAlerts(current, daily) {
  const alerts = [];
  const temp = current.temperature;
  const precipMax = Math.max(...(daily.precipitation || []).map((value) => Number(value) || 0));
  const snowfallTotal = (daily.snowfall || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const gustMax = Math.max(...(daily.windgusts_max || []).map((value) => Number(value) || 0));

  if (temp != null && temp >= 95) {
    alerts.push(`Heat Warning — ${Math.round(temp)}F (${celsiusFromFahrenheit(temp)}C)`);
  }

  if (precipMax >= 1) {
    alerts.push(`Heavy Rain — ${precipMax.toFixed(1)} in`);
  }

  if (gustMax >= 45) {
    alerts.push(`High Wind — gusts ${Math.round(gustMax)} mph`);
  }

  if (snowfallTotal >= 1) {
    alerts.push(`Snowfall - ${snowfallTotal.toFixed(1)} in / 7 days`);
  }

  return alerts;
}

function buildUrl(region) {
  const params = new URLSearchParams({
    latitude: String(region.lat),
    longitude: String(region.lon),
    current: [
      'temperature_2m',
      'wind_speed_10m',
      'wind_direction_10m',
      'weather_code',
      'snow_depth'
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'snowfall_sum',
      'wind_speed_10m_max',
      'wind_gusts_10m_max'
    ].join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: '7'
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function buildArchiveUrl(region, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: String(region.lat),
    longitude: String(region.lon),
    start_date: startDate,
    end_date: endDate,
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'snowfall_sum',
      'wind_speed_10m_max',
      'wind_gusts_10m_max'
    ].join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto'
  });

  return `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
}

function dailyEntry(date, code, max, min, precip, snowfall, wind, gust, source) {
  const [weather_desc, weather_icon] = weatherInfo(code);
  return {
    date,
    weathercode: code == null ? null : Number(code),
    weather_desc,
    weather_icon,
    temp_max: round(max),
    temp_min: round(min),
    precipitation: round(precip, 3),
    snowfall: round(snowfall, 3),
    windspeed_max: round(wind),
    windgusts_max: round(gust),
    source
  };
}

async function fetchDailyArchive(region, startDate, endDate) {
  if (endDate < startDate) return {};

  const payload = await fetchJsonWithRetry(
    buildArchiveUrl(region, startDate, endDate),
    region.region_key,
    'Open-Meteo archive'
  );
  const daily = payload.daily || {};
  const dates = daily.time || [];

  return Object.fromEntries(dates.map((date, index) => [
    date,
    dailyEntry(
      date,
      daily.weather_code?.[index],
      daily.temperature_2m_max?.[index],
      daily.temperature_2m_min?.[index],
      daily.precipitation_sum?.[index],
      daily.snowfall_sum?.[index],
      daily.wind_speed_10m_max?.[index],
      daily.wind_gusts_10m_max?.[index],
      'archive'
    )
  ]));
}

async function fetchRegion(region) {
  const payload = await fetchJsonWithRetry(
    buildUrl(region),
    region.region_key,
    'Open-Meteo forecast'
  );
  const code = payload.current?.weather_code;
  const [weather_desc, weather_icon] = weatherInfo(code);

  const current = {
    temperature: round(payload.current?.temperature_2m),
    windspeed: round(payload.current?.wind_speed_10m),
    winddirection: payload.current?.wind_direction_10m == null ? null : Math.round(payload.current.wind_direction_10m),
    weathercode: code == null ? null : Number(code),
    snow_depth: round(payload.current?.snow_depth, 3),
    weather_desc,
    weather_icon,
    time: payload.current?.time || null
  };

  const daily = {
    dates: payload.daily?.time || [],
    temp_max: (payload.daily?.temperature_2m_max || []).map((value) => round(value)),
    temp_min: (payload.daily?.temperature_2m_min || []).map((value) => round(value)),
    precipitation: (payload.daily?.precipitation_sum || []).map((value) => round(value, 3)),
    snowfall: (payload.daily?.snowfall_sum || []).map((value) => round(value, 3)),
    weathercode: (payload.daily?.weather_code || []).map((value) => Number(value)),
    windspeed_max: (payload.daily?.wind_speed_10m_max || []).map((value) => round(value)),
    windgusts_max: (payload.daily?.wind_gusts_10m_max || []).map((value) => round(value))
  };

  if (daily.dates.length !== 7) {
    throw new Error(`Expected 7 daily rows for ${region.region_key}, received ${daily.dates.length}`);
  }

  return {
    city: region.city,
    region: region.region,
    region_key: region.region_key,
    country: region.country,
    country_name: region.country_name,
    country_flag: region.country_flag,
    lat: region.lat,
    lon: region.lon,
    current,
    daily,
    alerts: buildAlerts(current, daily)
  };
}

function forecastArchiveEntries(region) {
  const daily = region.daily || {};
  const dates = daily.dates || [];

  return Object.fromEntries(dates.map((date, index) => [
    date,
    dailyEntry(
      date,
      daily.weathercode?.[index],
      daily.temp_max?.[index],
      daily.temp_min?.[index],
      daily.precipitation?.[index],
      daily.snowfall?.[index],
      daily.windspeed_max?.[index],
      daily.windgusts_max?.[index],
      date <= todayUtc() ? 'forecast-current' : 'forecast'
    )
  ]));
}

function orderedRegionSeeds(data) {
  const regions = data.today_data?.regions || {};
  const keys = Object.values(COUNTRY_REGION_KEYS).flat();
  return keys.map((key) => REGION_SEEDS[key] || regions[key]).filter(Boolean);
}

function nextCountries(data) {
  return Object.fromEntries(Object.entries(data.countries || {}).map(([countryKey, country]) => [
    countryKey,
    {
      ...country,
      region_keys: COUNTRY_REGION_KEYS[countryKey] || country.region_keys || []
    }
  ]));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const data = JSON.parse(await fs.readFile(DATA_JSON, 'utf8'));
  const seeds = orderedRegionSeeds(data);

  if (!seeds.length) {
    throw new Error('No region metadata found in weather data.');
  }

  const fetched = await mapWithConcurrency(seeds, 4, async (seed) => {
    try {
      return await fetchRegion(seed);
    } catch (error) {
      const fallback = data.today_data?.regions?.[seed.region_key];
      if (!fallback) throw error;
      console.warn(`Using stale weather data for ${seed.region_key}: ${error.message}`);
      return { ...fallback, stale: true };
    }
  });
  const freshCount = fetched.filter((region) => !region.stale).length;

  if (freshCount === 0) {
    throw new Error('All Open-Meteo forecast requests failed; refusing to publish a fully stale snapshot.');
  }

  const regions = Object.fromEntries(fetched.map((region) => [region.region_key, region]));
  const snapshotDate = todayUtc();
  const archiveStart = minDate(monthStart(snapshotDate), addDays(snapshotDate, -30));
  const archiveEnd = addDays(snapshotDate, -1);
  const archiveEntries = await mapWithConcurrency(fetched, 3, async (region) => {
    const existing = (((data.daily_archive || {}).regions || {})[region.region_key] || {});
    let history = {};

    try {
      history = await fetchDailyArchive(region, archiveStart, archiveEnd);
    } catch (error) {
      console.warn(`Keeping existing archive for ${region.region_key}: ${error.message}`);
    }

    const forecast = forecastArchiveEntries(region);
    return [region.region_key, {
      ...existing,
      ...history,
      [snapshotDate]: forecast[snapshotDate] || history[snapshotDate] || existing[snapshotDate]
    }];
  });
  const comparisonEnd = addDays(snapshotDate, 6);
  const yearAgoStart = previousYearDate(snapshotDate);
  const yearAgoEnd = addDays(yearAgoStart, 6);
  const yearAgoEntries = await mapWithConcurrency(fetched, 3, async (region) => {
    const existingRange = (data.year_ago || {}).range || {};
    const existing = (((data.year_ago || {}).regions || {})[region.region_key] || {});

    try {
      return [
        region.region_key,
        await fetchDailyArchive(region, yearAgoStart, yearAgoEnd)
      ];
    } catch (error) {
      const canReuse = existingRange.start === yearAgoStart && existingRange.end === yearAgoEnd;
      console.warn(`Keeping existing year-ago data for ${region.region_key}: ${error.message}`);
      return [region.region_key, canReuse ? existing : {}];
    }
  });
  const yearAgoRegions = Object.fromEntries(yearAgoEntries);
  const yearAgoRegionCount = Object.values(yearAgoRegions).filter((entries) => {
    return Object.keys(entries).length > 0;
  }).length;

  const snapshot = {
    generated_at: generatedAt(),
    regions
  };

  const nextData = {
    ...data,
    today: snapshotDate,
    today_data: snapshot,
    history: {
      ...(data.history || {}),
      [snapshotDate]: snapshot
    },
    daily_archive: {
      generated_at: snapshot.generated_at,
      range: {
        start: archiveStart,
        end: snapshotDate
      },
      regions: Object.fromEntries(archiveEntries)
    },
    year_ago: {
      generated_at: snapshot.generated_at,
      range: {
        current_start: snapshotDate,
        current_end: comparisonEnd,
        start: yearAgoStart,
        end: yearAgoEnd
      },
      regions: yearAgoRegions
    },
    countries: nextCountries(data),
    weather_codes: Object.fromEntries(
      Object.entries(WEATHER_CODES).map(([key, value]) => [key, value])
    )
  };

  const historyDates = Object.keys(nextData.history).sort();
  console.log(JSON.stringify({
    dryRun,
    today: nextData.today,
    generated_at: snapshot.generated_at,
    history_count: historyDates.length,
    first_history_date: historyDates[0],
    last_history_date: historyDates[historyDates.length - 1],
    daily_archive_start: archiveStart,
    daily_archive_end: snapshotDate,
    region_count: Object.keys(regions).length,
    fresh_region_count: freshCount,
    stale_region_count: fetched.length - freshCount,
    year_ago_start: yearAgoStart,
    year_ago_end: yearAgoEnd,
    year_ago_region_count: yearAgoRegionCount
  }, null, 2));

  if (dryRun) return;

  await fs.writeFile(DATA_JSON, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
  await fs.writeFile(DATA_JS, `window.WEATHER_DATA = ${JSON.stringify(nextData)};\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
