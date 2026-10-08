import fs from 'node:fs/promises';
import fsSync from 'node:fs';

const DATA_JSON = 'assets/weather-data.json';
const DATA_JS = 'assets/weather-data.js';
const ADMIN_MAPS_JS = 'assets/weather-admin-maps.js';
const DEFAULT_API_URL = 'https://api.open-meteo.com/v1/forecast';

const GRID_SPECS = {
  US: [
    { bbox: [-124.8, -66.5, 24.2, 49.7], step: 2.3 },
    { bbox: [-170, -130, 51, 72], step: 3.2 },
    { bbox: [-161.2, -154.5, 18.5, 22.8], step: 1 }
  ],
  CA: [
    { bbox: [-141.2, -52.2, 41.6, 84], step: 3.4 }
  ],
  AU: [
    { bbox: [112.5, 154.2, -44, -10], step: 2.1 }
  ]
};

function readAssignedJson(path) {
  const source = fsSync.readFileSync(path, 'utf8');
  const assignment = source.indexOf('=');
  if (assignment < 0) throw new Error(`Invalid assigned JSON file: ${path}`);
  return JSON.parse(source.slice(assignment + 1).trim().replace(/;\s*$/, ''));
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point, polygon) {
  if (!polygon.length || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

function pointOnCountry(point, featureCollection) {
  return featureCollection.features.some((feature) => pointInGeometry(point, feature.geometry));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function buildCountryGrid(countryKey, featureCollection) {
  const points = [];
  const seen = new Set();

  GRID_SPECS[countryKey].forEach(({ bbox, step }) => {
    const [minLon, maxLon, minLat, maxLat] = bbox;
    for (let lat = minLat + step / 2; lat <= maxLat; lat += step) {
      for (let lon = minLon + step / 2; lon <= maxLon; lon += step) {
        const point = [round(lon), round(lat)];
        const key = point.join(',');
        if (!seen.has(key) && pointOnCountry(point, featureCollection)) {
          seen.add(key);
          points.push(point);
        }
      }
    }
  });

  return points;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJsonWithRetry(url, label) {
  const delays = [1200, 3000, 6500];
  let lastError;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'weather-monitor-github-actions'
        }
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const error = new Error(`${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 200)}` : ''}`);
        error.rateLimited = response.status === 429;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < delays.length) await sleep(error.rateLimited ? 65000 : delays[attempt]);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${label} failed: ${lastError?.message || 'unknown error'}`);
}

function buildForecastUrl(points) {
  const params = new URLSearchParams({
    latitude: points.map((point) => point[1]).join(','),
    longitude: points.map((point) => point[0]).join(','),
    current: 'temperature_2m',
    temperature_unit: 'celsius',
    timezone: 'GMT',
    forecast_days: '1',
    cell_selection: 'land'
  });
  if (process.env.OPEN_METEO_API_KEY) params.set('apikey', process.env.OPEN_METEO_API_KEY);
  return `${process.env.OPEN_METEO_API_URL || DEFAULT_API_URL}?${params.toString()}`;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function fetchCountryTemperatures(countryKey, points) {
  const batches = chunks(points, 60);
  const fetched = await mapWithConcurrency(batches, 1, async (batch, index) => {
    const payload = await fetchJsonWithRetry(buildForecastUrl(batch), `${countryKey} grid batch ${index + 1}`);
    const responses = Array.isArray(payload) ? payload : [payload];
    if (responses.length !== batch.length) {
      throw new Error(`${countryKey} grid batch ${index + 1} returned ${responses.length}/${batch.length} locations`);
    }
    return batch.map((point, pointIndex) => {
      const temperature = responses[pointIndex]?.current?.temperature_2m;
      if (!Number.isFinite(Number(temperature))) return null;
      return [point[0], point[1], round(temperature, 1)];
    }).filter(Boolean);
  });

  return fetched.flat();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const gridOnly = process.argv.includes('--grid-only');
  const data = JSON.parse(await fs.readFile(DATA_JSON, 'utf8'));
  const adminMaps = readAssignedJson(ADMIN_MAPS_JS);
  const grids = Object.fromEntries(Object.keys(GRID_SPECS).map((countryKey) => {
    const map = adminMaps[countryKey];
    if (!map) throw new Error(`Missing administrative map for ${countryKey}`);
    return [countryKey, buildCountryGrid(countryKey, map)];
  }));

  console.log('Temperature grid points:', Object.fromEntries(
    Object.entries(grids).map(([countryKey, points]) => [countryKey, points.length])
  ));
  if (gridOnly) return;

  const generatedAt = new Date().toISOString();
  const existingCountries = data.temperature_map?.countries || {};
  const countryEntries = await mapWithConcurrency(Object.keys(grids), 1, async (countryKey) => {
    try {
      const points = await fetchCountryTemperatures(countryKey, grids[countryKey]);
      if (points.length < grids[countryKey].length * 0.9) {
        throw new Error(`${countryKey} returned only ${points.length}/${grids[countryKey].length} temperatures`);
      }
      return [countryKey, {
        generated_at: generatedAt,
        point_count: points.length,
        stale: false,
        points
      }];
    } catch (error) {
      const fallback = existingCountries[countryKey];
      if (!fallback?.points?.length) throw error;
      console.warn(`Keeping existing ${countryKey} temperature grid: ${error.message}`);
      return [countryKey, { ...fallback, stale: true }];
    }
  });

  const nextData = {
    ...data,
    temperature_map: {
      generated_at: generatedAt,
      source: 'Open-Meteo',
      unit: '°C',
      countries: Object.fromEntries(countryEntries)
    }
  };

  console.log(JSON.stringify({
    dryRun,
    generated_at: generatedAt,
    countries: Object.fromEntries(countryEntries.map(([key, value]) => [key, {
      point_count: value.point_count,
      stale: value.stale
    }]))
  }, null, 2));

  if (dryRun) return;
  await fs.writeFile(DATA_JSON, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
  await fs.writeFile(DATA_JS, `window.WEATHER_DATA = ${JSON.stringify(nextData)};\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
