import fs from 'node:fs/promises';

const DATA_JSON = 'assets/weather-data.json';
const DATA_JS = 'assets/weather-data.js';

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

function celsiusFromFahrenheit(fahrenheit) {
  return Math.round((fahrenheit - 32) * 5 / 9);
}

function weatherInfo(code) {
  return WEATHER_CODES[Number(code)] || ['Unknown', '?'];
}

function buildAlerts(current, daily) {
  const alerts = [];
  const temp = current.temperature;
  const precipMax = Math.max(...(daily.precipitation || []).map((value) => Number(value) || 0));
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
      'weather_code'
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
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

async function fetchRegion(region) {
  const response = await fetch(buildUrl(region), {
    headers: {
      accept: 'application/json',
      'user-agent': 'weather-monitor-github-actions'
    }
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed for ${region.region_key}: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const code = payload.current?.weather_code;
  const [weather_desc, weather_icon] = weatherInfo(code);

  const current = {
    temperature: round(payload.current?.temperature_2m),
    windspeed: round(payload.current?.wind_speed_10m),
    winddirection: payload.current?.wind_direction_10m == null ? null : Math.round(payload.current.wind_direction_10m),
    weathercode: code == null ? null : Number(code),
    weather_desc,
    weather_icon,
    time: payload.current?.time || null
  };

  const daily = {
    dates: payload.daily?.time || [],
    temp_max: (payload.daily?.temperature_2m_max || []).map((value) => round(value)),
    temp_min: (payload.daily?.temperature_2m_min || []).map((value) => round(value)),
    precipitation: (payload.daily?.precipitation_sum || []).map((value) => round(value, 3)),
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

function orderedRegionSeeds(data) {
  const regions = data.today_data?.regions || {};
  const keys = Object.values(data.countries || {}).flatMap((country) => country.region_keys || []);
  return keys.map((key) => regions[key]).filter(Boolean);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const data = JSON.parse(await fs.readFile(DATA_JSON, 'utf8'));
  const seeds = orderedRegionSeeds(data);

  if (!seeds.length) {
    throw new Error('No region metadata found in weather data.');
  }

  const fetched = await Promise.all(seeds.map(fetchRegion));
  const regions = Object.fromEntries(fetched.map((region) => [region.region_key, region]));
  const snapshotDate = todayUtc();
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
    countries: data.countries,
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
    region_count: Object.keys(regions).length
  }, null, 2));

  if (dryRun) return;

  await fs.writeFile(DATA_JSON, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
  await fs.writeFile(DATA_JS, `window.WEATHER_DATA = ${JSON.stringify(nextData)};\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
