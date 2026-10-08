(function () {
  'use strict';

  var element = document.getElementById('countryTemperatureMap');
  if (!element) return;
  var chartElement = document.getElementById('countryTemperatureChart');
  var raster = document.getElementById('countryTemperatureRaster');

  var DATA = window.WEATHER_DATA || {};
  var MAPS = window.WEATHER_ADMIN_MAPS || {};
  var LABELS = window.WEATHER_PLACE_LABELS || {};
  var ECHARTS = window.echarts;
  var countryKey = document.body.getAttribute('data-country');
  var countryNames = { US: '美国', CA: '加拿大', AU: '澳大利亚' };
  var mapNames = {
    US: ['temperature-us-main', 'temperature-us-alaska', 'temperature-us-hawaii'],
    CA: ['temperature-ca'],
    AU: ['temperature-au']
  };
  var palette = ['#315a9f', '#4f8fc5', '#72b7d4', '#78bd9a', '#d8ca5b', '#ee9a35', '#d65b3e'];
  var mapDataset = DATA.temperature_map && DATA.temperature_map.countries && DATA.temperature_map.countries[countryKey];
  var countryMap = MAPS[countryKey];
  var note = document.getElementById('countryTemperatureNote');
  var updated = document.getElementById('countryTemperatureUpdated');

  function showStatus(message, isError) {
    element.innerHTML = '<div class="country-temperature-map-status' + (isError ? ' is-error' : '') + '">' + message + '</div>';
  }

  if (!ECHARTS || !chartElement || !raster || !countryMap || !mapDataset || !Array.isArray(mapDataset.points) || !mapDataset.points.length) {
    showStatus('全国当前气温图暂时不可用，下方原有天气数据仍可正常查看。', true);
    if (note) note.textContent = '等待下一次气温网格更新。';
    return;
  }

  function featureCollection(features) {
    return { type: 'FeatureCollection', features: features };
  }

  function featurePostal(feature) {
    return feature && feature.properties && feature.properties.postal;
  }

  function registerMaps() {
    if (countryKey === 'US') {
      ECHARTS.registerMap(mapNames.US[0], featureCollection(countryMap.features.filter(function (feature) {
        return featurePostal(feature) !== 'AK' && featurePostal(feature) !== 'HI';
      })));
      ECHARTS.registerMap(mapNames.US[1], featureCollection(countryMap.features.filter(function (feature) {
        return featurePostal(feature) === 'AK';
      })));
      ECHARTS.registerMap(mapNames.US[2], featureCollection(countryMap.features.filter(function (feature) {
        return featurePostal(feature) === 'HI';
      })));
      return;
    }
    ECHARTS.registerMap(mapNames[countryKey][0], countryMap);
  }

  function formatBeijingTime(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date).replace(/\//g, '-');
  }

  function toC(fahrenheit) {
    return (Number(fahrenheit) - 32) * 5 / 9;
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

  function pointChineseName(regionKey, row) {
    var shared = LABELS.points && LABELS.points[regionKey];
    return row.city_zh || (shared && shared.zh) || row.city;
  }

  function monitoredPoints() {
    var regions = DATA.today_data && DATA.today_data.regions || {};
    return Object.keys(regions).map(function (regionKey) {
      var row = regions[regionKey];
      if (row.country !== countryKey || !row.current || !Number.isFinite(Number(row.current.temperature))) return null;
      return {
        kind: 'city',
        name: pointChineseName(regionKey, row),
        englishName: row.city,
        value: [Number(row.lon), Number(row.lat), Math.round(toC(row.current.temperature) * 10) / 10]
      };
    }).filter(Boolean);
  }

  function usGeoIndex(point) {
    if (point[1] >= 50 && point[0] <= -129) return 1;
    if (point[1] < 24 && point[0] <= -150) return 2;
    return 0;
  }

  function dataByGeo(points) {
    if (countryKey !== 'US') return [points];
    return [[], [], []].map(function (list, index) {
      points.forEach(function (point) {
        if (usGeoIndex(point.value || point) === index) list.push(point);
      });
      return list;
    });
  }

  function adminLabel(name) {
    var feature = countryMap.features.filter(function (candidate) {
      return candidate.properties && candidate.properties.name === name;
    })[0];
    if (!feature || !feature.properties) return name;
    return (feature.properties.name_zh || name) + ' · ' + name;
  }

  function tooltipFormatter(params) {
    if (params.data && params.data.kind === 'city') {
      return '<div style="min-width:150px">' +
        '<strong style="font-size:13px">' + escapeHtml(params.data.name) + '</strong>' +
        '<div style="margin-top:1px;color:#697586;font-size:10px">' + escapeHtml(params.data.englishName) + '</div>' +
        '<div style="margin-top:7px;font-size:15px;font-weight:800">' + params.data.value[2].toFixed(1) + '°C</div>' +
        '<div style="color:#697586;font-size:10px">代表监测点当前气温</div></div>';
    }
    if (params.data && params.data.kind === 'grid') {
      return '<strong>' + params.data.value[2].toFixed(1) + '°C</strong><div style="margin-top:2px;color:#697586;font-size:10px">当前气温网格</div>';
    }
    if (params.name) return escapeHtml(adminLabel(params.name));
    return '';
  }

  function baseGeo(mapName, layout) {
    return {
      map: mapName,
      roam: false,
      silent: false,
      left: layout.left,
      right: layout.right,
      top: layout.top,
      bottom: layout.bottom,
      width: layout.width,
      height: layout.height,
      itemStyle: {
        areaColor: 'rgba(248,250,252,0.06)',
        borderColor: '#657484',
        borderWidth: 0.9
      },
      emphasis: {
        disabled: false,
        itemStyle: { areaColor: 'rgba(255,255,255,0.16)', borderColor: '#263544', borderWidth: 1.2 },
        label: { show: false }
      },
      select: { disabled: true },
      tooltip: { show: true }
    };
  }

  function geoLayouts(isMobile) {
    if (countryKey !== 'US') {
      return [{
        left: isMobile ? 18 : 42,
        right: isMobile ? 18 : 66,
        top: isMobile ? 48 : 28,
        bottom: isMobile ? 18 : 28
      }];
    }
    return [
      {
        left: isMobile ? '2%' : '8%',
        right: isMobile ? '2%' : '8%',
        top: isMobile ? 48 : '5%',
        bottom: isMobile ? '36%' : '29%'
      },
      {
        left: isMobile ? '3%' : '3%',
        bottom: isMobile ? '5%' : '4%',
        width: isMobile ? '31%' : '25%',
        height: isMobile ? '25%' : '24%'
      },
      {
        left: isMobile ? '36%' : '28%',
        bottom: isMobile ? '6%' : '5%',
        width: isMobile ? '22%' : '14%',
        height: isMobile ? '14%' : '13%'
      }
    ];
  }

  function gridProbeSeries(points, geoIndex) {
    return {
      name: '当前气温网格',
      type: 'scatter',
      coordinateSystem: 'geo',
      geoIndex: geoIndex,
      symbolSize: 14,
      z: 2,
      itemStyle: { opacity: 0 },
      emphasis: { itemStyle: { opacity: 0 } },
      data: points.map(function (point) {
        return { kind: 'grid', value: point };
      })
    };
  }

  function citySeries(points, geoIndex) {
    return {
      name: '代表监测点',
      type: 'scatter',
      coordinateSystem: 'geo',
      geoIndex: geoIndex,
      symbolSize: 7,
      z: 8,
      itemStyle: { color: '#ffffff', borderColor: '#172433', borderWidth: 1.8 },
      label: {
        show: true,
        formatter: function (params) { return params.data.name; },
        position: 'top',
        distance: 4,
        color: '#172433',
        fontFamily: 'Inter, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: 9,
        fontWeight: 800,
        padding: [2, 3],
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderRadius: 2
      },
      labelLayout: { hideOverlap: true },
      emphasis: { scale: 1.4, label: { show: true, backgroundColor: '#ffffff' } },
      data: points
    };
  }

  function insetGraphics(isMobile) {
    if (countryKey !== 'US') return [];
    return [
      {
        type: 'text',
        left: isMobile ? '7%' : '8%',
        bottom: isMobile ? '28%' : '26%',
        silent: true,
        style: { text: '阿拉斯加', fill: '#475467', font: '700 10px sans-serif' }
      },
      {
        type: 'text',
        left: isMobile ? '40%' : '31%',
        bottom: isMobile ? '18%' : '17%',
        silent: true,
        style: { text: '夏威夷', fill: '#475467', font: '700 10px sans-serif' }
      }
    ];
  }

  function featuresForGeo(geoIndex) {
    if (countryKey !== 'US') return countryMap.features;
    return countryMap.features.filter(function (feature) {
      var postal = featurePostal(feature);
      if (geoIndex === 1) return postal === 'AK';
      if (geoIndex === 2) return postal === 'HI';
      return postal !== 'AK' && postal !== 'HI';
    });
  }

  function traceRing(context, ring, geoIndex, bounds) {
    var started = false;
    ring.forEach(function (coordinate) {
      var pixel = chart.convertToPixel({ geoIndex: geoIndex }, coordinate);
      if (!pixel || !Number.isFinite(pixel[0]) || !Number.isFinite(pixel[1])) return;
      if (!started) {
        context.moveTo(pixel[0], pixel[1]);
        started = true;
      } else {
        context.lineTo(pixel[0], pixel[1]);
      }
      bounds.minX = Math.min(bounds.minX, pixel[0]);
      bounds.maxX = Math.max(bounds.maxX, pixel[0]);
      bounds.minY = Math.min(bounds.minY, pixel[1]);
      bounds.maxY = Math.max(bounds.maxY, pixel[1]);
    });
    if (started) context.closePath();
  }

  function traceGeometry(context, geometry, geoIndex, bounds) {
    if (!geometry) return;
    var polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    polygons.forEach(function (polygon) {
      polygon.forEach(function (ring) {
        traceRing(context, ring, geoIndex, bounds);
      });
    });
  }

  function samplePixels(points, geoIndex) {
    return points.map(function (point) {
      var pixel = chart.convertToPixel({ geoIndex: geoIndex }, [point[0], point[1]]);
      if (!pixel || !Number.isFinite(pixel[0]) || !Number.isFinite(pixel[1])) return null;
      return [pixel[0], pixel[1], point[2]];
    }).filter(Boolean);
  }

  function interpolatedTemperature(x, y, samples) {
    var distances = [Infinity, Infinity, Infinity, Infinity];
    var temperatures = [0, 0, 0, 0];

    samples.forEach(function (sample) {
      var deltaX = x - sample[0];
      var deltaY = y - sample[1];
      var distance = deltaX * deltaX + deltaY * deltaY;
      if (distance < 0.5) {
        distances[0] = 0;
        temperatures[0] = sample[2];
        return;
      }
      for (var index = 0; index < distances.length; index += 1) {
        if (distance < distances[index]) {
          distances.splice(index, 0, distance);
          temperatures.splice(index, 0, sample[2]);
          distances.pop();
          temperatures.pop();
          break;
        }
      }
    });

    if (distances[0] === 0) return temperatures[0];
    var weighted = 0;
    var totalWeight = 0;
    distances.forEach(function (distance, index) {
      if (!Number.isFinite(distance)) return;
      var weight = 1 / Math.max(16, distance);
      weighted += temperatures[index] * weight;
      totalWeight += weight;
    });
    return totalWeight ? weighted / totalWeight : null;
  }

  var parsedPalette = palette.map(function (hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
  });
  var colorCache = {};

  function temperatureColor(value) {
    var quantized = Math.round(Math.max(-30, Math.min(45, value)) * 2) / 2;
    if (colorCache[quantized]) return colorCache[quantized];
    var ratio = (quantized + 30) / 75;
    var scaled = ratio * (parsedPalette.length - 1);
    var lowerIndex = Math.min(parsedPalette.length - 2, Math.floor(scaled));
    var blend = scaled - lowerIndex;
    var lower = parsedPalette[lowerIndex];
    var upper = parsedPalette[lowerIndex + 1];
    var rgb = lower.map(function (channel, index) {
      return Math.round(channel + (upper[index] - channel) * blend);
    });
    colorCache[quantized] = 'rgb(' + rgb.join(',') + ')';
    return colorCache[quantized];
  }

  function drawRaster() {
    var width = chartElement.clientWidth;
    var height = chartElement.clientHeight;
    if (!width || !height) return;
    var pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    raster.width = Math.round(width * pixelRatio);
    raster.height = Math.round(height * pixelRatio);
    var context = raster.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    var groups = dataByGeo(mapDataset.points);
    groups.forEach(function (points, geoIndex) {
      var samples = samplePixels(points, geoIndex);
      if (!samples.length) return;
      var bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      context.save();
      context.beginPath();
      featuresForGeo(geoIndex).forEach(function (feature) {
        traceGeometry(context, feature.geometry, geoIndex, bounds);
      });
      context.clip('evenodd');
      context.globalAlpha = 0.94;
      var step = width < 620 ? 3 : 4;
      var startX = Math.max(0, Math.floor(bounds.minX / step) * step);
      var endX = Math.min(width, Math.ceil(bounds.maxX / step) * step);
      var startY = Math.max(0, Math.floor(bounds.minY / step) * step);
      var endY = Math.min(height, Math.ceil(bounds.maxY / step) * step);
      for (var y = startY; y <= endY; y += step) {
        for (var x = startX; x <= endX; x += step) {
          var temperature = interpolatedTemperature(x + step / 2, y + step / 2, samples);
          if (temperature == null) continue;
          context.fillStyle = temperatureColor(temperature);
          context.fillRect(x, y, step + 1, step + 1);
        }
      }
      context.restore();
    });
  }

  function chartOption() {
    var isMobile = chartElement.clientWidth < 620;
    var layouts = geoLayouts(isMobile);
    var geos = mapNames[countryKey].map(function (mapName, index) {
      return baseGeo(mapName, layouts[index]);
    });
    var gridGroups = dataByGeo(mapDataset.points);
    var cityGroups = dataByGeo(monitoredPoints());
    var series = [];
    var gridIndexes = [];

    gridGroups.forEach(function (points, index) {
      gridIndexes.push(series.length);
      series.push(gridProbeSeries(points, index));
    });
    cityGroups.forEach(function (points, index) {
      if (points.length) series.push(citySeries(points, index));
    });

    return {
      animation: true,
      animationDuration: 380,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: '#cfd7e1',
        borderWidth: 1,
        padding: 10,
        textStyle: { color: '#263244', fontSize: 11 },
        extraCssText: 'box-shadow:0 10px 26px rgba(18,24,32,.14);border-radius:6px;',
        formatter: tooltipFormatter
      },
      visualMap: {
        type: 'continuous',
        min: -30,
        max: 45,
        dimension: 2,
        seriesIndex: gridIndexes,
        calculable: false,
        orient: isMobile ? 'horizontal' : 'vertical',
        left: isMobile ? 'center' : 'auto',
        right: isMobile ? 'auto' : 13,
        top: isMobile ? 8 : 'middle',
        itemWidth: isMobile ? 9 : 10,
        itemHeight: isMobile ? 120 : 180,
        text: ['45°C', '-30°C'],
        textGap: 7,
        textStyle: { color: '#334155', fontSize: 10, fontWeight: 700 },
        inRange: { color: palette },
        borderColor: '#93a1b0',
        backgroundColor: 'rgba(255,255,255,0.76)',
        padding: isMobile ? [5, 8] : [8, 6]
      },
      geo: geos,
      graphic: insetGraphics(isMobile),
      series: series
    };
  }

  registerMaps();
  var chart = ECHARTS.init(chartElement, null, { renderer: 'canvas' });
  chart.setOption(chartOption(), true);
  chart.on('finished', drawRaster);
  setTimeout(drawRaster, 0);

  var snapshotTime = mapDataset.generated_at || DATA.temperature_map.generated_at;
  if (updated) updated.textContent = '气温快照 · 北京时间 ' + formatBeijingTime(snapshotTime);
  if (note) {
    note.textContent = (mapDataset.stale ? '本图沿用上次成功快照；' : '') +
      '基于 ' + mapDataset.point_count + ' 个陆地网格插值展示当前气温，仅用于全国冷暖分布判断；色标固定为 -30°C 至 45°C。行政边界来自 Natural Earth；下方日期选择不影响本图。';
  }
  element.setAttribute('aria-label', countryNames[countryKey] + '当前气温分布图，共' + mapDataset.point_count + '个陆地气温网格');

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      chart.resize();
      chart.setOption(chartOption(), true);
      setTimeout(drawRaster, 0);
    }, 180);
  });
})();
