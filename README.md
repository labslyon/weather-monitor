# North America Weather Monitor

Static GitHub Pages version of the AgentOS weather monitor with an automated weather archive.

## Data

The seed data was captured from:

`https://59011d4df1f24e5d920841470fc11952.gz5.agentos-app.net`

Data files:

- `assets/weather-data.json`: readable JSON archive
- `assets/weather-data.js`: same data exposed as `window.WEATHER_DATA` for static hosting
- `scripts/update-weather-data.mjs`: daily Open-Meteo updater used by GitHub Actions

Captured archive summary at seed time:

Canada is monitored by priority sales provinces: Ontario (Toronto), Quebec (Montreal), British Columbia (Whistler), and Alberta (Calgary).

- Latest snapshot: `2026-08-24`
- Generated at: `2026-08-24 00:39 UTC`
- Historical dates: 10 snapshots from `2026-08-12` to `2026-08-24`
- Countries: United States, Canada, Australia
- Monitoring points: 16

## Automatic Updates

The workflow at `.github/workflows/pages.yml` runs every day at `00:35 UTC` and can also be started manually from the Actions tab.

Scheduled/manual runs:

1. Fetch current weather and 7-day forecasts for all 16 monitoring points from Open-Meteo.
2. Save the new UTC snapshot as `today_data`.
3. Preserve the snapshot in `history[YYYY-MM-DD]`.
4. Commit updated data files back to `main`.
5. Deploy the refreshed site to GitHub Pages.

Pushes to `main` deploy the static site without fetching fresh weather.

## GitHub Pages

This site has no build step. In repository settings, set Pages to use GitHub Actions if it is not already enabled.


