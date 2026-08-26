# North America Weather Monitor

Static GitHub Pages weather monitor for ecommerce operations, with automated forecasts, snapshot history, and a rolling daily weather calendar.

## Data

The seed data was captured from:

`https://59011d4df1f24e5d920841470fc11952.gz5.agentos-app.net`

Data files:

- `assets/weather-data.json`: readable JSON archive
- `assets/weather-data.js`: same data exposed as `window.WEATHER_DATA` for static hosting
- `scripts/update-weather-data.mjs`: daily Open-Meteo updater used by GitHub Actions
- `daily_archive`: rolling 30-day daily archive used by the weather calendar

Canada is monitored by priority sales provinces: Ontario (Toronto), Quebec (Montreal), British Columbia (Whistler), and Alberta (Calgary).

Current coverage:

- Countries: United States, Canada, Australia
- Monitoring points: 16
- Snapshot history: stored in `history[YYYY-MM-DD]`
- Daily calendar archive: rolling 30 days, backfilled for August 2026

## Automatic Updates

The workflow at `.github/workflows/pages.yml` runs every day at `00:35 UTC` and can also be started manually from the Actions tab.

Scheduled/manual runs:

1. Fetch current weather and 7-day forecasts for all 16 monitoring points from Open-Meteo Forecast API.
2. Fetch rolling 30-day daily weather from Open-Meteo Historical Weather API.
3. Save the new UTC snapshot as `today_data`.
4. Preserve the snapshot in `history[YYYY-MM-DD]`.
5. Maintain `daily_archive` for the weather calendar.
6. Commit updated data files back to `main`.
7. Deploy the refreshed site to GitHub Pages.

Pushes to `main` deploy the static site without fetching fresh weather.

## GitHub Pages

This site has no build step. In repository settings, set Pages to use GitHub Actions if it is not already enabled.
