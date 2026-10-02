// Screens inside the logged-in app.
import { html } from '../lib/html.js';
import { layout } from './layout.js';
import { statusPill, expiryBadge, uptimeBars, responseChart, statTile, dailyTable, csrfField, UPTIME_LEGEND } from './components.js';
import { formatPercent, formatMs, timeAgo, formatDateTime, formatDate, formatDuration, hostnameOf, formatMoney } from '../lib/format.js';

const INTERVALS = [
  [60, 'Every minute'],
  [120, 'Every 2 minutes'],
  [300, 'Every 5 minutes'],
  [600, 'Every 10 minutes'],
  [900, 'Every 15 minutes'],
  [1800, 'Every 30 minutes'],
  [3600, 'Every hour'],
];

function appLayout(ctx, req, title, body) {
  return layout(ctx, req, { title, body: html`<div class="container app-body">${body}</div>`, app: true });
}

function usageBar(used, limit) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return html`<div class="usage"><div class="usage-track"><div class="usage-fill ${pct >= 100 ? 'full' : pct >= 80 ? 'high' : ''}" style="width:${pct}%"></div></div><span class="small muted">${used} of ${limit} sites</span></div>`;
}

export function dashboardPage(ctx, req, { monitors, plan }) {
  const now = Date.now();
  const down = monitors.filter((m) => m.status === 'down' && !m.paused).length;
  const expiring = monitors.filter(
    (m) => (m.ssl_expires_at && m.ssl_expires_at - now < 14 * 86400_000) || (m.domain_expires_at && m.domain_expires_at - now < 30 * 86400_000),
  ).length;
  const atLimit = monitors.length >= plan.monitors;

  const empty = html`<div class="card empty">
    <h2>Add your first website</h2>
    <p class="muted">Paste any URL. We'll start checking uptime right away and look up its SSL certificate and domain expiry within a minute.</p>
    <form method="post" action="/app/monitors" class="inline-add">
      ${csrfField(req)}
      <input name="url" type="text" inputmode="url" placeholder="yourclient.com" required autofocus aria-label="Website URL">
      <button class="btn btn-primary" type="submit">Start monitoring</button>
    </form>
  </div>`;

  const table = html`<div class="card flush">
    <div class="table-wrap">
      <table class="table monitors">
        <thead><tr><th>Site</th><th>Status</th><th class="num">Uptime 30d</th><th class="num">Response</th><th>SSL expires</th><th>Domain expires</th><th class="hide-sm">Last check</th></tr></thead>
        <tbody>
          ${monitors.map(
            (m) => html`<tr class="${m.status === 'down' && !m.paused ? 'row-down' : ''}">
              <td><a class="row-link" href="/app/monitors/${m.id}"><strong>${m.name}</strong><span class="muted small block">${hostnameOf(m.url)}${m.page_title ? html` · ${m.page_title}` : ''}</span></a></td>
              <td>${statusPill(m)}${m.status === 'down' && m.last_error ? html`<span class="small muted block">${m.last_error}</span>` : ''}</td>
              <td class="num">${formatPercent(m.uptime30)}</td>
              <td class="num">${m.status === 'up' ? formatMs(m.last_response_ms) : '—'}</td>
              <td>${m.url.startsWith('https://') ? expiryBadge(m.ssl_expires_at, { error: m.ssl_error, checked: m.ssl_checked_at > 0, now }) : html`<span class="small muted">No HTTPS</span>`}</td>
              <td>${expiryBadge(m.domain_expires_at, { error: m.domain_error, warnDays: 30, checked: m.domain_checked_at > 0, now })}</td>
              <td class="hide-sm small muted">${timeAgo(m.last_checked_at, now)}</td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>
  </div>`;

  const body = html`
    <div class="page-head">
      <div>
        <h1>Your sites</h1>
        ${monitors.length ? html`<p class="muted">${down ? html`<strong class="bad-text">${down} down</strong> · ` : html`<span class="good-text">All sites up</span> · `}${expiring ? html`<strong class="warn-text">${expiring} renewal${expiring === 1 ? '' : 's'} due soon</strong> · ` : ''}${plan.name} plan</p>` : ''}
      </div>
      <div class="page-actions">
        ${usageBar(monitors.length, plan.monitors)}
        ${atLimit ? html`<a class="btn btn-primary" href="/app/billing">Upgrade for more sites</a>` : html`<a class="btn btn-primary" href="/app/monitors/new">Add site</a>`}
      </div>
    </div>
    ${monitors.length ? table : empty}
    ${monitors.length && plan.id === 'free'
      ? html`<div class="card upsell"><div><strong>Managing client sites?</strong> The Agency plan emails every client a branded monthly report and hides our name everywhere.</div><a class="btn btn-secondary" href="/app/billing">See Agency</a></div>`
      : ''}`;
  return appLayout(ctx, req, 'Sites', body);
}

export function monitorFormPage(ctx, req, { monitor = null, plan, pages, values = {}, error = '' }) {
  const v = {
    name: values.name ?? monitor?.name ?? '',
    url: values.url ?? monitor?.url ?? '',
    keyword: values.keyword ?? monitor?.keyword ?? '',
    interval: Number(values.interval ?? monitor?.interval_sec ?? plan.minInterval),
    pageId: Number(values.pageId ?? monitor?.page_id ?? 0),
  };
  const action = monitor ? `/app/monitors/${monitor.id}` : '/app/monitors';
  const body = html`
    <p class="crumbs"><a href="/app">Sites</a>${monitor ? html` / <a href="/app/monitors/${monitor.id}">${monitor.name}</a>` : ''} / ${monitor ? 'Edit' : 'Add site'}</p>
    <div class="card form-card">
      <h1>${monitor ? 'Edit site' : 'Add a site'}</h1>
      ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
      <form method="post" action="${action}" class="stack">
        ${csrfField(req)}
        <label>Website URL
          <input name="url" type="text" inputmode="url" required value="${v.url}" placeholder="https://yourclient.com">
          <span class="hint">We'll monitor uptime, the SSL certificate (for https) and the domain's expiry date.</span></label>
        <label>Display name <span class="muted">(optional)</span>
          <input name="name" type="text" maxlength="80" value="${v.name}" placeholder="Client name or site name"></label>
        <label>Check frequency
          <select name="interval">
            ${INTERVALS.map(
              ([sec, label]) => html`<option value="${sec}" ${sec === v.interval ? 'selected' : ''} ${sec < plan.minInterval ? 'disabled' : ''}>${label}${sec < plan.minInterval ? ' (paid plans)' : ''}</option>`,
            )}
          </select></label>
        <label>Required keyword <span class="muted">(optional)</span>
          <input name="keyword" type="text" maxlength="200" value="${v.keyword}" placeholder="e.g. Add to cart">
          <span class="hint">Mark the site as down if this text is missing from the page — catches broken pages that still return “200 OK”.</span></label>
        ${pages.length
          ? html`<label>Show on status page
              <select name="pageId">
                <option value="">— None —</option>
                ${pages.map((p) => html`<option value="${p.id}" ${p.id === v.pageId ? 'selected' : ''}>${p.title}</option>`)}
              </select></label>`
          : ''}
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">${monitor ? 'Save changes' : 'Start monitoring'}</button>
          <a class="btn btn-ghost" href="${monitor ? `/app/monitors/${monitor.id}` : '/app'}">Cancel</a>
        </div>
      </form>
    </div>`;
  return appLayout(ctx, req, monitor ? 'Edit site' : 'Add site', body);
}

export function monitorDetailPage(ctx, req, { monitor, bars, series, incidents, uptime30, uptime7, avg30 }) {
  const now = Date.now();
  const m = monitor;
  const sslSub = m.ssl_expires_at ? `${formatDate(m.ssl_expires_at)}${m.ssl_issuer ? ` · ${m.ssl_issuer}` : ''}` : m.ssl_error || '';
  const domSub = m.domain_expires_at ? `${formatDate(m.domain_expires_at)}${m.domain_registrar ? ` · ${m.domain_registrar}` : ''}` : m.domain_error || '';
  const body = html`
    <p class="crumbs"><a href="/app">Sites</a> / ${m.name}</p>
    <div class="page-head">
      <div>
        <h1>${m.name} ${statusPill(m)}</h1>
        <p class="muted"><a href="${m.url}" rel="noopener nofollow" target="_blank">${m.url}</a> · checked ${INTERVALS.find(([s]) => s === m.interval_sec)?.[1].toLowerCase() || `every ${m.interval_sec}s`}${m.keyword ? html` · keyword “${m.keyword}”` : ''}</p>
        ${m.status === 'down' && !m.paused ? html`<p class="bad-text"><strong>Down for ${formatDuration(now - m.status_since)}</strong> — ${m.last_error}</p>` : ''}
        ${m.status === 'up' && m.status_since ? html`<p class="small muted">Up for ${formatDuration(now - m.status_since)} · last checked ${timeAgo(m.last_checked_at, now)}</p>` : ''}
      </div>
      <div class="page-actions">
        <form method="post" action="/app/monitors/${m.id}/check" class="inline-form">${csrfField(req)}<button class="btn btn-secondary btn-sm" type="submit">Check now</button></form>
        <form method="post" action="/app/monitors/${m.id}/${m.paused ? 'resume' : 'pause'}" class="inline-form">${csrfField(req)}<button class="btn btn-secondary btn-sm" type="submit">${m.paused ? 'Resume' : 'Pause'}</button></form>
        <a class="btn btn-secondary btn-sm" href="/app/monitors/${m.id}/edit">Edit</a>
      </div>
    </div>

    <div class="stats">
      ${statTile('Uptime · 30 days', formatPercent(uptime30))}
      ${statTile('Uptime · 7 days', formatPercent(uptime7))}
      ${statTile('Avg. response · 30 days', formatMs(avg30))}
      ${statTile('SSL certificate', m.url.startsWith('https://') ? expiryBadge(m.ssl_expires_at, { error: m.ssl_error, checked: m.ssl_checked_at > 0, now }) : 'No HTTPS', sslSub)}
      ${statTile('Domain', expiryBadge(m.domain_expires_at, { error: m.domain_error, warnDays: 30, checked: m.domain_checked_at > 0, now }), domSub)}
    </div>

    <section class="card">
      <h2 class="card-title">Response time · last 24 hours</h2>
      ${responseChart(series, { hours: 24, now })}
    </section>

    <section class="card">
      <h2 class="card-title">Daily uptime · last 90 days</h2>
      ${uptimeBars(bars, { label: `Daily uptime for ${m.name} over the last 90 days` })}
      <div class="bars-axis small muted"><span>90 days ago</span><span>Today</span></div>
      ${UPTIME_LEGEND}
      <details class="table-toggle"><summary>Show as table</summary>${dailyTable(bars.slice(-30))}</details>
    </section>

    <section class="card">
      <h2 class="card-title">Incidents</h2>
      ${incidents.length
        ? html`<div class="table-wrap"><table class="table">
            <thead><tr><th>Started</th><th>Duration</th><th>Cause</th></tr></thead>
            <tbody>${incidents.map(
              (i) => html`<tr><td>${formatDateTime(i.started_at)}</td><td>${i.resolved_at ? formatDuration(i.resolved_at - i.started_at) : html`<strong class="bad-text">Ongoing · ${formatDuration(now - i.started_at)}</strong>`}</td><td>${i.cause}</td></tr>`,
            )}</tbody></table></div>`
        : html`<p class="muted">No incidents recorded. 🎉</p>`}
    </section>

    <section class="card danger-zone">
      <h2 class="card-title">Delete this site</h2>
      <p class="muted small">Stops monitoring and permanently deletes its history.</p>
      <form method="post" action="/app/monitors/${m.id}/delete" data-confirm="Delete ${m.name} and all of its history?">${csrfField(req)}<button class="btn btn-danger btn-sm" type="submit">Delete site</button></form>
    </section>`;
  return appLayout(ctx, req, m.name, body);
}

export function alertsPage(ctx, req, { channels, plan, types, recent }) {
  const locked = (type) => !plan.channels.includes(type);
  const body = html`
    <div class="page-head"><div><h1>Alerts</h1><p class="muted">Where we send down, recovery, SSL and domain alerts.</p></div></div>
    <section class="card">
      <h2 class="card-title">Alert channels</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Type</th><th>Destination</th><th></th></tr></thead>
        <tbody>
          <tr><td>Email</td><td>${req.user.email} <span class="muted small">(your account — always on)</span></td><td></td></tr>
          ${channels.map(
            (c) => html`<tr>
              <td>${types[c.type]?.label || c.type}${locked(c.type) ? html` <span class="pill pill-muted">Paused · upgrade</span>` : ''}</td>
              <td class="break">${c.label ? html`<strong>${c.label}</strong> · ` : ''}<span class="muted">${c.type === 'email' ? c.target : c.target.replace(/(\/\/[^/]+\/).{6,}$/, '$1…')}</span></td>
              <td class="actions">
                <form method="post" action="/app/alerts/${c.id}/test" class="inline-form">${csrfField(req)}<button class="btn btn-ghost btn-sm" type="submit">Send test</button></form>
                <form method="post" action="/app/alerts/${c.id}/delete" class="inline-form" data-confirm="Remove this alert channel?">${csrfField(req)}<button class="btn btn-ghost btn-sm" type="submit">Remove</button></form>
              </td></tr>`,
          )}
        </tbody>
      </table></div>
    </section>
    <section class="card form-card">
      <h2 class="card-title">Add a channel</h2>
      <form method="post" action="/app/alerts" class="stack">
        ${csrfField(req)}
        <label>Type
          <select name="type">
            ${Object.entries(types).map(([key, t]) => html`<option value="${key}" ${locked(key) ? 'disabled' : ''}>${t.label}${locked(key) ? ' — paid plans' : ''}</option>`)}
          </select></label>
        <label>Destination
          <input name="target" type="text" required placeholder="Email address or webhook URL">
          <span class="hint">Slack: create an “Incoming Webhook” in your Slack app settings. Discord: Channel settings → Integrations → Webhooks. Webhook: we POST JSON to your URL.</span></label>
        <label>Label <span class="muted">(optional)</span><input name="label" type="text" maxlength="60" placeholder="e.g. #ops channel"></label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Add channel</button></div>
      </form>
      ${plan.id === 'free' ? html`<p class="small muted">Slack, Discord and webhook alerts are included in <a href="/app/billing">Pro and Agency</a>.</p>` : ''}
    </section>
    <section class="card">
      <h2 class="card-title">Recent alerts</h2>
      ${recent.length
        ? html`<ul class="alert-log">${recent.map((a) => html`<li><span class="muted small">${formatDateTime(a.at)}</span> ${a.message}</li>`)}</ul>`
        : html`<p class="muted">No alerts yet. That's a good thing.</p>`}
    </section>`;
  return appLayout(ctx, req, 'Alerts', body);
}

export function pagesListPage(ctx, req, { pages, plan }) {
  const body = html`
    <div class="page-head">
      <div><h1>Status pages ${plan.reports ? '& client reports' : ''}</h1>
      <p class="muted">Group sites per client. Each group gets a public status page${plan.reports ? ' and a monthly emailed report' : ''}.</p></div>
    </div>
    ${pages.length
      ? html`<div class="card flush"><div class="table-wrap"><table class="table">
          <thead><tr><th>Name</th><th>Public address</th><th class="num">Sites</th><th>Monthly report</th></tr></thead>
          <tbody>${pages.map(
            (p) => html`<tr>
              <td><a class="row-link" href="/app/pages/${p.id}"><strong>${p.title}</strong></a></td>
              <td><a href="/status/${p.slug}" target="_blank" rel="noopener">/status/${p.slug}</a></td>
              <td class="num">${p.monitor_count}</td>
              <td>${plan.reports ? (p.report_emails ? html`<span class="small">${p.report_emails}</span>` : html`<span class="muted small">No recipients</span>`) : html`<span class="muted small">Agency plan</span>`}</td>
            </tr>`,
          )}</tbody></table></div></div>`
      : html`<div class="card empty"><h2>Create your first status page</h2><p class="muted">A public page showing live status and 90-day uptime — perfect to share with a client or link from a website footer.</p></div>`}
    <section class="card form-card">
      <h2 class="card-title">New status page</h2>
      <form method="post" action="/app/pages" class="stack">
        ${csrfField(req)}
        <label>Name<input name="title" type="text" required maxlength="80" placeholder="Client or company name"></label>
        ${plan.reports
          ? html`<label>Monthly report recipients <span class="muted">(optional)</span><input name="reportEmails" type="text" placeholder="client@example.com, owner@example.com"><span class="hint">They'll receive a branded report on the 1st of each month.</span></label>`
          : ''}
        <div class="form-actions"><button class="btn btn-primary" type="submit">Create page</button></div>
      </form>
      ${!plan.reports ? html`<p class="small muted">Want branded monthly reports emailed to each client? <a href="/app/billing">Upgrade to Agency</a>.</p>` : ''}
    </section>`;
  return appLayout(ctx, req, 'Status pages', body);
}

export function pageEditPage(ctx, req, { page, monitors, plan }) {
  const statusUrl = `${ctx.config.baseUrl}/status/${page.slug}`;
  const badge = `${ctx.config.baseUrl}/badge/${page.slug}.svg`;
  const body = html`
    <p class="crumbs"><a href="/app/pages">Status pages</a> / ${page.title}</p>
    <div class="page-head">
      <div><h1>${page.title}</h1><p class="muted"><a href="/status/${page.slug}" target="_blank" rel="noopener">${statusUrl}</a></p></div>
      <div class="page-actions">
        <a class="btn btn-secondary btn-sm" href="/status/${page.slug}" target="_blank" rel="noopener">View page</a>
        <a class="btn btn-secondary btn-sm" href="/app/pages/${page.id}/report" target="_blank" rel="noopener">Preview report</a>
        ${plan.reports
          ? html`<form method="post" action="/app/pages/${page.id}/send-report" class="inline-form">${csrfField(req)}<button class="btn btn-secondary btn-sm" type="submit">Email me a sample report</button></form>`
          : ''}
      </div>
    </div>
    <section class="card form-card">
      <form method="post" action="/app/pages/${page.id}" class="stack">
        ${csrfField(req)}
        <label>Name<input name="title" type="text" required maxlength="80" value="${page.title}"></label>
        <label>Page address<div class="input-prefix"><span>/status/</span><input name="slug" type="text" required value="${page.slug}" pattern="[a-z0-9-]{3,50}"></div></label>
        ${plan.reports
          ? html`<label>Monthly report recipients<input name="reportEmails" type="text" value="${page.report_emails || ''}" placeholder="client@example.com"><span class="hint">Sent automatically on the 1st of each month, from your brand. Leave empty to turn reports off.</span></label>`
          : html`<p class="small muted">Branded monthly client reports are part of the <a href="/app/billing">Agency plan</a>.</p>`}
        <fieldset>
          <legend>Sites on this page</legend>
          ${monitors.length
            ? monitors.map(
                (m) => html`<label class="check"><input type="checkbox" name="monitorIds" value="${m.id}" ${m.page_id === page.id ? 'checked' : ''}> ${m.name} <span class="muted small">${hostnameOf(m.url)}${m.page_id && m.page_id !== page.id ? ` · currently on ${m.page_title}` : ''}</span></label>`,
              )
            : html`<p class="muted small">Add sites first, then come back to group them here.</p>`}
        </fieldset>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Save</button></div>
      </form>
    </section>
    <section class="card">
      <h2 class="card-title">Status badge</h2>
      <p class="muted small">Embed a live status badge on the client's website or in a README.</p>
      <p><img src="/badge/${page.slug}.svg" alt="Status badge preview"></p>
      <pre class="code">&lt;a href="${statusUrl}"&gt;&lt;img src="${badge}" alt="Website status"&gt;&lt;/a&gt;</pre>
    </section>
    <section class="card danger-zone">
      <h2 class="card-title">Delete page</h2>
      <p class="muted small">Sites stay monitored; only the page and its report settings are removed.</p>
      <form method="post" action="/app/pages/${page.id}/delete" data-confirm="Delete this status page?">${csrfField(req)}<button class="btn btn-danger btn-sm" type="submit">Delete page</button></form>
    </section>`;
  return appLayout(ctx, req, page.title, body);
}

export function settingsPage(ctx, req, { user, plan }) {
  const body = html`
    <div class="page-head"><div><h1>Settings</h1></div></div>
    <section class="card form-card">
      <h2 class="card-title">Branding ${plan.whiteLabel ? '' : html`<span class="pill pill-muted">Agency plan</span>`}</h2>
      <p class="muted small">Used on status pages and client reports. On the Agency plan our name is removed everywhere your clients look.</p>
      <form method="post" action="/app/settings/branding" class="stack">
        ${csrfField(req)}
        <label>Agency / brand name<input name="brandName" type="text" maxlength="60" value="${user.brand_name || ''}" placeholder="Your Agency Ltd" ${plan.whiteLabel ? '' : 'disabled'}></label>
        <label>Logo URL<input name="brandLogoUrl" type="url" maxlength="500" value="${user.brand_logo_url || ''}" placeholder="https://youragency.com/logo.png" ${plan.whiteLabel ? '' : 'disabled'}><span class="hint">A PNG or SVG hosted on your website, ideally about 200×50 pixels.</span></label>
        <label>Brand colour<input name="brandColor" type="text" maxlength="7" value="${user.brand_color || ''}" placeholder="#2a78d6" pattern="#[0-9a-fA-F]{6}" ${plan.whiteLabel ? '' : 'disabled'}></label>
        <div class="form-actions">${plan.whiteLabel ? html`<button class="btn btn-primary" type="submit">Save branding</button>` : html`<a class="btn btn-primary" href="/app/billing">Upgrade to Agency</a>`}</div>
      </form>
    </section>
    <section class="card form-card">
      <h2 class="card-title">Account</h2>
      <p>Signed in as <strong>${user.email}</strong>. Member since ${formatDate(user.created_at)}.</p>
      <form method="post" action="/app/settings/emails" class="stack">
        ${csrfField(req)}
        <label class="check"><input type="checkbox" name="marketing" value="1" ${user.marketing_opt_out ? '' : 'checked'}> Send me occasional tips and product updates</label>
        <div class="form-actions"><button class="btn btn-secondary btn-sm" type="submit">Save preference</button></div>
      </form>
      <p class="small muted">Alerts and reports you set up are always delivered regardless of this setting.</p>
    </section>
    <section class="card danger-zone">
      <h2 class="card-title">Delete account</h2>
      <p class="muted small">Cancels any subscription immediately and permanently deletes your sites, history, status pages and settings. This cannot be undone.</p>
      <form method="post" action="/app/settings/delete" class="stack" data-confirm="Permanently delete your account and all data?">
        ${csrfField(req)}
        <label>Type <strong>DELETE</strong> to confirm<input name="confirm" type="text" required autocomplete="off"></label>
        <div class="form-actions"><button class="btn btn-danger" type="submit">Delete my account</button></div>
      </form>
    </section>`;
  return appLayout(ctx, req, 'Settings', body);
}

export function billingPage(ctx, req, { user, plan, billingReady, counts, notice }) {
  const c = ctx.config;
  const trial = c.stripe.trialDays;
  const status = user.subscription_status;
  const planCard = (p) => {
    const current = plan.id === p.id;
    const features = [
      `${p.monitors} websites`,
      p.minInterval === 60 ? 'Checks every minute' : 'Checks every 5 minutes',
      p.channels.length > 1 ? 'Slack, Discord & webhooks' : 'Email alerts',
      p.reports ? 'White-label client reports' : `${p.pages} status page${p.pages === 1 ? '' : 's'}`,
    ];
    let action;
    if (current) action = html`<span class="pill pill-good"><span class="dot"></span>Current plan</span>`;
    else if (p.id === 'free') action = user.stripe_customer_id ? html`<span class="small muted">Cancel from “Manage billing”</span>` : '';
    else if (user.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(status))
      action = html`<form method="post" action="/app/billing/portal">${csrfField(req)}<button class="btn btn-secondary btn-block" type="submit">Switch to ${p.name}</button></form>`;
    else if (!billingReady) action = html`<span class="small muted">Coming soon</span>`;
    else
      action = html`<form method="post" action="/app/billing/checkout" class="stack-sm">
        ${csrfField(req)}<input type="hidden" name="plan" value="${p.id}">
        <button class="btn btn-primary btn-block" name="interval" value="month" type="submit">${formatMoney(p.monthly)}/month${trial && !user.stripe_subscription_id ? ` · ${trial}-day trial` : ''}</button>
        <button class="btn btn-ghost btn-block btn-sm" name="interval" value="year" type="submit">or ${formatMoney(p.yearly)}/year (2 months free)</button>
      </form>`;
    return html`<div class="price-card ${current ? 'current' : ''} ${p.id === 'agency' ? 'featured' : ''}">
      <h3>${p.name}</h3><p class="muted small">${p.tagline}</p>
      <div class="price"><span class="amount">${formatMoney(p.monthly)}</span><span class="per">${p.monthly ? '/month' : ''}</span></div>
      <ul class="checks">${features.map((f) => html`<li>${f}</li>`)}</ul>
      ${action}
    </div>`;
  };
  const body = html`
    <div class="page-head"><div><h1>Billing</h1>
      <p class="muted">You're on the <strong>${plan.name}</strong> plan${status === 'trialing' && user.current_period_end ? html` — free trial until ${formatDate(user.current_period_end)}` : ''}${status === 'active' && user.current_period_end ? html` — renews ${formatDate(user.current_period_end)}` : ''}${user.plan_override ? ' (complimentary)' : ''}.
      Using ${counts.monitors} of ${plan.monitors} sites.</p></div>
      ${user.stripe_customer_id
        ? html`<div class="page-actions"><form method="post" action="/app/billing/portal">${csrfField(req)}<button class="btn btn-secondary" type="submit">Manage billing & invoices</button></form></div>`
        : ''}
    </div>
    ${notice === 'success' ? html`<div class="flash flash-success">Thank you! Your plan is active. It can take a few seconds for every limit to update.</div>` : ''}
    ${notice === 'canceled' ? html`<div class="flash flash-info">Checkout was cancelled — no charge was made.</div>` : ''}
    ${status === 'past_due' ? html`<div class="flash flash-error">Your last payment failed. Please update your card in “Manage billing” to keep your plan.</div>` : ''}
    <div class="pricing-grid">${[c.plans.free, c.plans.pro, c.plans.agency].map(planCard)}</div>
    <p class="small muted center">Secure payments by Stripe. Cancel any time from “Manage billing”. Questions? <a href="mailto:${c.supportEmail}">${c.supportEmail}</a></p>`;
  return appLayout(ctx, req, 'Billing', body);
}

export { INTERVALS };
