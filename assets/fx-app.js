(function () {
  var FX = window.FX_DATA;
  var currencyOrder = ['USD', 'CAD', 'AUD'];
  var currencyMeta = {
    USD: { country: '美国', name: '美元', color: '#2563eb' },
    CAD: { country: '加拿大', name: '加元', color: '#c2413a' },
    AUD: { country: '澳大利亚', name: '澳元', color: '#b7791f' }
  };
  var mode = 'rate';
  var charts = [];

  var els = {
    statDate: document.getElementById('fxStatDate'),
    statPairs: document.getElementById('fxStatPairs'),
    statGenerated: document.getElementById('fxStatGenerated'),
    headlineCards: document.getElementById('fxHeadlineCards'),
    impactGrid: document.getElementById('fxImpactGrid'),
    monthTable: document.getElementById('fxMonthTable'),
    dailyTable: document.getElementById('fxDailyTable'),
    chartNotice: document.getElementById('fxChartNotice'),
    modeControl: document.getElementById('fxModeControl')
  };

  function number(value, digits) {
    return value == null ? '--' : Number(value).toFixed(digits == null ? 4 : digits);
  }

  function percent(value) {
    if (value == null) return '--';
    return (value > 0 ? '+' : '') + Number(value).toFixed(2) + '%';
  }

  function tone(value) {
    if (value == null || Math.abs(value) < 0.005) return 'neutral';
    return value > 0 ? 'up' : 'down';
  }

  function dateTime(value, timeZone) {
    if (!value) return '--';
    var date = new Date(value.replace(' UTC', 'Z').replace(' ', 'T'));
    if (isNaN(date.getTime())) return value;
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

  function updateTimeRow(label, value) {
    return '<span class="update-time-row"><small>' + label + '</small><strong>' + value + '</strong></span>';
  }

  function previousMonthLabel() {
    var row = (FX.month_end || []).slice(-1)[0];
    return row ? Number(row.date.slice(5, 7)) + ' 月末' : '上月末';
  }

  function impactCopy(currency, item) {
    var value = item.per_10000_change_cny;
    if (value == null) return '暂无足够数据判断月内换算影响。';
    var meta = currencyMeta[currency];
    var amount = Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
    if (value >= 0) {
      return '每 1 万' + meta.name + '较月初多折合 ¥' + amount + '。海外收入换汇更有利，' + meta.name + '计价广告与采购成本上升。';
    }
    return '每 1 万' + meta.name + '较月初少折合 ¥' + amount + '。' + meta.name + '计价广告与采购成本回落，海外收入换汇金额减少。';
  }

  function renderHeader() {
    els.statDate.textContent = FX.latest_date || '--';
    els.statPairs.textContent = currencyOrder.length + ' 组';
    els.statGenerated.innerHTML = updateTimeRow('北京时间', dateTime(FX.generated_at, 'Asia/Shanghai')) +
      updateTimeRow('法兰克福时间', dateTime(FX.generated_at, 'Europe/Berlin'));
  }

  function renderCards() {
    els.headlineCards.innerHTML = currencyOrder.map(function (currency) {
      var item = FX.currencies[currency];
      var meta = currencyMeta[currency];
      return '<article class="fx-headline-card currency-' + currency.toLowerCase() + '">' +
        '<div class="fx-headline-top"><div><span>' + meta.country + '</span><h3>' + item.pair + '</h3></div><i aria-hidden="true"></i></div>' +
        '<div class="fx-headline-rate"><strong>' + number(item.latest) + '</strong><span>人民币 / 1 ' + currency + '</span></div>' +
        '<dl class="fx-headline-kpis">' +
          '<div><dt>当月变化</dt><dd class="fx-change-' + tone(item.month_change_pct) + '">' + percent(item.month_change_pct) + '</dd></div>' +
          '<div><dt>较' + previousMonthLabel() + '</dt><dd class="fx-change-' + tone(item.previous_month_change_pct) + '">' + percent(item.previous_month_change_pct) + '</dd></div>' +
          '<div><dt>当月低点</dt><dd>' + number(item.month_min) + '</dd></div>' +
          '<div><dt>当月高点</dt><dd>' + number(item.month_max) + '</dd></div>' +
        '</dl>' +
        '<p>' + impactCopy(currency, item) + '</p>' +
      '</article>';
    }).join('');
  }

  function renderImpact() {
    els.impactGrid.innerHTML = currencyOrder.map(function (currency) {
      var item = FX.currencies[currency];
      var value = item.per_10000_change_cny;
      var direction = value == null ? '--' : (value >= 0 ? '+' : '−') + '¥' + Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
      return '<article class="fx-impact-row currency-' + currency.toLowerCase() + '">' +
        '<div><span>' + currencyMeta[currency].country + '</span><strong>' + currency + '</strong></div>' +
        '<div><span>每 1 万外币较月初</span><strong class="fx-change-' + tone(value) + '">' + direction + '</strong></div>' +
        '<p>' + impactCopy(currency, item) + '</p>' +
      '</article>';
    }).join('');
  }

  function tableMarkup(rows, periodLabel) {
    if (!rows.length) return '<p class="data-unavailable">该时段暂无数据。</p>';
    var body = rows.map(function (row) {
      return '<tr><td>' + periodLabel(row.date) + '</td>' + currencyOrder.map(function (currency) {
        return '<td>' + number(row[currency]) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table class="fx-data-table"><thead><tr><th>日期</th>' + currencyOrder.map(function (currency) {
      return '<th>' + currency + '/CNY</th>';
    }).join('') + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderTables() {
    els.monthTable.innerHTML = tableMarkup(FX.month_end || [], function (date) {
      return Number(date.slice(5, 7)) + ' 月 · ' + date.slice(5);
    });
    els.dailyTable.innerHTML = tableMarkup(FX.current_month_daily || [], function (date) {
      return date.slice(5).replace('-', '/');
    });
  }

  function normalizedValues(rows, currency) {
    var baseline = rows.length ? rows[0][currency] : null;
    return rows.map(function (row) {
      if (baseline == null || row[currency] == null) return null;
      return Number((row[currency] / baseline * 100).toFixed(4));
    });
  }

  function dataset(rows, currency) {
    var meta = currencyMeta[currency];
    return {
      label: currency + '/CNY',
      data: mode === 'relative' ? normalizedValues(rows, currency) : rows.map(function (row) { return row[currency]; }),
      borderColor: meta.color,
      backgroundColor: meta.color,
      pointBackgroundColor: '#ffffff',
      pointBorderColor: meta.color,
      pointBorderWidth: 2,
      pointRadius: rows.length > 20 ? 2 : 3,
      pointHoverRadius: 5,
      borderWidth: 2.5,
      tension: 0.22
    };
  }

  function chartOptions(rows) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 8, color: '#475467', padding: 18, font: { size: 11, weight: 700 } }
        },
        tooltip: {
          backgroundColor: '#121820',
          titleColor: '#ffffff',
          bodyColor: '#e5edf5',
          padding: 12,
          callbacks: {
            title: function (items) {
              var index = items[0] ? items[0].dataIndex : 0;
              return rows[index] ? rows[index].date : '';
            },
            label: function (context) {
              if (mode === 'relative') return ' ' + context.dataset.label + ': ' + number(context.raw, 2) + '（起点=100）';
              return ' 1 ' + context.dataset.label.slice(0, 3) + ' = ' + number(context.raw) + ' CNY';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: '#d9e0e8' },
          ticks: { color: '#667085', maxRotation: 0, autoSkip: true, maxTicksLimit: 10, font: { size: 10 } }
        },
        y: {
          grid: { color: '#e8edf3' },
          border: { display: false },
          ticks: {
            color: '#667085',
            font: { size: 10 },
            callback: function (value) {
              return mode === 'relative' ? Number(value).toFixed(1) : '¥' + Number(value).toFixed(2);
            }
          }
        }
      }
    };
  }

  function makeChart(canvasId, rows, labelFormatter) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !rows.length) return null;
    return new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: rows.map(function (row) { return labelFormatter(row.date); }),
        datasets: currencyOrder.map(function (currency) { return dataset(rows, currency); })
      },
      options: chartOptions(rows)
    });
  }

  function renderCharts() {
    charts.forEach(function (chart) { chart.destroy(); });
    charts = [];
    if (!window.Chart) {
      els.chartNotice.hidden = false;
      return;
    }
    els.chartNotice.hidden = true;
    var monthChart = makeChart('fxMonthChart', FX.month_end || [], function (date) {
      return Number(date.slice(5, 7)) + ' 月';
    });
    var dailyChart = makeChart('fxDailyChart', FX.current_month_daily || [], function (date) {
      return date.slice(5).replace('-', '/');
    });
    charts = [monthChart, dailyChart].filter(Boolean);
  }

  function bindModeControl() {
    els.modeControl.addEventListener('click', function (event) {
      var button = event.target.closest('[data-fx-mode]');
      if (!button || button.getAttribute('data-fx-mode') === mode) return;
      mode = button.getAttribute('data-fx-mode');
      els.modeControl.querySelectorAll('[data-fx-mode]').forEach(function (item) {
        var selected = item === button;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      renderCharts();
    });
  }

  function showError() {
    var main = document.querySelector('main');
    if (main) main.innerHTML = '<section class="data-error"><h2>汇率数据暂时无法载入</h2><p>天气页面仍可正常使用，请稍后再试。</p></section>';
  }

  if (!FX || !FX.currencies) {
    showError();
    return;
  }

  renderHeader();
  renderCards();
  renderImpact();
  renderTables();
  renderCharts();
  bindModeControl();
}());
