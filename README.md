# North America Weather Monitor

Static GitHub Pages version of the AgentOS weather monitor.

## Data

The original page data was captured from:

`https://59011d4df1f24e5d920841470fc11952.gz5.agentos-app.net`

Extracted files:

- `assets/weather-data.json`: readable JSON archive
- `assets/weather-data.js`: same data exposed as `window.WEATHER_DATA` for static hosting

Captured archive summary:

- Latest snapshot: `2026-08-24`
- Generated at: `2026-08-24 00:39 UTC`
- Historical dates: 10 snapshots from `2026-08-12` to `2026-08-24`
- Countries: United States, Canada, Australia
- Cities: 15

## GitHub Pages

This site has no build step. The included workflow at `.github/workflows/pages.yml` publishes the static files to GitHub Pages on every push to `main`.

In repository settings, set Pages to use GitHub Actions if it is not already enabled.
