(function () {
  var DATA = window.WEATHER_DATA;
  if (!DATA) {
    document.body.innerHTML = '<main class="shell">Weather data failed to load.</main>';
    return;
  }

  var state = {
    country: 'US',
    date: DATA.today,
    forecastRegion: null
  };

  var countries = DATA.countries || {};
  var weatherCodes = DATA.weather_codes || {};

  var els = {
    countryTabs: document.getElementById('countryTabs'),
    datePicker: document.getElementById('datePicker'),
    prevDate: document.getElementById('prevDate'),
    nextDate: document.getElementById('nextDate'),
    todayButton: document.getElementById('todayButton'),
    coverageText: document.getElementById('coverageText'),
    alertBand: document.getElementById('alertBand'),
    alertList: document.getElementById('alertList'),
    summaryGrid: document.getElementById('summaryGrid'),
    countryEyebrow: document.getElementById('countryEyebrow'),
    cardsTitle: document.getElementById('cardsTitle'),
    regionCards: document.getElementById('regionCards'),
    forecastTabs: document.getElementById('forecastTabs'),
    forecastWrap: document.getElementById('forecastWrap'),
    statDates: document.getElementById('statDates'),
    statCities: document.getElementById('statCities'),
    statGenerated: document.getElementById('statGenerated')
  };

  function dates() {
    var list = Object.keys(DATA.history || {}).sort();
    if (DATA.today_data && list.indexOf(DATA.today) < 0) {
      list.push(DATA.today);
      list.sort();
    }
    return list;
  }

  function getSnapshot(date) {
    if (date === DATA.today && DATA.today_data) return DATA.today_data;
    return (DATA.history || {})[date] || null;
  }

  function regionKeys(country) {
    return countries[country] ? countries[country].region_keys || [] : [];
  }

  function fmtF(value) {
    return value == null ? '--' : Math.round(value) + '°F';
  }

  function fmtC(value) {
    return value == null ? '--' : Math.round((value - 32) * 5 / 9) + '°C';
  }

  function fmtFC(value) {
    return value == null ? '--' : fmtF(value) + ' / ' + fmtC(value);
  }

  function fmtMph(value) {
    return value == null ? '--' : Math.round(value) + ' mph';
  }

  function fmtIn(value) {
    return value == null ? '--' : Number(value).toFixed(2) + ' in';
  }

  function weather(code) {
    return weatherCodes[String(code)] || ['Unknown', '?'];
  }

  function fmtDate(date) {
    var dt = new Date(date + 'T12:00:00Z');
    return dt.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC'
    });
  }

  function fmtLocalTime(value) {
    if (!value) return '--';
    var parts = value.split('T');
    return parts.length === 2 ? parts[0] + ' ' + parts[1] : value;
  }

  function renderHeader() {
    var allDates = dates();
    var first = allDates[0] || '--';
    var last = allDates[allDates.length - 1] || '--';
    var regions = Object.keys((DATA.today_data || {}).regions || {}).length;
    els.statDates.textContent = allDates.length + ' 天';
    els.statCities.textContent = regions;
    els.statGenerated.textContent = (DATA.today_data && DATA.today_data.generated_at) || '--';
    els.coverageText.textContent = '历史范围：' + first + ' 至 ' + last;
  }

  function renderCountryTabs() {
    els.countryTabs.innerHTML = Object.keys(countries).map(function (key) {
      var item = countries[key];
      var active = key === state.country ? ' active' : '';
      return '<button type="button" class="' + active + '" data-country="' + key + '">' +
        '<span class="country-code">' + key + '</span> ' + item.name +
        '</button>';
    }).join('');
  }

  function renderDatePicker() {
    els.datePicker.innerHTML = dates().map(function (date) {
      var selected = date === state.date ? ' selected' : '';
      return '<option value="' + date + '"' + selected + '>' + date + ' · ' + fmtDate(date) + '</option>';
    }).join('');
  }

  function getCountryRows(snapshot) {
    var regions = snapshot && snapshot.regions ? snapshot.regions : {};
    return regionKeys(state.country).map(function (key) {
      return regions[key];
    }).filter(Boolean);
  }

  function renderSummary(snapshot) {
    var rows = getCountryRows(snapshot);
    var hottest = rows.reduce(function (best, row) {
      if (!row.current || row.current.temperature == null) return best;
      if (!best || row.current.temperature > best.current.temperature) return row;
      return best;
    }, null);
    var wettest = rows.reduce(function (best, row) {
      var total = ((row.daily || {}).precipitation || []).reduce(function (sum, value) {
        return sum + (value || 0);
      }, 0);
      if (!best || total > best.total) return { row: row, total: total };
      return best;
    }, null);
    var alertCount = rows.reduce(function (sum, row) {
      return sum + ((row.alerts || []).length);
    }, 0);

    els.summaryGrid.innerHTML = [
      summaryItem('最高当前温度', hottest ? fmtFC(hottest.current.temperature) : '--', hottest ? hottest.city : '--'),
      summaryItem('7 日降水最多', wettest ? fmtIn(wettest.total) : '--', wettest ? wettest.row.city : '--'),
      summaryItem('预警数量', String(alertCount), alertCount ? '需要关注' : '当前国家无预警')
    ].join('');
  }

  function summaryItem(label, value, note) {
    return '<div class="summary-item">' +
      '<div class="label">' + label + '</div>' +
      '<div class="value">' + value + '</div>' +
      '<div class="note">' + note + '</div>' +
      '</div>';
  }

  function renderAlerts(snapshot) {
    var alerts = [];
    getCountryRows(snapshot).forEach(function (row) {
      (row.alerts || []).forEach(function (alert) {
        alerts.push(row.city + ' · ' + row.region + ': ' + alert);
      });
    });

    els.alertBand.classList.toggle('hidden', alerts.length === 0);
    els.alertList.innerHTML = alerts.map(function (alert) {
      return '<div class="alert-item">⚠ ' + alert + '</div>';
    }).join('');
  }

  function renderCards(snapshot) {
    var country = countries[state.country] || {};
    var rows = getCountryRows(snapshot);
    els.countryEyebrow.textContent = country.name || state.country;
    els.cardsTitle.textContent = (country.name || state.country) + ' 当前天气';

    if (!rows.length) {
      els.regionCards.innerHTML = '<div class="weather-card">No data</div>';
      return;
    }

    els.regionCards.innerHTML = rows.map(function (row) {
      var current = row.current || {};
      var hasAlerts = (row.alerts || []).length > 0;
      return '<article class="weather-card' + (hasAlerts ? ' has-alerts' : '') + '">' +
        '<div class="city-row">' +
        '<div><div class="region-badge">' + row.region + '</div><div class="city-name">' + row.city + '</div></div>' +
        '<div class="weather-icon" aria-hidden="true">' + (current.weather_icon || '?') + '</div>' +
        '</div>' +
        '<div class="temp-main">' + fmtF(current.temperature) + '</div>' +
        '<div class="temp-c">' + fmtC(current.temperature) + '</div>' +
        '<div class="condition">' + (current.weather_desc || '--') + '</div>' +
        '<div class="details">' +
        '<span>Wind</span><strong>' + fmtMph(current.windspeed) + '</strong>' +
        '<span>Direction</span><strong>' + (current.winddirection == null ? '--' : current.winddirection + '°') + '</strong>' +
        '<span>Local time</span><strong>' + fmtLocalTime(current.time) + '</strong>' +
        '</div>' +
        (hasAlerts ? '<div class="card-alert">⚠ ' + row.alerts.join(' · ') + '</div>' : '') +
        '</article>';
    }).join('');
  }

  function renderForecast(snapshot) {
    var rows = getCountryRows(snapshot).filter(function (row) {
      return row.daily && row.daily.dates;
    });
    if (!rows.length) {
      els.forecastTabs.innerHTML = '';
      els.forecastWrap.innerHTML = '<div class="forecast-empty">No forecast data</div>';
      return;
    }

    if (!state.forecastRegion || !rows.some(function (row) { return row.region_key === state.forecastRegion; })) {
      state.forecastRegion = rows[0].region_key;
    }

    els.forecastTabs.innerHTML = rows.map(function (row) {
      var active = row.region_key === state.forecastRegion ? ' active' : '';
      return '<button type="button" class="' + active + '" data-forecast="' + row.region_key + '">' + row.city + '</button>';
    }).join('');

    var selected = rows.filter(function (row) { return row.region_key === state.forecastRegion; })[0];
    var daily = selected.daily;
    var body = daily.dates.map(function (date, index) {
      var code = daily.weathercode ? daily.weathercode[index] : 0;
      var w = weather(code);
      var precip = daily.precipitation ? daily.precipitation[index] : null;
      return '<tr>' +
        '<td><strong>' + fmtDate(date) + '</strong><br><span class="muted">' + date + '</span></td>' +
        '<td class="forecast-icon">' + w[1] + '</td>' +
        '<td>' + w[0] + '</td>' +
        '<td>' + fmtFC(daily.temp_max ? daily.temp_max[index] : null) + '</td>' +
        '<td>' + fmtFC(daily.temp_min ? daily.temp_min[index] : null) + '</td>' +
        '<td class="' + (precip != null && precip >= 1 ? 'precip-high' : '') + '">' + fmtIn(precip) + '</td>' +
        '<td>' + fmtMph(daily.windspeed_max ? daily.windspeed_max[index] : null) + '</td>' +
        '</tr>';
    }).join('');

    els.forecastWrap.innerHTML = '<table class="forecast-table">' +
      '<thead><tr><th>Date</th><th></th><th>Weather</th><th>High</th><th>Low</th><th>Precip</th><th>Wind</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table>';
  }

  function render() {
    var snapshot = getSnapshot(state.date);
    renderHeader();
    renderCountryTabs();
    renderDatePicker();
    renderSummary(snapshot);
    renderAlerts(snapshot);
    renderCards(snapshot);
    renderForecast(snapshot);
  }

  els.countryTabs.addEventListener('click', function (event) {
    var button = event.target.closest('[data-country]');
    if (!button) return;
    state.country = button.getAttribute('data-country');
    state.forecastRegion = null;
    render();
  });

  els.forecastTabs.addEventListener('click', function (event) {
    var button = event.target.closest('[data-forecast]');
    if (!button) return;
    state.forecastRegion = button.getAttribute('data-forecast');
    renderForecast(getSnapshot(state.date));
  });

  els.datePicker.addEventListener('change', function () {
    state.date = els.datePicker.value;
    state.forecastRegion = null;
    render();
  });

  els.prevDate.addEventListener('click', function () {
    var allDates = dates();
    var index = allDates.indexOf(state.date);
    if (index > 0) {
      state.date = allDates[index - 1];
      state.forecastRegion = null;
      render();
    }
  });

  els.nextDate.addEventListener('click', function () {
    var allDates = dates();
    var index = allDates.indexOf(state.date);
    if (index >= 0 && index < allDates.length - 1) {
      state.date = allDates[index + 1];
      state.forecastRegion = null;
      render();
    }
  });

  els.todayButton.addEventListener('click', function () {
    state.date = DATA.today;
    state.forecastRegion = null;
    render();
  });

  render();
})();
