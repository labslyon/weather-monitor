# Cross-Market Operations Dashboard

Static GitHub Pages operations dashboard for ecommerce teams. It combines regional weather forecasts, representative monitoring points, snapshot history, rolling weather calendars, and USD/CAD/AUD exchange-rate trends against CNY.

## Data

The seed data was captured from:

`https://59011d4df1f24e5d920841470fc11952.gz5.agentos-app.net`

Data files:

- `assets/weather-data.json`: readable JSON archive
- `assets/weather-data.js`: same data exposed as `window.WEATHER_DATA` for static hosting
- `scripts/update-weather-data.mjs`: daily Open-Meteo updater used by GitHub Actions
- `daily_archive`: rolling 30-day daily archive used by the weather calendar
- `assets/fx-data.json`: structured ECB reference-rate archive for the current year
- `assets/fx-data.js`: same exchange-rate data exposed as `window.FX_DATA`
- `scripts/update-fx-data.mjs`: ECB updater and EUR-based cross-rate calculator

Exchange rates use European Central Bank euro reference rates to calculate USD/CNY, CAD/CNY, and AUD/CNY cross rates. Completed-month points use the final available ECB working day; the current-month chart keeps each published working-day value. These are reference rates for trend analysis, not bank settlement or transaction quotes.

Canada is monitored by priority sales provinces with paired representative points: Ontario (Toronto and Ottawa), Quebec (Montreal and Quebec City), British Columbia (Vancouver and Whistler), and Alberta (Calgary and Edmonton).

The United States is grouped into seven operational regions with two or three points per region. The West Coast uses Los Angeles, San Francisco, and Seattle; the Rocky Mountains use Denver, Salt Lake City, and Aspen. Australia uses two points for each of five operational climate regions.

Regional values use representative-point medians for typical temperature, min/max ranges for local variation, and maximum rain or snow exposure for operational alerts. Forecast data includes 7-day snowfall totals and current snow depth.

Current coverage:

- Countries: United States, Canada, Australia
- Operational regions: 16
- Representative monitoring points: 34
- Snapshot history: stored in `history[YYYY-MM-DD]`
- Daily calendar archive: rolling 30 days, backfilled for August 2026
- Year-over-year archive: matching seven-day period from the previous year

## Automatic Updates

The workflow at `.github/workflows/pages.yml` runs every day at `09:17 Asia/Shanghai` and can also be started manually from the Actions tab. The non-hourly minute reduces the chance of GitHub Actions schedule congestion.

Scheduled/manual runs:

1. Fetch current weather and 7-day forecasts for all 34 monitoring points from Open-Meteo Forecast API.
2. Fetch rolling 30-day daily weather from Open-Meteo Historical Weather API.
3. Save the new UTC snapshot as `today_data`.
4. Preserve the snapshot in `history[YYYY-MM-DD]`.
5. Maintain `daily_archive` for the weather calendar.
6. Fetch ECB reference rates and calculate USD/CNY, CAD/CNY, and AUD/CNY.
7. Refresh completed month-end and current-month daily exchange-rate series.
8. Commit updated data files back to `main`.
9. Deploy the refreshed site to GitHub Pages.

Pushes to `main` deploy the static site without fetching fresh weather.

## WeCom Daily Digest

The scheduled workflow sends one Markdown operations digest after data refresh and Pages deployment. The digest includes all three CNY exchange-rate pairs, country-level weather ranges, notable rain/cooling/snow signals, category guidance, and a dashboard link.

Configure the full group-robot webhook as the repository Actions secret `WECOM_WEBHOOK_URL`. The webhook is read only at runtime and must never be committed to the repository. Manual workflow runs send the digest only when the `send_wecom` input is enabled.

Preview the generated message without sending it:

`node scripts/send-wecom-digest.mjs --preview`

## GitHub Pages

This site has no build step. In repository settings, set Pages to use GitHub Actions if it is not already enabled.
