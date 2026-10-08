(function () {
  'use strict';

  var root = document.getElementById('weatherMapGrid');
  if (!root) return;

  var DATA = window.WEATHER_DATA;
  var MAPS = window.WEATHER_MAP_GEODATA;
  var ECHARTS = window.echarts;

  function showError(message) {
    root.setAttribute('data-weather-map-status', 'error');
    root.innerHTML = '<div class="weather-map-error">' + message + '</div>';
  }

  if (!DATA || !MAPS || !ECHARTS) {
    showError('天气地图暂时无法加载，原有天气与汇率内容不受影响。');
    return;
  }

  var countryMeta = {
    US: { name: '美国', map: 'weather-US', element: 'weatherMapUS', detail: 'weatherMapDetailUS' },
    CA: { name: '加拿大', map: 'weather-CA', element: 'weatherMapCA', detail: 'weatherMapDetailCA' },
    AU: { name: '澳大利亚', map: 'weather-AU', element: 'weatherMapAU', detail: 'weatherMapDetailAU' }
  };

  var operationalRegions = {
    US: [
      { key: 'us-northeast', name: '美东北', label: 'NORTHEAST', points: ['us-east', 'us-northeast-buffalo'], position: 'left', offset: [-4, -16] },
      { key: 'us-southeast', name: '美东南', label: 'SOUTHEAST', points: ['us-south', 'us-southeast-atlanta'], position: 'left', offset: [-3, 15] },
      { key: 'us-midwest', name: '中西部与五大湖', label: 'MIDWEST / GREAT LAKES', points: ['us-north', 'us-midwest-minneapolis'], position: 'top', offset: [-5, -11] },
      { key: 'us-south', name: '美南部', label: 'SOUTH', points: ['us-central', 'us-south-houston'], position: 'bottom', offset: [0, 8] },
      { key: 'us-southwest', name: '美西南', label: 'SOUTHWEST', points: ['us-southwest', 'us-southwest-albuquerque'], position: 'bottom', offset: [-4, 8] },
      { key: 'us-west-coast', name: '美西海岸', label: 'WEST COAST', points: ['us-west', 'us-west-sf', 'us-pnw'], position: 'right', offset: [5, 0] },
      { key: 'us-rockies', name: '落基山脉', label: 'ROCKY MOUNTAINS', points: ['us-rockies', 'us-rockies-slc', 'us-rockies-aspen'], position: 'top', offset: [8, -10] }
    ],
    CA: [
      { key: 'ca-ontario-region', name: 'Ontario', label: '安大略省', points: ['ca-ontario', 'ca-ontario-ottawa'], position: 'top', offset: [-9, -8] },
      { key: 'ca-quebec-region', name: 'Quebec', label: '魁北克省', points: ['ca-quebec-province', 'ca-quebec-city'], position: 'top', offset: [12, -8] },
      { key: 'ca-bc-region', name: 'British Columbia', label: '不列颠哥伦比亚省', points: ['ca-british-columbia-vancouver', 'ca-british-columbia'], position: 'right', offset: [4, -5] },
      { key: 'ca-alberta-region', name: 'Alberta', label: '阿尔伯塔省', points: ['ca-alberta', 'ca-alberta-edmonton'], position: 'top', offset: [0, -8] }
    ],
    AU: [
      { key: 'au-east-region', name: '东部沿海', label: 'EAST COAST', points: ['au-east', 'au-east-canberra'], position: 'left', offset: [-5, 11] },
      { key: 'au-northeast-region', name: '东北部', label: 'NORTHEAST', points: ['au-ne', 'au-ne-cairns'], position: 'left', offset: [-5, -8] },
      { key: 'au-south-region', name: '南部', label: 'SOUTH', points: ['au-south', 'au-south-adelaide'], position: 'bottom', offset: [0, 8] },
      { key: 'au-west-region', name: '西部', label: 'WEST', points: ['au-west', 'au-west-albany'], position: 'left', offset: [-5, 0] },
      { key: 'au-north-region', name: '北部热带', label: 'TROPICAL NORTH', points: ['au-north', 'au-north-broome'], position: 'top', offset: [0, -9] }
    ]
  };

  var state = {
    mode: 'temperature',
    selected: {},
    charts: {}
  };

  function numeric(values) {
    return (values || []).filter(function (value) {
      return typeof value === 'number' && Number.isFinite(value);
    });
  }

  function average(values) {
    var clean = numeric(values);
    if (!clean.length) return null;
    return clean.reduce(function (sum, value) { return sum + value; }, 0) / clean.length;
  }

  function minimum(values) {
    var clean = numeric(values);
    return clean.length ? Math.min.apply(null, clean) : null;
  }

  function maximum(values) {
    var clean = numeric(values);
    return clean.length ? Math.max.apply(null, clean) : null;
  }

  function toC(fahrenheit) {
    return fahrenheit == null ? null : (fahrenheit - 32) * 5 / 9;
  }

  function midpoint(row, index) {
    var high = row.daily && row.daily.temp_max ? row.daily.temp_max[index] : null;
    var low = row.daily && row.daily.temp_min ? row.daily.temp_min[index] : null;
    if (high == null && low == null) return null;
    if (high == null) return low;
    if (low == null) return high;
    return (high + low) / 2;
  }

  function pointTrendC(row) {
    var length = Math.max(
      row.daily && row.daily.dates ? row.daily.dates.length : 0,
      row.daily && row.daily.temp_max ? row.daily.temp_max.length : 0,
      row.daily && row.daily.temp_min ? row.daily.temp_min.length : 0
    );
    var lastIndex = length ? Math.min(6, length - 1) : 0;
    var first = midpoint(row, 0);
    var last = midpoint(row, lastIndex);
    return first == null || last == null ? null : (last - first) * 5 / 9;
  }

  function pointRainDays(row) {
    return numeric(row.daily && row.daily.precipitation).filter(function (value) {
      return value >= 0.1;
    }).length;
  }

  function pointSnowCm(row) {
    return numeric(row.daily && row.daily.snowfall).reduce(function (sum, value) {
      return sum + value;
    }, 0) * 2.54;
  }

  function aggregateRegion(country, config, rows) {
    var points = config.points.map(function (key) {
      return rows[key];
    }).filter(Boolean);
    var currentC = average(points.map(function (row) {
      return toC(row.current && row.current.temperature);
    }));
    var allLows = points.reduce(function (values, row) {
      return values.concat(numeric(row.daily && row.daily.temp_min).map(toC));
    }, []);
    var allHighs = points.reduce(function (values, row) {
      return values.concat(numeric(row.daily && row.daily.temp_max).map(toC));
    }, []);

    return {
      country: country,
      key: config.key,
      name: config.name,
      label: config.label,
      position: config.position,
      offset: config.offset,
      pointCount: points.length,
      points: points,
      center: [
        average(points.map(function (row) { return row.lon; })),
        average(points.map(function (row) { return row.lat; }))
      ],
      currentC: currentC,
      minC: minimum(allLows),
      maxC: maximum(allHighs),
      trendC: average(points.map(pointTrendC)),
      rainDays: maximum(points.map(pointRainDays)) || 0,
      snowCm: maximum(points.map(pointSnowCm)) || 0
    };
  }

  function allRegionData() {
    var rows = DATA.today_data && DATA.today_data.regions ? DATA.today_data.regions : {};
    return Object.keys(operationalRegions).reduce(function (result, country) {
      result[country] = operationalRegions[country].map(function (config) {
        return aggregateRegion(country, config, rows);
      }).filter(function (region) {
        return region.pointCount && region.center[0] != null && region.center[1] != null;
      });
      return result;
    }, {});
  }

  var regionsByCountry = allRegionData();

  if (Object.keys(countryMeta).some(function (country) { return !regionsByCountry[country].length; })) {
    showError('天气地图缺少区域数据，原有天气与汇率内容不受影响。');
    return;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function contiguousUnitedStates(map) {
    var result = clone(map);
    var feature = result.features && result.features[0];
    if (!feature || feature.geometry.type !== 'MultiPolygon') return result;
    feature.geometry.coordinates = feature.geometry.coordinates.filter(function (polygon) {
      var points = [];
      (function walk(value) {
        if (typeof value[0] === 'number') points.push(value);
        else value.forEach(walk);
      })(polygon);
      var maxLongitude = maximum(points.map(function (point) { return point[0]; }));
      var minLatitude = minimum(points.map(function (point) { return point[1]; }));
      return maxLongitude > -100 && minLatitude > 24;
    });
    return result;
  }

  ECHARTS.registerMap(countryMeta.US.map, contiguousUnitedStates(MAPS.US));
  ECHARTS.registerMap(countryMeta.CA.map, MAPS.CA);
  ECHARTS.registerMap(countryMeta.AU.map, MAPS.AU);

  function modeValue(region) {
    if (state.mode === 'trend') return region.trendC;
    if (state.mode === 'rain') return region.rainDays;
    return region.currentC;
  }

  function signed(value) {
    if (value == null) return '--';
    return (value > 0 ? '+' : '') + value.toFixed(1) + '°C';
  }

  function temperatureRange(region) {
    if (region.minC == null || region.maxC == null) return '--';
    return Math.round(region.minC) + '~' + Math.round(region.maxC) + '°C';
  }

  function modePrimary(region) {
    if (state.mode === 'trend') return signed(region.trendC);
    if (state.mode === 'rain') return region.rainDays + ' 天';
    return region.currentC == null ? '--' : region.currentC.toFixed(1) + '°C';
  }

  function modeShort(region) {
    if (state.mode === 'trend') {
      if (region.trendC == null) return '--';
      var arrow = region.trendC <= -2 ? '↓' : region.trendC >= 2 ? '↑' : '→';
      return arrow + Math.abs(region.trendC).toFixed(1) + '°';
    }
    if (state.mode === 'rain') return '雨 ' + region.rainDays + ' 天';
    return region.currentC == null ? '--' : Math.round(region.currentC) + '°C';
  }

  function metricColor(region) {
    var value = modeValue(region);
    if (value == null) return '#8b98a8';
    if (state.mode === 'trend') {
      if (value <= -2) return '#2f80ed';
      if (value >= 2) return '#e07a2d';
      return '#718096';
    }
    if (state.mode === 'rain') {
      if (value >= 4) return '#244fc1';
      if (value >= 2) return '#2d82d8';
      if (value >= 1) return '#32a69a';
      return '#8b98a8';
    }
    if (value < 5) return '#386dd4';
    if (value < 15) return '#2b9bc7';
    if (value < 25) return '#2f9a68';
    if (value < 32) return '#dfa130';
    return '#d9574e';
  }

  function modeName() {
    if (state.mode === 'trend') return '未来 7 日趋势';
    if (state.mode === 'rain') return '未来 7 日降雨';
    return '当前区域均温';
  }

  function legendItems() {
    if (state.mode === 'trend') {
      return [
        ['#2f80ed', '降温 ≤ -2°C'],
        ['#718096', '平稳 -2~2°C'],
        ['#e07a2d', '升温 ≥ 2°C']
      ];
    }
    if (state.mode === 'rain') {
      return [
        ['#8b98a8', '0 天'],
        ['#32a69a', '1 天'],
        ['#2d82d8', '2~3 天'],
        ['#244fc1', '4 天以上']
      ];
    }
    return [
      ['#386dd4', '< 5°C'],
      ['#2b9bc7', '5~15°C'],
      ['#2f9a68', '15~25°C'],
      ['#dfa130', '25~32°C'],
      ['#d9574e', '≥ 32°C']
    ];
  }

  function renderLegend() {
    var legend = document.getElementById('weatherMapLegend');
    legend.innerHTML = '';
    legendItems().forEach(function (item) {
      var label = document.createElement('span');
      var swatch = document.createElement('i');
      label.className = 'weather-map-legend-item';
      swatch.className = 'weather-map-legend-swatch';
      swatch.style.background = item[0];
      swatch.setAttribute('aria-hidden', 'true');
      label.appendChild(swatch);
      label.appendChild(document.createTextNode(item[1]));
      legend.appendChild(label);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[character];
    });
  }

  function tooltipMarkup(region) {
    var pointLines = region.points.map(function (row) {
      var value = row.current && row.current.temperature;
      return '<div style="display:flex;justify-content:space-between;gap:18px;margin-top:5px"><span style="color:#697586">' +
        escapeHtml(row.city) + '</span><strong>' + (value == null ? '--' : toC(value).toFixed(1) + '°C') + '</strong></div>';
    }).join('');
    return '<div style="min-width:185px">' +
      '<div style="font-size:13px;font-weight:800;color:#151a22">' + escapeHtml(region.name) + '</div>' +
      '<div style="margin-top:2px;font-size:10px;color:#778396">' + escapeHtml(region.label) + ' · ' + region.pointCount + ' 个代表点</div>' +
      '<div style="margin-top:9px;padding-top:7px;border-top:1px solid #e8edf2">' +
        '<div style="display:flex;justify-content:space-between;gap:18px"><span style="color:#697586">7 日范围</span><strong>' + temperatureRange(region) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;gap:18px;margin-top:5px"><span style="color:#697586">温度趋势</span><strong>' + signed(region.trendC) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;gap:18px;margin-top:5px"><span style="color:#697586">降雨 / 降雪</span><strong>' + region.rainDays + ' 天 / ' + region.snowCm.toFixed(1) + ' cm</strong></div>' +
      '</div>' + pointLines + '</div>';
  }

  function chartOption(country) {
    var regions = regionsByCountry[country];
    var allPoints = regions.reduce(function (list, region) {
      return list.concat(region.points.map(function (row) {
        return { name: row.city, value: [row.lon, row.lat] };
      }));
    }, []);
    var regionSeries = regions.map(function (region) {
      var color = metricColor(region);
      return {
        name: region.name,
        value: [region.center[0], region.center[1], modeValue(region)],
        region: region,
        itemStyle: { color: color, borderColor: '#ffffff', borderWidth: 2 },
        label: { position: region.position, offset: region.offset, borderColor: color }
      };
    });

    return {
      animation: true,
      animationDuration: 420,
      animationDurationUpdate: 320,
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: '#cfd7e1',
        borderWidth: 1,
        padding: 11,
        textStyle: { color: '#263244', fontSize: 11 },
        extraCssText: 'box-shadow:0 10px 26px rgba(18,24,32,.14);border-radius:6px;',
        formatter: function (params) {
          return params.data && params.data.region ? tooltipMarkup(params.data.region) : '';
        }
      },
      geo: {
        map: countryMeta[country].map,
        roam: false,
        silent: false,
        left: country === 'CA' ? 48 : 42,
        right: country === 'CA' ? 48 : 42,
        top: 34,
        bottom: 42,
        itemStyle: {
          areaColor: '#e7ecf1',
          borderColor: '#8f9cab',
          borderWidth: 1
        },
        emphasis: {
          disabled: false,
          itemStyle: { areaColor: '#dce4eb' },
          label: { show: false }
        },
        select: { disabled: true }
      },
      series: [
        {
          name: '代表点',
          type: 'scatter',
          coordinateSystem: 'geo',
          silent: true,
          symbolSize: 5,
          z: 2,
          itemStyle: { color: '#ffffff', borderColor: '#657386', borderWidth: 1.5 },
          data: allPoints
        },
        {
          name: '运营区域',
          type: 'scatter',
          coordinateSystem: 'geo',
          symbolSize: function (value) {
            if (state.mode === 'rain') return 20 + Math.min(4, value[2] || 0) * 2;
            return 24;
          },
          z: 5,
          label: {
            show: true,
            formatter: function (params) {
              return params.data.name + '\n' + modeShort(params.data.region);
            },
            distance: 7,
            color: '#1e2733',
            fontFamily: 'Inter, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 13,
            padding: [4, 5],
            backgroundColor: 'rgba(255,255,255,0.94)',
            borderWidth: 1,
            borderRadius: 4
          },
          emphasis: {
            scale: 1.15,
            label: { show: true, backgroundColor: '#ffffff' }
          },
          data: regionSeries
        }
      ]
    };
  }

  function renderDetail(country, region) {
    state.selected[country] = region.key;
    var tone = metricColor(region);
    var points = region.points.map(function (row) { return escapeHtml(row.city); }).join(' · ');
    document.getElementById(countryMeta[country].detail).innerHTML =
      '<div class="weather-map-selection-head">' +
        '<div class="weather-map-selection-name"><span>' + escapeHtml(region.label) + ' · ' + region.pointCount + ' 个代表点</span><strong>' + escapeHtml(region.name) + '</strong></div>' +
        '<div class="weather-map-selection-primary" style="color:' + tone + '">' + modePrimary(region) + '<span>' + modeName() + '</span></div>' +
      '</div>' +
      '<div class="weather-map-selection-metrics">' +
        '<div><span>7 日温度</span><strong>' + temperatureRange(region) + '</strong></div>' +
        '<div><span>温度趋势</span><strong>' + signed(region.trendC) + '</strong></div>' +
        '<div><span>降雨 / 降雪</span><strong>' + region.rainDays + ' 天 / ' + region.snowCm.toFixed(1) + ' cm</strong></div>' +
      '</div>' +
      '<p class="weather-map-selection-points">' + points + '</p>';
  }

  function selectedRegion(country) {
    var regions = regionsByCountry[country];
    var key = state.selected[country];
    var selected = regions.filter(function (region) { return region.key === key; })[0];
    if (selected) return selected;
    return regions.slice().sort(function (left, right) {
      return Math.abs(modeValue(right) || 0) - Math.abs(modeValue(left) || 0);
    })[0];
  }

  function renderCountry(country) {
    state.charts[country].setOption(chartOption(country), true);
    renderDetail(country, selectedRegion(country));
    document.getElementById(countryMeta[country].element).setAttribute(
      'aria-label',
      countryMeta[country].name + '各运营区域' + modeName() + '分布地图'
    );
  }

  function renderAll() {
    renderLegend();
    Object.keys(countryMeta).forEach(renderCountry);
  }

  function initializeCharts() {
    Object.keys(countryMeta).forEach(function (country) {
      var element = document.getElementById(countryMeta[country].element);
      var chart = ECHARTS.init(element, null, { renderer: 'canvas' });
      chart.on('click', function (params) {
        if (params.data && params.data.region) renderDetail(country, params.data.region);
      });
      state.charts[country] = chart;
    });
  }

  document.querySelectorAll('[data-weather-map-mode]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.mode = button.getAttribute('data-weather-map-mode');
      document.querySelectorAll('[data-weather-map-mode]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
      renderAll();
    });
  });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      Object.keys(state.charts).forEach(function (country) {
        state.charts[country].resize();
      });
    }, 120);
  });

  try {
    initializeCharts();
    renderAll();
    root.setAttribute('data-weather-map-status', 'ready');
    var note = document.getElementById('weatherMapNote');
    if (note && DATA.today) {
      note.textContent = '数据日期 ' + DATA.today + '。区域结果由现有代表点聚合；点击地图上的区域可查看温度范围、趋势、降雨和降雪。地图边界仅用于方位示意。';
    }
  } catch (error) {
    Object.keys(state.charts).forEach(function (country) {
      state.charts[country].dispose();
    });
    showError('天气地图暂时无法加载，原有天气与汇率内容不受影响。');
  }
})();
