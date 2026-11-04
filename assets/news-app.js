(function () {
  'use strict';

  var data = window.NEWS_DATA;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function dateTime(value, timeZone) {
    if (!value) return '--';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(value)).replace(/\//g, '-');
  }

  function coverageText(coverage) {
    if (!coverage) return '--';
    return coverage.start === coverage.end ? coverage.end : coverage.start + ' 至 ' + coverage.end;
  }

  function updateHeader(latest) {
    byId('newsStatCoverage').textContent = coverageText(latest.coverage);
    byId('newsStatItems').textContent = (latest.items || []).length + ' 条';
    byId('newsStatGenerated').innerHTML =
      '<span class="update-time-row"><small>北京时间</small><strong>' + escapeHtml(dateTime(data.generated_at, 'Asia/Shanghai')) + '</strong></span>' +
      '<span class="update-time-row"><small>美东时间</small><strong>' + escapeHtml(dateTime(data.generated_at, 'America/New_York')) + '</strong></span>';
  }

  function itemMarkup(item, index) {
    var priority = item.priority === 'high' ? '高优先级' : '关注';
    var sourceTier = item.source_tier_zh || '官方来源';
    var sourceLinkLabel = item.source_tier === 'industry_advisory' ? '查看行业预警来源' : '查看官方来源';
    return '<article class="news-item news-priority-' + escapeHtml(item.priority) + '">' +
      '<div class="news-item-index" aria-hidden="true">' + String(index + 1).padStart(2, '0') + '</div>' +
      '<div class="news-item-body">' +
        '<div class="news-item-meta">' +
          '<span class="news-category">' + escapeHtml(item.category_zh) + '</span>' +
          '<span class="news-status">' + escapeHtml(item.status_zh) + '</span>' +
          '<span class="news-monitoring-reason">' + escapeHtml(item.monitoring_reason_zh || '本期新发布') + '</span>' +
          '<span>首次发布 ' + escapeHtml(item.published_date_et) + ' ET</span>' +
          '<span>' + escapeHtml(item.source_name) + '</span>' +
          '<span>' + escapeHtml(sourceTier) + '</span>' +
          '<span class="news-priority-label">' + priority + '</span>' +
        '</div>' +
        '<h3>' + escapeHtml(item.fact_zh) + '</h3>' +
        '<p class="news-original-title">原文：' + escapeHtml(item.title) + '</p>' +
        '<p class="news-impact"><strong>影响／建议</strong>' + escapeHtml(item.impact_zh) + '</p>' +
        '<a class="news-source-link" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">' + sourceLinkLabel + ' <span aria-hidden="true">→</span></a>' +
      '</div>' +
    '</article>';
  }

  function renderLatest(latest) {
    var list = byId('newsLatestList');
    var items = latest.items || [];
    var freshCount = items.filter(function (item) {
      return item.monitoring_reason === 'new_publication' || item.monitoring_reason === 'updated';
    }).length;
    var watchCount = items.length - freshCount;
    byId('newsCoverageBand').innerHTML =
      '<div><span>新增新闻窗口</span><strong>' + escapeHtml(coverageText(latest.coverage)) + '</strong><small>美国东部时间</small></div>' +
      '<p>本期精选 <strong>' + items.length + '</strong> 条：新增／更新 ' + freshCount + ' 条，持续事项 ' + watchCount + ' 条。当前不会自动发送企业微信。</p>';
    list.innerHTML = items.length
      ? items.map(itemMarkup).join('')
      : '<div class="news-empty"><strong>本期没有达到推送阈值的重要内容</strong><span>系统不会为了凑满条数而加入低相关信息。</span></div>';
  }

  function renderUpcoming(latest) {
    var items = latest.upcoming || [];
    var events = items.filter(function (item) { return item.type !== 'federal_holiday'; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    var holidays = items.filter(function (item) { return item.type === 'federal_holiday'; }).sort(function (a, b) { return a.date.localeCompare(b.date); });

    function upcomingItemMarkup(item) {
      return '<article class="news-upcoming-item">' +
        '<time datetime="' + escapeHtml(item.date) + '">' + escapeHtml(item.date_display || item.date) + '</time>' +
        '<div><h3>' + escapeHtml(item.title_zh) + '</h3><p>' + escapeHtml(item.scope_zh) + '</p><p class="news-upcoming-impact">' + escapeHtml(item.impact_zh) + '</p></div>' +
        '<a href="' + escapeHtml(item.source_url) + '" target="_blank" rel="noopener">' + escapeHtml(item.source_name || '来源') + '</a>' +
      '</article>';
    }

    function upcomingGroupMarkup(title, eyebrow, groupItems) {
      if (!groupItems.length) return '';
      return '<section class="news-upcoming-group">' +
        '<div class="news-upcoming-group-head"><span>' + escapeHtml(eyebrow) + '</span><h3>' + escapeHtml(title) + '</h3><small>' + groupItems.length + ' 项</small></div>' +
        '<div class="news-upcoming-group-list">' + groupItems.map(upcomingItemMarkup).join('') + '</div>' +
      '</section>';
    }

    byId('newsUpcoming').innerHTML = items.length
      ? upcomingGroupMarkup('骑行赛事', 'Cycling Events', events) + upcomingGroupMarkup('美国假期与短假', 'U.S. Holidays', holidays)
      : '<div class="news-empty"><strong>未来 60 天暂无已登记预告</strong></div>';
  }

  function renderHistory() {
    var history = (data.editions || []).slice(1);
    byId('newsHistory').innerHTML = history.length
      ? history.map(function (edition) {
          return '<details class="news-history-edition">' +
            '<summary><span>' + escapeHtml(edition.id) + '</span><strong>' + (edition.items || []).length + ' 条</strong><small>' + escapeHtml(coverageText(edition.coverage)) + ' ET</small></summary>' +
            '<div class="news-history-items">' + ((edition.items || []).length
              ? edition.items.map(function (item) { return '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">' + escapeHtml(item.fact_zh) + '</a>'; }).join('')
              : '<span>该期没有达到推送阈值的内容。</span>') + '</div>' +
          '</details>';
        }).join('')
      : '<div class="news-empty news-empty-compact"><strong>尚无历史简报</strong><span>试运行积累后将在这里按日期展开。</span></div>';
  }

  function renderSources(latest) {
    var runs = latest.source_runs || [];
    byId('newsSources').innerHTML = '<table class="news-source-table"><thead><tr><th>来源</th><th>状态</th><th>读取</th><th>相关</th><th>耗时</th></tr></thead><tbody>' +
      runs.map(function (run) {
        return '<tr>' +
          '<td><a href="' + escapeHtml(run.url) + '" target="_blank" rel="noopener">' + escapeHtml(run.name || run.id.replace(/_/g, ' ')) + '</a>' + (run.error ? '<small>' + escapeHtml(run.error) + '</small>' : '') + (run.warning ? '<small class="news-source-warning">' + escapeHtml(run.warning) + '</small>' : '') + '</td>' +
          '<td><span class="news-source-status is-' + escapeHtml(run.status) + '">' + (run.status === 'ok' ? '正常' : '失败') + '</span></td>' +
          '<td>' + escapeHtml(run.fetched_count) + '</td>' +
          '<td>' + escapeHtml(run.relevant_count) + '</td>' +
          '<td>' + escapeHtml((run.elapsed_ms / 1000).toFixed(1)) + 's</td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }

  function renderError(message) {
    byId('newsLatestList').innerHTML = '<div class="news-empty news-error"><strong>新闻数据未载入</strong><span>' + escapeHtml(message) + '</span></div>';
  }

  if (!data || !data.latest) {
    renderError('请先运行新闻数据采集脚本。');
    return;
  }

  updateHeader(data.latest);
  renderLatest(data.latest);
  renderUpcoming(data.latest);
  renderHistory();
  renderSources(data.latest);
}());
