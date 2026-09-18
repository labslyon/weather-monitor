(function () {
  var FX = window.FX_DATA;
  var overview = document.getElementById('fxOverviewSummary');
  var countrySummary = document.getElementById('countryFxSummary');
  var countryToCurrency = { US: 'USD', CA: 'CAD', AU: 'AUD' };
  var currencyLabels = { USD: '美元', CAD: '加元', AUD: '澳元' };
  var countryLabels = { USD: '美国', CAD: '加拿大', AUD: '澳大利亚' };

  function rate(value) {
    return value == null ? '--' : Number(value).toFixed(4);
  }

  function percent(value) {
    if (value == null) return '--';
    var sign = value > 0 ? '+' : '';
    return sign + Number(value).toFixed(2) + '%';
  }

  function changeTone(value) {
    if (value == null || Math.abs(value) < 0.005) return 'neutral';
    return value > 0 ? 'up' : 'down';
  }

  function previousMonthLabel() {
    var row = FX && FX.month_end ? FX.month_end.slice(-1)[0] : null;
    return row ? Number(row.date.slice(5, 7)) + ' 月末' : '上月末';
  }

  function impactShort(currency, value) {
    if (value == null) return '换算影响暂无数据';
    var direction = value >= 0 ? '增加' : '减少';
    return '每 1 万' + currencyLabels[currency] + '较月初' + direction + ' ¥' + Math.abs(value).toLocaleString('zh-CN', {
      maximumFractionDigits: 0
    });
  }

  function card(currency) {
    var item = FX.currencies[currency];
    var tone = changeTone(item.month_change_pct);
    return '<article class="fx-pulse-card currency-' + currency.toLowerCase() + '">' +
      '<div class="fx-pulse-head"><div><span class="fx-country-code">' + countryLabels[currency] + '</span><h3>' + item.pair + '</h3></div><span class="fx-asof">截至 ' + item.latest_date + '</span></div>' +
      '<div class="fx-rate"><strong>' + rate(item.latest) + '</strong><span>人民币 / 1 ' + currency + '</span></div>' +
      '<dl class="fx-pulse-metrics">' +
        '<div><dt>当月变化</dt><dd class="fx-change-' + tone + '">' + percent(item.month_change_pct) + '</dd></div>' +
        '<div><dt>较' + previousMonthLabel() + '</dt><dd class="fx-change-' + changeTone(item.previous_month_change_pct) + '">' + percent(item.previous_month_change_pct) + '</dd></div>' +
        '<div><dt>月内区间</dt><dd>' + rate(item.month_min) + '–' + rate(item.month_max) + '</dd></div>' +
      '</dl>' +
      '<p class="fx-impact-note">' + impactShort(currency, item.per_10000_change_cny) + '</p>' +
    '</article>';
  }

  function renderOverview() {
    if (!overview) return;
    if (!FX || !FX.currencies) {
      overview.innerHTML = '<p class="data-unavailable">汇率数据暂时无法载入。</p>';
      return;
    }
    overview.innerHTML = ['USD', 'CAD', 'AUD'].map(card).join('');
  }

  function renderCountry() {
    if (!countrySummary) return;
    var country = document.body.getAttribute('data-country');
    var currency = countryToCurrency[country];
    var item = FX && FX.currencies ? FX.currencies[currency] : null;
    if (!item) {
      countrySummary.innerHTML = '<p class="data-unavailable">汇率数据暂时无法载入。</p>';
      return;
    }

    var value = item.per_10000_change_cny;
    var impact = value >= 0
      ? '同等外币收入可多折合人民币，但当地广告与采购成本同步上升。'
      : '当地广告与采购成本折算回落，但同等外币收入可折合人民币减少。';
    countrySummary.innerHTML = '<article class="country-fx-card currency-' + currency.toLowerCase() + '">' +
      '<div class="country-fx-rate"><span>' + item.pair + ' · 截至 ' + item.latest_date + '</span><strong>' + rate(item.latest) + '</strong><small>人民币 / 1 ' + currency + '</small></div>' +
      '<dl class="country-fx-metrics">' +
        '<div><dt>当月变化</dt><dd class="fx-change-' + changeTone(item.month_change_pct) + '">' + percent(item.month_change_pct) + '</dd></div>' +
        '<div><dt>较' + previousMonthLabel() + '</dt><dd class="fx-change-' + changeTone(item.previous_month_change_pct) + '">' + percent(item.previous_month_change_pct) + '</dd></div>' +
        '<div><dt>月内区间</dt><dd>' + rate(item.month_min) + '–' + rate(item.month_max) + '</dd></div>' +
      '</dl>' +
      '<p class="country-fx-impact"><strong>' + impactShort(currency, value) + '</strong><span>' + impact + '</span></p>' +
      '<a class="inline-link" href="../fx/">查看完整走势 <span aria-hidden="true">→</span></a>' +
    '</article>';
  }

  renderOverview();
  renderCountry();
}());
