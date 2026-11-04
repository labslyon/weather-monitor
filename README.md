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

The workflow at `.github/workflows/pages.yml` refreshes the site every day at `08:30 Asia/Shanghai`. It can also be started manually from the Actions tab.

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

The active weather and FX digest is sent by the Tencent Cloud Function in `tencent-scf/`, not by GitHub Actions. Its robot webhooks are stored only in Tencent Cloud environment variables. Keep the legacy GitHub sender disabled to avoid duplicate messages.

See `tencent-scf/README.md` for the current deployment and `DRY_RUN` instructions.

## News Prototype

The news page at `news/` is a fixed-source, rule-based prototype. It currently reads public data from Federal Register, CPSC, NWS, Amazon Seller News, USTR, and the Port of Los Angeles. A separately verified rolling watchlist adds time-sensitive Amazon policy and labeled logistics-industry advisories, while a 60-day calendar covers selected cycling events and OPM federal holidays. It does not use a search API or an AI model.

Generated files:

- `assets/news-data.json`: readable briefing history and source health
- `assets/news-data.js`: static browser payload
- `scripts/update-news-data.mjs`: collection, U.S. Eastern date windows, filtering, deduplication, and holiday notices
- `state/news-watchlist.json`: verified ongoing items and selected event registry, including effective dates and deadlines
- `assets/news-app.js`: news page rendering

Daily selection combines two time dimensions: newly published items in the target U.S. Eastern date window, and previously published items that are still active, newly effective, or approaching a deadline. Industry advisories are labeled separately from official confirmations and are never described as confirmed shutdowns unless an official source says so.

The news collector runs from `.github/workflows/news.yml` at 16:00 Asia/Shanghai, Monday through Friday. Monday editions cover the previous U.S. Friday through Sunday; other weekday editions cover the previous U.S. Eastern date. The workflow updates the site archive but does not send WeCom messages. Run a no-write local preview with:

`npm run news:preview`

Generate local preview data with:

`npm run news:update`

## GitHub Pages

This site has no build step. In repository settings, set Pages to use GitHub Actions if it is not already enabled.
