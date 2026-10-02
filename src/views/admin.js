// Owner-only dashboard with the numbers that matter.
import { html } from '../lib/html.js';
import { layout } from './layout.js';
import { statTile, csrfField } from './components.js';
import { formatDate, timeAgo, formatMoney } from '../lib/format.js';

export function adminPage(ctx, req, { o, users, backups }) {
  const health = o.lastTick && Date.now() - o.lastTick < 5 * 60_000;
  const body = html`<div class="container app-body">
    <div class="page-head"><div><h1>Business dashboard</h1>
      <p class="muted">Scheduler: ${health ? html`<span class="good-text">running</span>` : html`<strong class="bad-text">not running</strong>`} (last tick ${timeAgo(o.lastTick)}) · email: ${ctx.config.email.provider} · billing: ${ctx.config.stripe.enabled ? 'Stripe connected' : html`<strong class="warn-text">Stripe not configured</strong>`}</p></div></div>
    <div class="stats">
      ${statTile('Monthly recurring revenue', formatMoney(o.mrr), `${formatMoney(o.arr)} annualised`)}
      ${statTile('Paying customers', o.paying, `${o.trialing} on trial`)}
      ${statTile('Users', o.users, `${o.signups7} new in 7 days · ${o.signups30} in 30`)}
      ${statTile('Plans', `${o.byPlan.agency || 0} / ${o.byPlan.pro || 0} / ${o.byPlan.free || 0}`, 'Agency / Pro / Free')}
      ${statTile('Sites monitored', o.activeMonitors, `${o.down} down right now · ${o.pages} status pages`)}
      ${statTile('Checks · 24h', o.checks24h.toLocaleString('en-US'), `${o.alerts7} alerts in 7 days`)}
    </div>
    <section class="card flush">
      <h2 class="card-title pad">Latest users</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Email</th><th>Plan</th><th>Status</th><th class="num">Sites</th><th>Joined</th><th>Last sign-in</th><th>Comp plan</th></tr></thead>
        <tbody>${users.map(
          (u) => html`<tr>
            <td class="break">${u.email}</td>
            <td>${u.plan_override ? `${u.plan_override} (comp)` : u.plan}</td>
            <td class="small">${u.subscription_status || '—'}</td>
            <td class="num">${u.monitor_count}</td>
            <td class="small">${formatDate(u.created_at)}</td>
            <td class="small">${timeAgo(u.last_login_at)}</td>
            <td><form method="post" action="/admin/users/${u.id}/override" class="inline-form">${csrfField(req)}
              <select name="plan" aria-label="Complimentary plan"><option value="">None</option>${['pro', 'agency'].map((p) => html`<option value="${p}" ${u.plan_override === p ? 'selected' : ''}>${p}</option>`)}</select>
              <button class="btn btn-ghost btn-sm" type="submit">Set</button></form></td>
          </tr>`,
        )}</tbody>
      </table></div>
    </section>
    <section class="card">
      <h2 class="card-title">Backups</h2>
      ${backups.length
        ? html`<ul>${backups.map((b) => html`<li><a href="/admin/backups/${b}">${b}</a></li>`)}</ul>`
        : html`<p class="muted small">No backups yet. Set BACKUP_DIR to enable daily database backups.</p>`}
    </section>
  </div>`;
  return layout(ctx, req, { title: 'Admin', body, app: true });
}
