(function () {
  var DATA = window.WEATHER_DATA;
  if (!DATA) {
    document.body.innerHTML = '<main class="shell">Weather data failed to load.</main>';
    return;
  }

  var pageType = document.body.getAttribute('data-page') || 'overview';
  var state = {
    country: document.body.getAttribute('data-country') || 'US',
    date: DATA.today,
    forecastRegion: null,
    calendarRegion: null,
    calendarMonth: null
  };

  var countries = DATA.countries || {};
  var countryLabels = { US: '美国', CA: '加拿大', AU: '澳大利亚' };
  var countryTimeZones = {
    US: { label: '美东时间', timeZone: 'America/New_York' },
    CA: { label: '加东时间', timeZone: 'America/Toronto' },
    AU: { label: '澳东时间', timeZone: 'Australia/Sydney' }
  };
  var operationalRegionConfig = {
    US: [
      { key: 'us-northeast', name: '美东北', label: 'NORTHEAST', pointKeys: ['us-east', 'us-northeast-buffalo'] },
      { key: 'us-southeast', name: '美东南', label: 'SOUTHEAST', pointKeys: ['us-south', 'us-southeast-atlanta'] },
      { key: 'us-midwest', name: '中西部与五大湖', label: 'MIDWEST / GREAT LAKES', pointKeys: ['us-north', 'us-midwest-minneapolis'] },
      { key: 'us-south', name: '美南部', label: 'SOUTH', pointKeys: ['us-central', 'us-south-houston'] },
      { key: 'us-southwest', name: '美西南', label: 'SOUTHWEST', pointKeys: ['us-southwest', 'us-southwest-albuquerque'] },
      { key: 'us-west-coast', name: '美西海岸', label: 'WEST COAST', pointKeys: ['us-west', 'us-west-sf', 'us-pnw'] },
      { key: 'us-rockies', name: '落基山脉', label: 'ROCKY MOUNTAINS', pointKeys: ['us-rockies', 'us-rockies-slc', 'us-rockies-aspen'] }
    ],
    CA: [
      { key: 'ca-ontario-region', name: 'Ontario', label: '安大略省', pointKeys: ['ca-ontario', 'ca-ontario-ottawa'] },
      { key: 'ca-quebec-region', name: 'Quebec', label: '魁北克省', pointKeys: ['ca-quebec-province', 'ca-quebec-city'] },
      { key: 'ca-bc-region', name: 'British Columbia', label: '不列颠哥伦比亚省', pointKeys: ['ca-british-columbia-vancouver', 'ca-british-columbia'] },
      { key: 'ca-alberta-region', name: 'Alberta', label: '阿尔伯塔省', pointKeys: ['ca-alberta', 'ca-alberta-edmonton'] }
    ],
    AU: [
      { key: 'au-east-region', name: '东部沿海', label: 'EAST COAST', pointKeys: ['au-east', 'au-east-canberra'] },
      { key: 'au-northeast-region', name: '东北部', label: 'NORTHEAST', pointKeys: ['au-ne', 'au-ne-cairns'] },
      { key: 'au-south-region', name: '南部', label: 'SOUTH', pointKeys: ['au-south', 'au-south-adelaide'] },
      { key: 'au-west-region', name: '西部', label: 'WEST', pointKeys: ['au-west', 'au-west-albany'] },
      { key: 'au-north-region', name: '北部热带', label: 'TROPICAL NORTH', pointKeys: ['au-north', 'au-north-broome'] }
    ]
  };
  var pointLabels = {
    'ca-ontario': 'Toronto',
    'ca-quebec-province': 'Montreal',
    'ca-british-columbia': 'Whistler',
    'ca-alberta': 'Calgary'
  };
  var weatherCodes = DATA.weather_codes || {};
  var weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  var els = {
    overviewDate: document.getElementById('overviewDate'),
    overviewSignals: document.getElementById('overviewSignals'),
    marketOverview: document.getElementById('marketOverview'),
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

  function countryRegionGroups(countryKey) {
    var configured = operationalRegionConfig[countryKey];
    if (configured && configured.length) return configured;
    return regionKeys(countryKey).map(function (regionKey) {
      return { key: regionKey, name: regionKey, label: regionKey, pointKeys: [regionKey] };
    });
  }

  function pointDisplayName(regionKey, row) {
    return pointLabels[regionKey] || (row && row.city) || regionKey;
  }

  function regionGroupForPoint(countryKey, regionKey) {
    return countryRegionGroups(countryKey).filter(function (group) {
      return group.pointKeys.indexOf(regionKey) >= 0;
    })[0] || null;
  }

  function regionNameForPoint(countryKey, regionKey, row) {
    var group = regionGroupForPoint(countryKey, regionKey);
    return group ? group.name : ((row && row.region) || regionKey);
  }

  function fmtF(value) {
    return value == null ? '--' : Math.round(value) + '°F';
  }

  function toC(value) {
    return value == null ? null : (value - 32) * 5 / 9;
  }

  function fmtC(value) {
    var converted = toC(value);
    return converted == null ? '--' : Math.round(converted) + '°C';
  }

  function fmtCF(value) {
    return value == null ? '--' : fmtC(value) + ' / ' + fmtF(value);
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

  function generatedDate() {
    var value = DATA.today_data && DATA.today_data.generated_at;
    if (!value) return null;
    var parsed = new Date(value.replace(' UTC', 'Z').replace(' ', 'T'));
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function zonedDateTime(date, timeZone) {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timeZone
    }).format(date).replace(/\//g, '-');
  }

  function zoneAbbreviation(date, timeZone) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      timeZoneName: 'short'
    }).formatToParts(date);
    var zone = parts.filter(function (part) { return part.type === 'timeZoneName'; })[0];
    return zone ? zone.value : '';
  }

  function updateTimeRow(label, value) {
    return '<span class="update-time-row"><small>' + label + '</small><strong>' + value + '</strong></span>';
  }

  function generatedTimeMarkup() {
    var date = generatedDate();
    if (!date) return '--';
    var beijing = zonedDateTime(date, 'Asia/Shanghai');

    if (pageType === 'country') {
      var market = countryTimeZones[state.country];
      var local = zonedDateTime(date, market.timeZone) + ' ' + zoneAbbreviation(date, market.timeZone);
      return updateTimeRow('北京时间', beijing) + updateTimeRow(market.label, local);
    }

    var easternZone = countryTimeZones.US.timeZone;
    var australiaZone = countryTimeZones.AU.timeZone;
    var eastern = zonedDateTime(date, easternZone) + ' ' + zoneAbbreviation(date, easternZone);
    var australia = zonedDateTime(date, australiaZone) + ' ' + zoneAbbreviation(date, australiaZone);
    return updateTimeRow('北京时间', beijing) +
      updateTimeRow('市场当地时间', '美东/加东 ' + eastern + '<br>澳东 ' + australia);
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

  function yearAgoArchive(regionKey) {
    return ((((DATA.year_ago || {}).regions || {})[regionKey]) || {});
  }

  function numericValues(values) {
    return (values || []).filter(function (value) {
      return typeof value === 'number' && isFinite(value);
    });
  }

  function average(values) {
    var clean = numericValues(values);
    if (!clean.length) return null;
    return clean.reduce(function (sum, value) { return sum + value; }, 0) / clean.length;
  }

  function median(values) {
    var clean = numericValues(values).slice().sort(function (a, b) { return a - b; });
    if (!clean.length) return null;
    var middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  }

  function sum(values) {
    var clean = numericValues(values);
    if (!clean.length) return null;
    return clean.reduce(function (total, value) { return total + value; }, 0);
  }

  function fmtSnowfall(value) {
    return value == null ? '--' : (value * 2.54).toFixed(value * 2.54 >= 10 ? 0 : 1) + ' cm';
  }

  function fmtSnowDepth(value) {
    return value == null ? '--' : (value * 30.48).toFixed(value * 30.48 >= 10 ? 0 : 1) + ' cm';
  }

  function coverageLabel(actual, planned) {
    if (!actual) return '暂无代表点';
    if (planned && actual < planned) return '历史覆盖 ' + actual + ' / ' + planned + ' 点';
    return actual >= 3 ? '三点覆盖' : (actual === 2 ? '双点覆盖' : '单点参考');
  }

  function dailyMidpointF(row, index) {
    var daily = row.daily || {};
    var high = daily.temp_max ? daily.temp_max[index] : null;
    var low = daily.temp_min ? daily.temp_min[index] : null;
    if (high == null && low == null) return null;
    if (high == null) return low;
    if (low == null) return high;
    return (high + low) / 2;
  }

  function archiveMidpointF(entry) {
    if (!entry) return null;
    var high = entry.temp_max;
    var low = entry.temp_min;
    if (high == null && low == null) return null;
    if (high == null) return low;
    if (low == null) return high;
    return (high + low) / 2;
  }

  function forecastMeanF(row) {
    var daily = row.daily || {};
    return average((daily.dates || []).slice(0, 7).map(function (_date, index) {
      return dailyMidpointF(row, index);
    }));
  }

  function trendState(deltaC) {
    if (deltaC == null) return { label: '数据不足', tone: 'stable' };
    if (deltaC <= -2) return { label: '降温', tone: 'cooling' };
    if (deltaC >= 2) return { label: '升温', tone: 'warming' };
    return { label: '平稳', tone: 'stable' };
  }

  function fmtCPrecise(value) {
    var converted = toC(value);
    return converted == null ? '--' : converted.toFixed(1) + '°C';
  }

  function fmtCRange(minF, maxF) {
    if (minF == null || maxF == null) return '--';
    return Math.round(toC(minF)) + '–' + Math.round(toC(maxF)) + '°C';
  }

  function fmtCurrentRange(values) {
    var clean = numericValues(values);
    if (!clean.length) return '--';
    var minF = Math.min.apply(null, clean);
    var maxF = Math.max.apply(null, clean);
    if (Math.abs(maxF - minF) < 0.05) return fmtCPrecise(minF);
    return toC(minF).toFixed(1) + '–' + toC(maxF).toFixed(1) + '°C';
  }

  function fmtTrend(deltaC) {
    if (deltaC == null) return '--';
    if (deltaC > 0.05) return '上升 ' + Math.abs(deltaC).toFixed(1) + '°C';
    if (deltaC < -0.05) return '下降 ' + Math.abs(deltaC).toFixed(1) + '°C';
    return '持平 0.0°C';
  }

  function fmtYearAgoDelta(deltaC) {
    if (deltaC == null) return '--';
    if (deltaC > 0.05) return '偏高 ' + Math.abs(deltaC).toFixed(1) + '°C';
    if (deltaC < -0.05) return '偏低 ' + Math.abs(deltaC).toFixed(1) + '°C';
    return '持平 0.0°C';
  }

  function yearAgoTone(deltaC) {
    if (deltaC == null || Math.abs(deltaC) <= 0.05) return 'stable';
    return deltaC > 0 ? 'warming' : 'cooling';
  }

  function regionOutlook(row, countryKey) {
    var daily = row.daily || {};
    var highs = numericValues(daily.temp_max);
    var lows = numericValues(daily.temp_min);
    var forecastLength = Math.max((daily.dates || []).length, highs.length, lows.length);
    var lastIndex = forecastLength ? Math.min(6, forecastLength - 1) : 0;
    var startF = dailyMidpointF(row, 0);
    var endF = dailyMidpointF(row, lastIndex);
    var currentF = (row.current || {}).temperature;
    var trendC = startF == null || endF == null ? null : (endF - startF) * 5 / 9;
    var rainyDays = numericValues(daily.precipitation).filter(function (value) {
      return value >= 0.1;
    }).length;
    var snowfall = numericValues(daily.snowfall);
    var snowDays = snowfall.length
      ? snowfall.filter(function (value) { return value >= 0.04; }).length
      : (daily.weathercode || []).filter(function (code) {
          return [71, 73, 75, 77, 85, 86].indexOf(Number(code)) >= 0;
        }).length;
    var minF = lows.length ? Math.min.apply(null, lows) : null;
    var maxF = highs.length ? Math.max.apply(null, highs) : null;

    return {
      row: row,
      countryKey: countryKey,
      currentF: currentF == null ? startF : currentF,
      minF: minF,
      maxF: maxF,
      trendC: trendC,
      rainyDays: rainyDays,
      snowDays: snowDays,
      snowfallTotal: sum(snowfall),
      snowDepth: (row.current || {}).snow_depth,
      isCold: snowDays > 0 || (minF != null && toC(minF) <= 2)
    };
  }

  function minValue(values) {
    var clean = numericValues(values);
    return clean.length ? Math.min.apply(null, clean) : null;
  }

  function maxValue(values) {
    var clean = numericValues(values);
    return clean.length ? Math.max.apply(null, clean) : null;
  }

  function yearAgoComparison(items) {
    var matched = items.map(function (item) {
      var currentMeanF = forecastMeanF(item.row);
      var archive = yearAgoArchive(item.row.region_key);
      var previousMeanF = average(Object.keys(archive).sort().map(function (date) {
        return archiveMidpointF(archive[date]);
      }));
      if (currentMeanF == null || previousMeanF == null) return null;
      return {
        currentMeanF: currentMeanF,
        previousMeanF: previousMeanF
      };
    }).filter(Boolean);

    var currentF = median(matched.map(function (item) { return item.currentMeanF; }));
    var previousF = median(matched.map(function (item) { return item.previousMeanF; }));

    return {
      currentF: currentF,
      previousF: previousF,
      deltaC: currentF == null || previousF == null ? null : (currentF - previousF) * 5 / 9
    };
  }

  function aggregateSignalEntry(items) {
    return {
      temp_max: maxValue(items.map(function (item) {
        return ((item.row.daily || {}).temp_max || [])[0];
      })),
      temp_min: minValue(items.map(function (item) {
        return ((item.row.daily || {}).temp_min || [])[0];
      })),
      precipitation: maxValue(items.map(function (item) {
        return ((item.row.daily || {}).precipitation || [])[0];
      })),
      snowfall: maxValue(items.map(function (item) {
        return item.snowfallTotal;
      })),
      snow_depth: maxValue(items.map(function (item) {
        return item.snowDepth;
      })),
      windspeed_max: maxValue(items.map(function (item) {
        return ((item.row.daily || {}).windspeed_max || [])[0];
      }))
    };
  }

  function operationalRegionOutlook(countryKey, group, snapshot) {
    var regions = snapshot && snapshot.regions ? snapshot.regions : {};
    var items = group.pointKeys.map(function (regionKey) {
      return regions[regionKey] ? regionOutlook(regions[regionKey], countryKey) : null;
    }).filter(Boolean);
    var comparison = snapshot === DATA.today_data
      ? yearAgoComparison(items)
      : { currentF: null, previousF: null, deltaC: null };
    var alerts = [];

    items.forEach(function (item) {
      (item.row.alerts || []).forEach(function (alert) {
        alerts.push(pointDisplayName(item.row.region_key, item.row) + ': ' + alert);
      });
    });

    return {
      countryKey: countryKey,
      key: group.key,
      name: group.name,
      label: group.label,
      pointKeys: group.pointKeys,
      items: items,
      currentMinF: minValue(items.map(function (item) { return item.currentF; })),
      currentMaxF: maxValue(items.map(function (item) { return item.currentF; })),
      currentF: median(items.map(function (item) { return item.currentF; })),
      forecastMeanF: median(items.map(function (item) { return forecastMeanF(item.row); })),
      minF: minValue(items.map(function (item) { return item.minF; })),
      maxF: maxValue(items.map(function (item) { return item.maxF; })),
      trendC: median(items.map(function (item) { return item.trendC; })),
      rainyDays: maxValue(items.map(function (item) { return item.rainyDays; })),
      snowDays: maxValue(items.map(function (item) { return item.snowDays; })),
      snowfallTotal: maxValue(items.map(function (item) { return item.snowfallTotal; })),
      snowDepth: maxValue(items.map(function (item) { return item.snowDepth; })),
      hasCooling: items.some(function (item) { return item.trendC != null && item.trendC <= -2; }),
      hasWarming: items.some(function (item) { return item.trendC != null && item.trendC >= 2; }),
      isRainy: items.some(function (item) { return item.rainyDays >= 2; }),
      isCold: items.some(function (item) { return item.isCold; }),
      yearAgo: comparison,
      signalEntry: aggregateSignalEntry(items),
      alerts: alerts
    };
  }

  function countryOperationalOutlooks(countryKey, snapshot) {
    return countryRegionGroups(countryKey).map(function (group) {
      return operationalRegionOutlook(countryKey, group, snapshot);
    });
  }

  function allOperationalRegionOutlooks(snapshot) {
    var result = [];
    Object.keys(countries).forEach(function (countryKey) {
      countryOperationalOutlooks(countryKey, snapshot).forEach(function (outlook) {
        if (outlook.items.length) result.push(outlook);
      });
    });
    return result;
  }

  function countryOutlook(countryKey, snapshot) {
    var grouped = countryOperationalOutlooks(countryKey, snapshot).filter(function (outlook) {
      return outlook.items.length > 0;
    });
    var items = grouped.reduce(function (result, outlook) {
      return result.concat(outlook.items);
    }, []);

    return {
      countryKey: countryKey,
      regions: grouped,
      items: items,
      currentF: average(grouped.map(function (item) { return item.currentF; })),
      minF: minValue(grouped.map(function (item) { return item.minF; })),
      maxF: maxValue(grouped.map(function (item) { return item.maxF; })),
      trendC: average(grouped.map(function (item) { return item.trendC; })),
      rainyDays: average(grouped.map(function (item) { return item.rainyDays; }))
    };
  }

  function countryYearAgoComparison(outlook) {
    var comparisons = outlook.regions.map(function (item) {
      return item.yearAgo;
    }).filter(function (item) {
      return item && item.previousF != null && item.deltaC != null;
    });

    return {
      previousF: average(comparisons.map(function (item) { return item.previousF; })),
      deltaC: average(comparisons.map(function (item) { return item.deltaC; }))
    };
  }

  function signalGroups(items) {
    return Object.keys(countries).map(function (countryKey) {
      var names = items.filter(function (item) {
        return item.countryKey === countryKey;
      }).map(function (item) {
        return item.name;
      }).filter(function (name, index, list) {
        return list.indexOf(name) === index;
      }).join('、');

      return '<div class="overview-signal-country">' +
        '<span>' + (countryLabels[countryKey] || countryKey) + '</span>' +
        '<strong>' + (names || '暂无') + '</strong>' +
        '</div>';
    }).join('');
  }

  function overviewSignal(label, note, tone, items) {
    return '<article class="overview-signal tone-' + tone + '">' +
      '<div class="overview-signal-head"><span>' + label + '</span><i aria-hidden="true"></i></div>' +
      '<div class="overview-signal-value">' + items.length + '</div>' +
      '<div class="overview-signal-list">' + signalGroups(items) + '</div>' +
      '<div class="overview-signal-note">' + note + '</div>' +
      '</article>';
  }

  function renderOverview(snapshot) {
    if (!snapshot) {
      els.overviewDate.textContent = '--';
      els.overviewSignals.innerHTML = '';
      els.marketOverview.innerHTML = '';
      return;
    }

    var allItems = allOperationalRegionOutlooks(snapshot);
    var cooling = allItems.filter(function (item) { return item.hasCooling; });
    var warming = allItems.filter(function (item) { return item.hasWarming; });
    var rainy = allItems.filter(function (item) { return item.isRainy; });
    var cold = allItems.filter(function (item) { return item.isCold; });

    els.overviewDate.textContent = '最新快照 · ' + DATA.today;
    els.overviewSignals.innerHTML = [
      overviewSignal('降温区域', '7 日趋势 ≤ -2°C', 'cooling', cooling),
      overviewSignal('升温区域', '7 日趋势 ≥ 2°C', 'warming', warming),
      overviewSignal('降雨区域', '未来 7 天至少 2 个雨天', 'rainy', rainy),
      overviewSignal('低温区域', '未来 7 天最低温 ≤ 2°C', 'cold', cold)
    ].join('');

    els.marketOverview.innerHTML = Object.keys(countries).map(function (countryKey) {
      var country = countries[countryKey];
      var outlook = countryOutlook(countryKey, snapshot);
      var status = trendState(outlook.trendC);
      var yearAgo = countryYearAgoComparison(outlook);
      var comparisonTone = yearAgoTone(yearAgo.deltaC);
      var rainText = outlook.rainyDays == null ? '--' : outlook.rainyDays.toFixed(1).replace('.0', '') + ' / 7 天';
      var regionTiles = outlook.regions.map(function (item) {
        var regionStatus = trendState(item.trendC);
        var regionYearAgo = item.yearAgo;
        var regionComparisonTone = yearAgoTone(regionYearAgo.deltaC);
        var pointNames = item.items.map(function (point) {
          return pointDisplayName(point.row.region_key, point.row);
        }).join('、');
        return '<div class="market-city">' +
          '<div class="market-city-top"><strong>' + item.name + '</strong><span>' + fmtCurrentRange(item.items.map(function (point) { return point.currentF; })) + '</span></div>' +
          '<div class="market-city-region">' + item.label + '</div>' +
          '<div class="market-city-points">' + pointNames + ' · ' + coverageLabel(item.items.length, item.pointKeys.length) + '</div>' +
          '<div class="market-city-metrics"><span>7 日 ' + fmtCRange(item.minF, item.maxF) + '</span><span>雨 ' + (item.rainyDays == null ? '--' : item.rainyDays) + ' 天 · 雪 ' + fmtSnowfall(item.snowfallTotal) + '</span></div>' +
          '<div class="market-city-foot"><span class="tone-' + regionComparisonTone + '">同比 ' + fmtYearAgoDelta(regionYearAgo.deltaC) + '</span><strong class="tone-' + regionStatus.tone + '">' + fmtTrend(item.trendC) + '</strong></div>' +
          '</div>';
      }).join('');

      return '<article class="market-row">' +
        '<div class="market-summary">' +
          '<div class="market-title-row">' +
            '<div><span class="market-code">' + countryKey + '</span><h3>' + country.name + '</h3><p class="market-scope">' + outlook.regions.length + ' 区 · ' + outlook.items.length + ' 个代表点</p></div>' +
            '<div class="market-title-actions">' +
              '<span class="market-status tone-' + status.tone + '">' + status.label + '</span>' +
              '<button class="market-toggle" type="button" data-market-toggle data-country-label="' + (countryLabels[countryKey] || countryKey) + '" aria-expanded="false" aria-controls="market-regions-' + countryKey + '" aria-label="展开' + (countryLabels[countryKey] || countryKey) + '区域" title="展开' + (countryLabels[countryKey] || countryKey) + '区域">' +
                '<span class="market-toggle-icon" aria-hidden="true">&#9662;</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<dl class="market-kpis">' +
            '<div><dt>区域典型当前温度</dt><dd>' + fmtCPrecise(outlook.currentF) + '</dd></div>' +
            '<div><dt>未来 7 天范围</dt><dd>' + fmtCRange(outlook.minF, outlook.maxF) + '</dd></div>' +
            '<div><dt>温度趋势</dt><dd>' + fmtTrend(outlook.trendC) + '</dd></div>' +
            '<div><dt>区域平均雨天</dt><dd>' + rainText + '</dd></div>' +
            '<div><dt>去年同期 7 日均温</dt><dd>' + fmtCPrecise(yearAgo.previousF) + '</dd></div>' +
            '<div><dt>较去年同期</dt><dd class="tone-' + comparisonTone + '">' + fmtYearAgoDelta(yearAgo.deltaC) + '</dd></div>' +
          '</dl>' +
          '<a class="market-detail-button" href="' + countryKey.toLowerCase() + '/">查看国家详情 <span aria-hidden="true">→</span></a>' +
        '</div>' +
        '<div class="market-cities" id="market-regions-' + countryKey + '" hidden>' + regionTiles + '</div>' +
        '</article>';
    }).join('');
  }

  function renderHeader() {
    var allDates = dates();
    var first = allDates[0] || '--';
    var last = allDates[allDates.length - 1] || '--';
    var currentRegions = (DATA.today_data || {}).regions || {};
    var pointCount = pageType === 'country'
      ? regionKeys(state.country).filter(function (key) { return Boolean(currentRegions[key]); }).length
      : Object.keys(currentRegions).length;
    var regionCount = pageType === 'country'
      ? countryOperationalOutlooks(state.country, DATA.today_data).filter(function (item) { return item.items.length; }).length
      : null;
    var archive = DATA.daily_archive || {};
    var archiveText = archive.range ? ' · 月历：' + archive.range.start + ' 至 ' + archive.range.end : '';
    els.statDates.textContent = allDates.length + ' 天';
    els.statCities.textContent = pageType === 'country' ? regionCount + ' 区 / ' + pointCount + ' 点' : pointCount;
    els.statGenerated.innerHTML = generatedTimeMarkup();
    if (els.coverageText) {
      els.coverageText.textContent = '快照：' + first + ' 至 ' + last + archiveText;
    }
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
      summaryItem(
        '最高代表点温度',
        hottest ? fmtCF(hottest.current.temperature) : '--',
        hottest ? pointDisplayName(hottest.region_key, hottest) + ' · ' + regionNameForPoint(state.country, hottest.region_key, hottest) : '--'
      ),
      summaryItem(
        '7 日降水最多代表点',
        wettest ? fmtIn(wettest.total) : '--',
        wettest ? pointDisplayName(wettest.row.region_key, wettest.row) + ' · ' + regionNameForPoint(state.country, wettest.row.region_key, wettest.row) : '--'
      ),
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
        alerts.push(
          regionNameForPoint(state.country, row.region_key, row) + ' · ' +
          pointDisplayName(row.region_key, row) + ': ' + alert
        );
      });
    });

    els.alertBand.classList.toggle('hidden', alerts.length === 0);
    els.alertList.innerHTML = alerts.map(function (alert) {
      return '<div class="alert-item">⚠ ' + alert + '</div>';
    }).join('');
  }

  function renderCards(snapshot) {
    var country = countries[state.country] || {};
    var grouped = countryOperationalOutlooks(state.country, snapshot);
    els.countryEyebrow.textContent = (country.name || state.country) + ' Regions';
    els.cardsTitle.textContent = (countryLabels[state.country] || country.name || state.country) + '区域天气';

    if (!grouped.some(function (outlook) { return outlook.items.length; })) {
      els.regionCards.innerHTML = '<div class="weather-card">No data</div>';
      return;
    }

    els.regionCards.innerHTML = grouped.map(function (outlook) {
      var status = trendState(outlook.trendC);
      var comparisonTone = yearAgoTone(outlook.yearAgo.deltaC);
      var signal = outlook.items.length
        ? operationalSignal(outlook.signalEntry)
        : { value: '--', note: '当前快照无代表点数据' };
      var pointRows = outlook.items.map(function (item) {
        var row = item.row;
        var current = row.current || {};
        var firstCode = ((row.daily || {}).weathercode || [])[0];
        var condition = current.weather_desc || weather(firstCode)[0];
        return '<div class="region-point">' +
          '<div class="region-point-main">' +
            '<span class="region-point-icon" aria-hidden="true">' + (current.weather_icon || weather(firstCode)[1]) + '</span>' +
            '<div><strong>' + pointDisplayName(row.region_key, row) + '</strong><small>' + condition + '</small></div>' +
          '</div>' +
          '<div class="region-point-temp"><strong>' + fmtCPrecise(item.currentF) + '</strong><small>' + fmtF(item.currentF) + '</small></div>' +
        '</div>';
      }).join('');
      var hasAlerts = outlook.alerts.length > 0;

      return '<article class="weather-card region-weather-card' + (hasAlerts ? ' has-alerts' : '') + '">' +
        '<div class="region-card-head">' +
          '<div><div class="region-badge">' + outlook.label + '</div><div class="city-name">' + outlook.name + '</div>' +
          '<div class="region-monitor-count">' + outlook.items.length + ' 个代表监测点 · ' + coverageLabel(outlook.items.length, outlook.pointKeys.length) + '</div></div>' +
          '<span class="market-status tone-' + status.tone + '">' + status.label + '</span>' +
        '</div>' +
        '<div class="region-current"><span>代表点当前温度</span><strong>' +
          fmtCurrentRange(outlook.items.map(function (item) { return item.currentF; })) +
        '</strong></div>' +
        '<div class="region-point-list">' +
          (pointRows || '<div class="region-point-empty">当前快照暂无代表点数据</div>') +
        '</div>' +
        '<dl class="region-kpis">' +
          '<div><dt>未来 7 日均温</dt><dd>' + fmtCPrecise(outlook.forecastMeanF) + '</dd></div>' +
          '<div><dt>去年同期 7 日均温</dt><dd>' + fmtCPrecise(outlook.yearAgo.previousF) + '</dd></div>' +
          '<div><dt>较去年同期</dt><dd class="tone-' + comparisonTone + '">' + fmtYearAgoDelta(outlook.yearAgo.deltaC) + '</dd></div>' +
          '<div><dt>未来 7 日范围</dt><dd>' + fmtCRange(outlook.minF, outlook.maxF) + '</dd></div>' +
          '<div><dt>未来 7 日最大降雪</dt><dd>' + fmtSnowfall(outlook.snowfallTotal) + '</dd></div>' +
          '<div><dt>代表点最大积雪</dt><dd>' + fmtSnowDepth(outlook.snowDepth) + '</dd></div>' +
        '</dl>' +
        '<div class="signal-row"><span>运营信号</span><strong>' + signal.value + '</strong></div>' +
        '<div class="region-signal-note">' + signal.note + '</div>' +
        (hasAlerts ? '<div class="card-alert">⚠ ' + outlook.alerts.join(' · ') + '</div>' : '') +
        '</article>';
    }).join('');
  }

  function operationalSignal(entry) {
    if (!entry) return { value: '--', note: 'No daily data' };
    if ((entry.snowfall != null && entry.snowfall >= 0.1) ||
        (entry.snow_depth != null && entry.snow_depth >= 0.03)) {
      return { value: 'Snow Demand', note: '关注滑雪、保暖、手套和护具需求' };
    }
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
      return '<button type="button" class="' + active + '" data-calendar-region="' + row.region_key + '">' +
        pointDisplayName(row.region_key, row) + '</button>';
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
    var pointName = pointDisplayName(selected.region_key, selected);
    var regionName = regionNameForPoint(state.country, selected.region_key, selected);
    var currentNote = fmtCF(current.temperature);
    if (current.snow_depth != null) currentNote += ' · 积雪 ' + fmtSnowDepth(current.snow_depth);
    els.dailyMetrics.innerHTML = [
      metricItem('今日最高', today ? fmtCF(today.temp_max) : '--', pointName),
      metricItem('今日最低', today ? fmtCF(today.temp_min) : '--', regionName),
      metricItem('当前天气', current.weather_desc || (today ? today.weather_desc : '--'), currentNote),
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
              '<strong>' + (entry ? fmtCF(entry.temp_max) : '--') + '</strong>' +
              '<span>' + (entry ? fmtCF(entry.temp_min) : '--') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="calendar-meta">' + (entry ? fmtIn(entry.precipitation) + ' · ' + fmtMph(entry.windspeed_max) : 'No data') + '</div>' +
        '</div>'
      );
    }

    els.calendarWrap.innerHTML = '<div class="calendar-title-row">' +
      '<div><strong>' + pointDisplayName(selected.region_key, selected) + '</strong><span>' +
        regionNameForPoint(state.country, selected.region_key, selected) + '代表监测点</span></div>' +
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
      return '<button type="button" class="' + active + '" data-forecast="' + row.region_key + '">' +
        pointDisplayName(row.region_key, row) + '</button>';
    }).join('');

    var selected = rows.filter(function (row) { return row.region_key === state.forecastRegion; })[0];
    var daily = selected.daily;
    var body = daily.dates.map(function (date, index) {
      var code = daily.weathercode ? daily.weathercode[index] : 0;
      var w = weather(code);
      var precip = daily.precipitation ? daily.precipitation[index] : null;
      var snowfall = daily.snowfall ? daily.snowfall[index] : null;
      return '<tr>' +
        '<td><strong>' + fmtDate(date) + '</strong><br><span class="muted">' + date + '</span></td>' +
        '<td class="forecast-icon">' + w[1] + '</td>' +
        '<td>' + w[0] + '</td>' +
        '<td>' + fmtCF(daily.temp_max ? daily.temp_max[index] : null) + '</td>' +
        '<td>' + fmtCF(daily.temp_min ? daily.temp_min[index] : null) + '</td>' +
        '<td class="' + (precip != null && precip >= 1 ? 'precip-high' : '') + '">' + fmtIn(precip) + '</td>' +
        '<td class="' + (snowfall != null && snowfall >= 0.1 ? 'precip-high' : '') + '">' + fmtSnowfall(snowfall) + '</td>' +
        '<td>' + fmtMph(daily.windspeed_max ? daily.windspeed_max[index] : null) + '</td>' +
        '</tr>';
    }).join('');

    els.forecastWrap.innerHTML = '<table class="forecast-table">' +
      '<thead><tr><th>Date</th><th></th><th>Weather</th><th>High</th><th>Low</th><th>Precip</th><th>Snow</th><th>Wind</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table>';
  }

  function render() {
    var snapshot = getSnapshot(state.date);
    renderHeader();
    if (pageType === 'overview') {
      renderOverview(DATA.today_data || snapshot);
      return;
    }
    renderDatePicker();
    renderSummary(snapshot);
    renderAlerts(snapshot);
    renderCards(snapshot);
    renderForecast(snapshot);
    renderCalendar(snapshot);
  }

  if (pageType === 'overview') {
    els.marketOverview.addEventListener('click', function (event) {
      var button = event.target.closest('[data-market-toggle]');
      if (!button) return;
      var panel = document.getElementById(button.getAttribute('aria-controls'));
      if (!panel) return;

      var expanded = button.getAttribute('aria-expanded') === 'true';
      var nextExpanded = !expanded;
      var countryLabel = button.getAttribute('data-country-label') || '';
      var nextLabel = (nextExpanded ? '收起' : '展开') + countryLabel + '区域';
      button.setAttribute('aria-expanded', String(nextExpanded));
      button.setAttribute('aria-label', nextLabel);
      button.setAttribute('title', nextLabel);
      panel.hidden = !nextExpanded;
      button.closest('.market-row').classList.toggle('is-expanded', nextExpanded);
    });
  }

  if (pageType === 'country') {
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
  }

  render();
})();
