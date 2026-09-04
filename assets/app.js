(function () {
  var DATA = window.WEATHER_DATA;
  if (!DATA) {
    document.body.innerHTML = '<main class="shell">Weather data failed to load.</main>';
    return;
  }

  var state = {
    country: 'US',
    date: DATA.today,
    forecastRegion: null,
    calendarRegion: null,
    calendarMonth: null
  };

  var countries = DATA.countries || {};
  var weatherCodes = DATA.weather_codes || {};
  var weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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
    dailyMetrics: document.getElementById('dailyMetrics'),
    calendarRegionTabs: document.getElementById('calendarRegionTabs'),
    monthTabs: document.getElementById('monthTabs'),
    calendarWrap: document.getElementById('calendarWrap'),
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

  function fmtMonth(monthKey) {
    var dt = new Date(monthKey + '-01T12:00:00Z');
    return dt.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      timeZone: 'UTC'
    });
  }

  function fmtLocalTime(value) {
    if (!value) return '--';
    var parts = value.split('T');
    return parts.length === 2 ? parts[0] + ' ' + parts[1] : value;
  }

  function addDays(date, days) {
    var dt = new Date(date + 'T12:00:00Z');
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  function daysInMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  }

  function monthKey(date) {
    return date ? date.slice(0, 7) : '';
  }

  function dailyArchive(regionKey) {
    return ((((DATA.daily_archive || {}).regions || {})[regionKey]) || {});
  }

  function renderHeader() {
    var allDates = dates();
    var first = allDates[0] || '--';
    var last = allDates[allDates.length - 1] || '--';
    var regions = Object.keys((DATA.today_data || {}).regions || {}).length;
    var archive = DATA.daily_archive || {};
    var archiveText = archive.range ? ' · 月历：' + archive.range.start + ' 至 ' + archive.range.end : '';
    els.statDates.textContent = allDates.length + ' 天';
    els.statCities.textContent = regions;
    els.statGenerated.textContent = (DATA.today_data && DATA.today_data.generated_at) || '--';
    els.coverageText.textContent = '快照：' + first + ' 至 ' + last + archiveText;
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
      var daily = row.daily || {};
      var hasAlerts = (row.alerts || []).length > 0;
      var todayEntry = {
        temp_max: daily.temp_max ? daily.temp_max[0] : null,
        temp_min: daily.temp_min ? daily.temp_min[0] : null,
        precipitation: daily.precipitation ? daily.precipitation[0] : null,
        windspeed_max: daily.windspeed_max ? daily.windspeed_max[0] : null
      };
      var signal = operationalSignal(todayEntry);
      return '<article class="weather-card' + (hasAlerts ? ' has-alerts' : '') + '">' +
        '<div class="city-row">' +
        '<div><div class="region-badge">' + row.region + '</div><div class="city-name">' + row.city + '</div></div>' +
        '<div class="weather-icon" aria-hidden="true">' + (current.weather_icon || '?') + '</div>' +
        '</div>' +
        '<div class="temp-main">' + fmtF(current.temperature) + '</div>' +
        '<div class="temp-c">' + fmtC(current.temperature) + '</div>' +
        '<div class="condition">' + (current.weather_desc || '--') + '</div>' +
        '<div class="signal-row"><span>运营信号</span><strong>' + signal.value + '</strong></div>' +
        '<div class="details">' +
        '<span>Wind</span><strong>' + fmtMph(current.windspeed) + '</strong>' +
        '<span>Direction</span><strong>' + (current.winddirection == null ? '--' : current.winddirection + '°') + '</strong>' +
        '<span>Local time</span><strong>' + fmtLocalTime(current.time) + '</strong>' +
        '</div>' +
        (hasAlerts ? '<div class="card-alert">⚠ ' + row.alerts.join(' · ') + '</div>' : '') +
        '</article>';
    }).join('');
  }

  function operationalSignal(entry) {
    if (!entry) return { value: '--', note: 'No daily data' };
    if (entry.precipitation != null && entry.precipitation >= 0.2) {
      return { value: 'Rain Gear', note: '推防水包、雨衣、鞋套' };
    }
    if (entry.windspeed_max != null && entry.windspeed_max >= 18) {
      return { value: 'Wind Watch', note: '骑行广告谨慎，关注室内/维修' };
    }
    if (entry.temp_max != null && entry.temp_max >= 90) {
      return { value: 'Heat Ride', note: '推补水、防晒、透气装备' };
    }
    if (entry.temp_min != null && entry.temp_min <= 32) {
      return { value: 'Snow / Cold', note: '推滑雪、保暖、手套护具' };
    }
    if (entry.temp_max != null && entry.temp_max >= 60 && entry.temp_max <= 86) {
      return { value: 'Cycling Boost', note: '适合提高骑行类预算' };
    }
    return { value: 'Neutral', note: '维持常规投放' };
  }

  function renderCalendar(snapshot) {
    var rows = getCountryRows(snapshot).filter(function (row) {
      return Object.keys(dailyArchive(row.region_key)).length > 0;
    });

    if (!rows.length) {
      els.calendarRegionTabs.innerHTML = '';
      els.monthTabs.innerHTML = '';
      els.dailyMetrics.innerHTML = '<div class="summary-item">No archive data</div>';
      els.calendarWrap.innerHTML = '';
      return;
    }

    if (!state.calendarRegion || !rows.some(function (row) { return row.region_key === state.calendarRegion; })) {
      state.calendarRegion = state.forecastRegion && rows.some(function (row) { return row.region_key === state.forecastRegion; })
        ? state.forecastRegion
        : rows[0].region_key;
    }

    var selected = rows.filter(function (row) { return row.region_key === state.calendarRegion; })[0];
    var archive = dailyArchive(selected.region_key);
    var availableMonths = Object.keys(archive).map(monthKey).filter(function (value, index, arr) {
      return value && arr.indexOf(value) === index;
    }).sort();

    if (!state.calendarMonth || availableMonths.indexOf(state.calendarMonth) < 0) {
      state.calendarMonth = monthKey(DATA.today) && availableMonths.indexOf(monthKey(DATA.today)) >= 0
        ? monthKey(DATA.today)
        : availableMonths[availableMonths.length - 1];
    }

    els.calendarRegionTabs.innerHTML = rows.map(function (row) {
      var active = row.region_key === state.calendarRegion ? ' active' : '';
      return '<button type="button" class="' + active + '" data-calendar-region="' + row.region_key + '">' + row.city + '</button>';
    }).join('');

    els.monthTabs.innerHTML = availableMonths.map(function (month) {
      var active = month === state.calendarMonth ? ' active' : '';
      return '<button type="button" class="' + active + '" data-calendar-month="' + month + '">' + fmtMonth(month) + '</button>';
    }).join('');

    renderDailyMetrics(selected, archive);
    renderMonthCalendar(selected, archive);
  }

  function renderDailyMetrics(selected, archive) {
    var today = archive[DATA.today];
    var signal = operationalSignal(today);
    var current = selected.current || {};
    els.dailyMetrics.innerHTML = [
      metricItem('今日最高', today ? fmtFC(today.temp_max) : '--', selected.city),
      metricItem('今日最低', today ? fmtFC(today.temp_min) : '--', selected.region),
      metricItem('当前天气', current.weather_desc || (today ? today.weather_desc : '--'), fmtF(current.temperature)),
      metricItem('运营信号', signal.value, signal.note)
    ].join('');
  }

  function metricItem(label, value, note) {
    return '<div class="metric-card">' +
      '<div class="label">' + label + '</div>' +
      '<div class="value">' + value + '</div>' +
      '<div class="note">' + note + '</div>' +
      '</div>';
  }

  function renderMonthCalendar(selected, archive) {
    var parts = state.calendarMonth.split('-').map(Number);
    var year = parts[0];
    var monthIndex = parts[1] - 1;
    var firstDate = state.calendarMonth + '-01';
    var first = new Date(firstDate + 'T12:00:00Z');
    var leading = (first.getUTCDay() + 6) % 7;
    var monthDays = daysInMonth(year, monthIndex);
    var totalCells = Math.max(35, Math.ceil((leading + monthDays) / 7) * 7);
    var startDate = addDays(firstDate, -leading);
    var cells = [];

    for (var i = 0; i < totalCells; i++) {
      var date = addDays(startDate, i);
      var entry = archive[date];
      var outside = monthKey(date) !== state.calendarMonth;
      var today = date === DATA.today;
      var dayNumber = Number(date.slice(8, 10));
      var w = entry ? weather(entry.weathercode) : ['', ''];
      cells.push(
        '<div class="calendar-cell' + (outside ? ' outside' : '') + (today ? ' today' : '') + '">' +
          '<div class="calendar-date">' + dayNumber + '</div>' +
          '<div class="calendar-body">' +
            '<div class="calendar-icon">' + (entry ? (entry.weather_icon || w[1]) : '') + '</div>' +
            '<div class="calendar-temps">' +
              '<strong>' + (entry ? fmtFC(entry.temp_max) : '--') + '</strong>' +
              '<span>' + (entry ? fmtFC(entry.temp_min) : '--') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="calendar-meta">' + (entry ? fmtIn(entry.precipitation) + ' · ' + fmtMph(entry.windspeed_max) : 'No data') + '</div>' +
        '</div>'
      );
    }

    els.calendarWrap.innerHTML = '<div class="calendar-title-row">' +
      '<div><strong>' + selected.city + '</strong><span>' + selected.region + '</span></div>' +
      '<div>' + fmtMonth(state.calendarMonth) + '</div>' +
      '</div>' +
      '<div class="calendar-weekdays">' + weekdayLabels.map(function (day) { return '<div>' + day + '</div>'; }).join('') + '</div>' +
      '<div class="weather-calendar">' + cells.join('') + '</div>';
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
    renderCalendar(snapshot);
    renderCards(snapshot);
    renderForecast(snapshot);
  }

  els.countryTabs.addEventListener('click', function (event) {
    var button = event.target.closest('[data-country]');
    if (!button) return;
    state.country = button.getAttribute('data-country');
    state.forecastRegion = null;
    state.calendarRegion = null;
    state.calendarMonth = null;
    render();
  });

  els.forecastTabs.addEventListener('click', function (event) {
    var button = event.target.closest('[data-forecast]');
    if (!button) return;
    state.forecastRegion = button.getAttribute('data-forecast');
    renderForecast(getSnapshot(state.date));
  });

  els.calendarRegionTabs.addEventListener('click', function (event) {
    var button = event.target.closest('[data-calendar-region]');
    if (!button) return;
    state.calendarRegion = button.getAttribute('data-calendar-region');
    state.calendarMonth = null;
    renderCalendar(getSnapshot(state.date));
  });

  els.monthTabs.addEventListener('click', function (event) {
    var button = event.target.closest('[data-calendar-month]');
    if (!button) return;
    state.calendarMonth = button.getAttribute('data-calendar-month');
    renderCalendar(getSnapshot(state.date));
  });

  els.datePicker.addEventListener('change', function () {
    state.date = els.datePicker.value;
    state.forecastRegion = null;
    state.calendarRegion = null;
    render();
  });

  els.prevDate.addEventListener('click', function () {
    var allDates = dates();
    var index = allDates.indexOf(state.date);
    if (index > 0) {
      state.date = allDates[index - 1];
      state.forecastRegion = null;
      state.calendarRegion = null;
      render();
    }
  });

  els.nextDate.addEventListener('click', function () {
    var allDates = dates();
    var index = allDates.indexOf(state.date);
    if (index >= 0 && index < allDates.length - 1) {
      state.date = allDates[index + 1];
      state.forecastRegion = null;
      state.calendarRegion = null;
      render();
    }
  });

  els.todayButton.addEventListener('click', function () {
    state.date = DATA.today;
    state.forecastRegion = null;
    state.calendarRegion = null;
    render();
  });

  render();
})();
