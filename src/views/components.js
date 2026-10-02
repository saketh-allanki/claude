// Reusable UI pieces: status pills, expiry badges, uptime bars and the response-time chart.
import { html, raw, escapeHtml } from '../lib/html.js';
import { daysUntil, formatDate, formatPercent, formatMs, formatDateTime } from '../lib/format.js';

export function statusPill(monitor) {
  if (monitor.paused) {
    const label = monitor.paused_reason === 'plan_limit' ? 'Paused · over limit' : 'Paused';
    return html`<span class="pill pill-muted"><span class="dot"></span>${label}</span>`;
  }
  switch (monitor.status) {
    case 'up':
      return html`<span class="pill pill-good"><span class="dot"></span>Up</span>`;
    case 'down':
      return html`<span class="pill pill-bad"><span class="dot"></span>Down</span>`;
    default:
      return html`<span class="pill pill-muted"><span class="dot"></span>Checking…</span>`;
  }
}

// Shows "in 42 days" with severity colouring plus an icon-free text label.
export function expiryBadge(ms, { error = null, warnDays = 14, now = Date.now(), checked = true } = {}) {
  if (!ms) {
    if (error) return html`<span class="muted small" title="${error}">Unavailable</span>`;
    return html`<span class="muted small">${checked ? '—' : 'Checking…'}</span>`;
  }
  const days = daysUntil(ms, now);
  const cls = days < 0 ? 'bad' : days <= warnDays ? 'warn' : 'ok';
  const label = days < 0 ? `Expired ${-days}d ago` : days === 0 ? 'Expires today' : `${days} days`;
  return html`<span class="expiry expiry-${cls}" title="Expires ${formatDate(ms)}">${label}</span>`;
}

export function uptimeClass(uptime) {
  if (uptime == null) return 'none';
  if (uptime >= 99.9) return 'good';
  if (uptime >= 99) return 'warn';
  if (uptime >= 95) return 'serious';
  return 'bad';
}

export const UPTIME_LEGEND = html`<div class="legend" aria-hidden="false">
  <span><i class="sw sw-good"></i>99.9%+</span>
  <span><i class="sw sw-warn"></i>99–99.9%</span>
  <span><i class="sw sw-serious"></i>95–99%</span>
  <span><i class="sw sw-bad"></i>Below 95%</span>
  <span><i class="sw sw-none"></i>No data</span>
</div>`;

// A strip of daily uptime cells (one per day), with a tooltip on each cell.
export function uptimeBars(days, { label = 'Daily uptime' } = {}) {
  const w = 6;
  const gap = 2;
  const h = 32;
  const width = days.length * (w + gap) - gap;
  const rects = days
    .map((d, i) => {
      const tip = `${formatDate(Date.parse(d.day))}: ${d.uptime == null ? 'No data' : `${formatPercent(d.uptime)} uptime`}`;
      return `<rect class="cell cell-${uptimeClass(d.uptime)}" x="${i * (w + gap)}" y="0" width="${w}" height="${h}" rx="2" data-tip="${escapeHtml(tip)}" tabindex="-1"><title>${escapeHtml(tip)}</title></rect>`;
    })
    .join('');
  return html`<svg class="uptime-bars" viewBox="0 0 ${width} ${h}" preserveAspectRatio="none" role="img" aria-label="${label}">${raw(rects)}</svg>`;
}

function niceStep(max) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

// Response-time line chart (single series) with failed checks marked along the baseline.
export function responseChart(points, { hours = 24, now = Date.now() } = {}) {
  const W = 720;
  const H = 220;
  const pad = { l: 48, r: 12, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const start = now - hours * 3600_000;
  const okPoints = points.filter((p) => p.ok && p.ms != null);
  if (!points.length) {
    return html`<div class="chart-empty muted">No checks in the last ${hours} hours yet. The chart fills in as checks run.</div>`;
  }
  const maxMs = Math.max(100, ...okPoints.map((p) => p.ms));
  const step = niceStep(maxMs);
  const top = Math.ceil(maxMs / step) * step;
  const x = (t) => pad.l + ((t - start) / (now - start)) * iw;
  const y = (ms) => pad.t + ih - (ms / top) * ih;

  let path = '';
  let area = '';
  let segment = [];
  const flush = () => {
    if (segment.length) {
      path += `M${segment.map((p) => `${x(p.at).toFixed(1)},${y(p.ms).toFixed(1)}`).join('L')}`;
      area += `M${x(segment[0].at).toFixed(1)},${pad.t + ih}L${segment.map((p) => `${x(p.at).toFixed(1)},${y(p.ms).toFixed(1)}`).join('L')}L${x(segment[segment.length - 1].at).toFixed(1)},${pad.t + ih}Z`;
    }
    segment = [];
  };
  for (const p of points) {
    if (p.ok && p.ms != null) segment.push(p);
    else flush();
  }
  flush();

  const grid = [];
  for (let v = 0; v <= top; v += step) {
    grid.push(
      `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString('en-US')}</text>`,
    );
  }
  const xticks = [];
  for (let hAgo = hours; hAgo >= 0; hAgo -= hours / 4) {
    const t = now - hAgo * 3600_000;
    const label = hAgo === 0 ? 'now' : `${hAgo}h ago`;
    xticks.push(`<text class="tick" x="${x(t)}" y="${H - 8}" text-anchor="${hAgo === hours ? 'start' : hAgo === 0 ? 'end' : 'middle'}">${label}</text>`);
  }
  const failures = points
    .filter((p) => !p.ok)
    .map((p) => `<rect class="fail" x="${(x(p.at) - 1.5).toFixed(1)}" y="${pad.t + ih - 8}" width="3" height="8" rx="1"/>`)
    .join('');
  const data = JSON.stringify(points.map((p) => [p.at, p.ok ? 1 : 0, p.ms]));
  const hasFailures = points.some((p) => !p.ok);

  return html`<figure class="chart" data-chart="response" data-start="${start}" data-end="${now}" data-points="${data}"
      data-left="${pad.l}" data-right="${pad.r}" data-width="${W}" tabindex="0" aria-label="Response time over the last ${hours} hours. Use arrow keys to inspect values.">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true">
      ${raw(grid.join(''))}
      <line class="baseline" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>
      <path class="area" d="${area}"/>
      <path class="line" d="${path}"/>
      ${raw(failures)}
      ${raw(xticks.join(''))}
      <line class="crosshair" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>
    </svg>
    <figcaption class="legend">
      <span><i class="key-line"></i>Response time (ms)</span>
      ${hasFailures ? html`<span><i class="key-fail"></i>Failed check</span>` : ''}
    </figcaption>
    <div class="chart-tip" hidden></div>
  </figure>`;
}

export function statTile(label, value, sub = '') {
  return html`<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? html`<div class="stat-sub">${sub}</div>` : ''}</div>`;
}

export function dailyTable(days) {
  return html`<table class="table compact">
    <thead><tr><th>Day (UTC)</th><th class="num">Checks</th><th class="num">Uptime</th><th class="num">Avg. response</th></tr></thead>
    <tbody>${days
      .slice()
      .reverse()
      .map(
        (d) => html`<tr><td>${formatDate(Date.parse(d.day))}</td><td class="num">${d.checks.toLocaleString('en-US')}</td><td class="num">${formatPercent(d.uptime)}</td><td class="num">${formatMs(d.avgMs)}</td></tr>`,
      )}</tbody>
  </table>`;
}

export function csrfField(req) {
  return html`<input type="hidden" name="_csrf" value="${req.csrf || ''}">`;
}

export const when = (ms) => formatDateTime(ms);
