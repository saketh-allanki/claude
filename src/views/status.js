// Public status pages and embeddable status badges.
import { html, raw, escapeHtml, safeUrl } from '../lib/html.js';
import { layout } from './layout.js';
import { uptimeBars, UPTIME_LEGEND } from './components.js';
import { formatPercent, formatDateTime, formatDuration } from '../lib/format.js';

export function statusPage(ctx, req, { page, monitors, brand, incidents }) {
  const c = ctx.config;
  const active = monitors.filter((m) => !m.paused);
  const down = active.filter((m) => m.status === 'down');
  const overall = !active.length ? 'none' : down.length === 0 ? 'good' : down.length === active.length ? 'bad' : 'warn';
  const overallText = {
    none: 'No sites are being monitored on this page yet.',
    good: 'All systems operational',
    warn: `${down.length} of ${active.length} sites are having problems`,
    bad: 'All sites are currently unavailable',
  }[overall];
  const accent = /^#[0-9a-f]{6}$/i.test(brand.color || '') ? brand.color : null;

  const body = html`
  <div class="status-page" ${accent ? raw(`style="--accent:${escapeHtml(accent)}"`) : ''}>
    <header class="status-header container narrow">
      ${brand.logoUrl ? html`<img class="status-logo" src="${safeUrl(brand.logoUrl)}" alt="${brand.name}">` : html`<div class="status-brand">${brand.name}</div>`}
      <h1>${page.title} status</h1>
    </header>
    <div class="container narrow">
      <div class="status-banner status-${overall}" role="status">
        <span class="status-icon" aria-hidden="true">${overall === 'good' ? '✓' : overall === 'none' ? '•' : '!'}</span>
        <span>${overallText}</span>
      </div>
      <div class="card status-list">
        ${monitors.map(
          (m) => html`<div class="status-item">
            <div class="status-row">
              <strong>${m.name}</strong>
              <span class="status-state state-${m.paused ? 'muted' : m.status}">${m.paused ? 'Paused' : m.status === 'up' ? 'Operational' : m.status === 'down' ? 'Down' : 'Checking'}</span>
            </div>
            ${uptimeBars(m.bars, { label: `Daily uptime for ${m.name}` })}
            <div class="bars-axis small muted"><span>90 days ago</span><span>${formatPercent(m.uptime90)} uptime</span><span>Today</span></div>
          </div>`,
        )}
        ${monitors.length ? UPTIME_LEGEND : ''}
      </div>
      <section class="status-incidents">
        <h2>Past incidents</h2>
        ${incidents.length
          ? html`<ul>${incidents.map(
              (i) => html`<li><strong>${i.monitor_name}</strong> — ${i.resolved_at ? `unavailable for ${formatDuration(i.resolved_at - i.started_at)}` : html`<span class="bad-text">ongoing</span>`}<br><span class="small muted">${formatDateTime(i.started_at)}</span></li>`,
            )}</ul>`
          : html`<p class="muted">No incidents in the last 14 days.</p>`}
      </section>
      <footer class="status-footer small muted">
        <span>Updated ${formatDateTime(Date.now())} · refreshes every minute</span>
        ${brand.whiteLabel ? '' : html`<span>Powered by <a href="${c.baseUrl}/?ref=status">${c.brandName}</a></span>`}
      </footer>
    </div>
  </div>`;
  return layout(ctx, req, {
    title: `${page.title} status`,
    description: `Live status and uptime history for ${page.title}.`,
    body,
    bare: true,
    canonical: `/status/${page.slug}`,
    head: html`<meta http-equiv="refresh" content="60">`,
  });
}

export function badgeSvg({ label = 'status', message, color }) {
  const charW = 6.5;
  const lw = Math.round(label.length * charW + 12);
  const mw = Math.round(message.length * charW + 12);
  const w = lw + mw;
  const l = escapeHtml(label);
  const m = escapeHtml(message);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${m}"><title>${l}: ${m}</title><clipPath id="r"><rect width="${w}" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${mw}" height="20" fill="${color}"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="14">${l}</text><text x="${lw + mw / 2}" y="14">${m}</text></g></svg>`;
}
