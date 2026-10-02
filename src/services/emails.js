// Email templates. Each returns { subject, html, text }. Emails use inline styles and
// simple tables so they render consistently in Gmail, Outlook and Apple Mail.
import { escapeHtml as e } from '../lib/html.js';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatMs,
  daysUntil,
  hostnameOf,
} from '../lib/format.js';

const INK = '#0b0b0b';
const MUTED = '#52514e';
const LINE = '#e1e0d9';
const ACCENT = '#2a78d6';

function button(href, label, color = ACCENT) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:${color};border-radius:8px"><a href="${e(href)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:600;text-decoration:none;font-size:15px">${e(label)}</a></td></tr></table>`;
}

function layout({ config, title, body, brand, footerNote = '', unsubscribeUrl = '' }) {
  const brandName = brand?.name || config.brandName;
  const color = brand?.color || ACCENT;
  const logo = brand?.logoUrl
    ? `<img src="${e(brand.logoUrl)}" alt="${e(brandName)}" style="max-height:40px;max-width:200px;display:block">`
    : `<span style="font-size:18px;font-weight:700;color:${INK}"><span style="color:${color}">&#9679;</span> ${e(brandName)}</span>`;
  const address = config.companyAddress ? `<br>${e(config.companyName)} · ${e(config.companyAddress)}` : '';
  const unsubscribe = unsubscribeUrl
    ? `<br><a href="${e(unsubscribeUrl)}" style="color:${MUTED}">Unsubscribe from tips and product emails</a>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:12px;border:1px solid ${LINE};table-layout:fixed">
<tr><td style="padding:24px 28px 8px">${logo}</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6">${body}</td></tr>
</table>
<p style="max-width:620px;font-size:12px;color:${MUTED};line-height:1.5;margin:16px auto 0">${footerNote}${address}${unsubscribe}</p>
</td></tr></table></body></html>`;
}

const h1 = (text) => `<h1 style="font-size:22px;line-height:1.3;margin:12px 0 12px">${text}</h1>`;
const p = (text) => `<p style="margin:0 0 14px">${text}</p>`;

export function loginEmail({ config, link }) {
  const subject = `Your ${config.brandName} sign-in link`;
  const html = layout({
    config,
    title: subject,
    body:
      h1('Sign in to your account') +
      p('Click the button below to sign in. This link expires in 20 minutes and can be used once.') +
      button(link, `Sign in to ${config.brandName}`) +
      p(`<span style="color:${MUTED};font-size:13px">If you didn't request this, you can safely ignore this email.</span>`),
  });
  const text = `Sign in to ${config.brandName}:\n\n${link}\n\nThis link expires in 20 minutes. If you didn't request it, ignore this email.`;
  return { subject, html, text };
}

export function welcomeEmail({ config, user, monitorUrl }) {
  const subject = `Welcome to ${config.brandName} — you're protected`;
  const dashboard = `${config.baseUrl}/app`;
  const first = monitorUrl
    ? p(`We're already watching <strong>${e(hostnameOf(monitorUrl))}</strong>. You'll hear from us the moment it goes down, and well before its SSL certificate or domain expires.`)
    : p('Add the first website you care about — it takes 10 seconds — and we will watch its uptime, SSL certificate and domain renewal around the clock.');
  const html = layout({
    config,
    title: subject,
    body:
      h1(`Welcome to ${e(config.brandName)}`) +
      first +
      p('Three things worth doing next:') +
      `<ol style="margin:0 0 14px;padding-left:20px">
        <li>Add every site you're responsible for (your free plan covers ${config.plans.free.monitors}).</li>
        <li>Connect Slack, Discord or a webhook so alerts reach the right people.</li>
        <li>Create a public status page and share it with your clients.</li>
      </ol>` +
      button(dashboard, 'Open your dashboard') +
      p(`Questions? Just reply to this email.`),
  });
  const text = `Welcome to ${config.brandName}!\n\n${monitorUrl ? `We're already watching ${hostnameOf(monitorUrl)}.` : 'Add your first website to start monitoring.'}\n\nOpen your dashboard: ${dashboard}\n\nQuestions? Just reply to this email.`;
  return { subject, html, text, email: user.email };
}

const EVENT_COPY = {
  test: () => ({
    emoji: '✅',
    subject: 'Test alert: your alerts are working',
    headline: 'Your alerts are working',
    detail: 'This is a test alert. When a site goes down, recovers, or has an SSL certificate or domain about to expire, the message will arrive here just like this one.',
    text: 'Test alert: if you can read this, your alerts are set up correctly.',
  }),
  down: (m, ev) => ({
    emoji: '🔴',
    subject: `DOWN: ${m.name} is not responding`,
    headline: `${e(m.name)} is down`,
    detail: `We could not reach <strong>${e(m.url)}</strong>.<br>Reason: <strong>${e(ev.error || 'Unknown error')}</strong>`,
    text: `${m.name} (${m.url}) is DOWN. Reason: ${ev.error || 'Unknown error'}`,
  }),
  up: (m, ev) => ({
    emoji: '🟢',
    subject: `RECOVERED: ${m.name} is back up`,
    headline: `${e(m.name)} is back up`,
    detail: `<strong>${e(m.url)}</strong> is responding again after <strong>${formatDuration(ev.downtimeMs)}</strong> of downtime.`,
    text: `${m.name} (${m.url}) is back UP after ${formatDuration(ev.downtimeMs)} of downtime.`,
  }),
  ssl_expiring: (m, ev) => ({
    emoji: '🟠',
    subject: `SSL certificate for ${hostnameOf(m.url)} expires in ${ev.daysLeft} day${ev.daysLeft === 1 ? '' : 's'}`,
    headline: `SSL certificate expires in ${ev.daysLeft} day${ev.daysLeft === 1 ? '' : 's'}`,
    detail: `The certificate for <strong>${e(hostnameOf(m.url))}</strong> expires on <strong>${formatDate(ev.expiresAt)}</strong>. Once it expires, browsers will show visitors a full-page security warning. Renew it with your host or certificate provider (for Let's Encrypt, check that auto-renewal is running).`,
    text: `The SSL certificate for ${hostnameOf(m.url)} expires on ${formatDate(ev.expiresAt)} (${ev.daysLeft} days). Renew it before visitors see security warnings.`,
  }),
  ssl_expired: (m, ev) => ({
    emoji: '🔴',
    subject: `SSL certificate for ${hostnameOf(m.url)} has EXPIRED`,
    headline: 'SSL certificate has expired',
    detail: `The certificate for <strong>${e(hostnameOf(m.url))}</strong> expired on <strong>${formatDate(ev.expiresAt)}</strong>. Visitors are currently seeing a security warning instead of the site.`,
    text: `The SSL certificate for ${hostnameOf(m.url)} expired on ${formatDate(ev.expiresAt)}. Visitors are seeing a security warning.`,
  }),
  ssl_invalid: (m, ev) => ({
    emoji: '🟠',
    subject: `SSL problem on ${hostnameOf(m.url)}: ${ev.error}`,
    headline: 'SSL certificate problem detected',
    detail: `The certificate for <strong>${e(hostnameOf(m.url))}</strong> has a problem: <strong>${e(ev.error)}</strong>. Some visitors may see security warnings.`,
    text: `SSL problem on ${hostnameOf(m.url)}: ${ev.error}`,
  }),
  domain_expiring: (m, ev) => ({
    emoji: '🟠',
    subject: `Domain ${ev.domain} expires in ${ev.daysLeft} day${ev.daysLeft === 1 ? '' : 's'}`,
    headline: `Domain expires in ${ev.daysLeft} day${ev.daysLeft === 1 ? '' : 's'}`,
    detail: `The domain <strong>${e(ev.domain)}</strong> expires on <strong>${formatDate(ev.expiresAt)}</strong>${ev.registrar ? ` (registrar: ${e(ev.registrar)})` : ''}. If it lapses, the website and its email stop working and the name can be bought by someone else. Check that auto-renew is on and the card on file is valid.`,
    text: `The domain ${ev.domain} expires on ${formatDate(ev.expiresAt)} (${ev.daysLeft} days)${ev.registrar ? `, registrar: ${ev.registrar}` : ''}. Make sure it renews.`,
  }),
  domain_expired: (m, ev) => ({
    emoji: '🔴',
    subject: `Domain ${ev.domain} has EXPIRED`,
    headline: 'Domain has expired',
    detail: `The domain <strong>${e(ev.domain)}</strong> expired on <strong>${formatDate(ev.expiresAt)}</strong>. Renew it immediately with ${ev.registrar ? e(ev.registrar) : 'the registrar'} — most registries offer a short grace period.`,
    text: `The domain ${ev.domain} expired on ${formatDate(ev.expiresAt)}. Renew it immediately.`,
  }),
};

export function describeEvent(monitor, event) {
  const make = EVENT_COPY[event.kind];
  if (!make) throw new Error(`Unknown alert kind ${event.kind}`);
  return make(monitor, event);
}

export function alertEmail({ config, monitor, event }) {
  const copy = describeEvent(monitor, event);
  const link = `${config.baseUrl}/app/monitors/${monitor.id}`;
  const html = layout({
    config,
    title: copy.subject,
    body:
      h1(`${copy.emoji} ${copy.headline}`) +
      p(copy.detail) +
      p(`<span style="color:${MUTED};font-size:13px">Detected ${formatDateTime(event.at || Date.now())}</span>`) +
      button(link, 'View monitor'),
    footerNote: `You're receiving this alert because you monitor ${e(hostnameOf(monitor.url))} with ${e(config.brandName)}.`,
  });
  return { subject: copy.subject, html, text: `${copy.text}\n\n${link}` };
}

export function nudgeEmail({ config, kind, user, unsubscribeUrl, stats = {} }) {
  const app = `${config.baseUrl}/app`;
  const billing = `${config.baseUrl}/app/billing`;
  const plans = config.plans;
  const variants = {
    first_monitor: {
      subject: 'Your sites are not being watched yet',
      body:
        h1('Add your first site in 10 seconds') +
        p(`You signed up for ${e(config.brandName)} but haven't added a website yet, so nobody is watching for downtime, expiring SSL certificates or lapsing domains.`) +
        p('Paste a URL and we handle the rest — no code, no setup.') +
        button(`${app}/monitors/new`, 'Add a website'),
      text: `You haven't added a website yet. Add one in 10 seconds: ${app}/monitors/new`,
    },
    upgrade: {
      subject: `You've reached the ${plans.free.monitors}-site limit`,
      body:
        h1('Room for more sites?') +
        p(`You're monitoring ${plans.free.monitors} sites — the most the free plan allows. <strong>Pro</strong> covers ${plans.pro.monitors} sites with 1-minute checks and Slack, Discord and webhook alerts for $${plans.pro.monthly}/month.`) +
        p(`Managing client sites? <strong>Agency</strong> covers ${plans.agency.monitors} sites and emails each client a branded monthly uptime report — the easiest way to show clients what they pay you for.`) +
        button(billing, 'Compare plans'),
      text: `You've reached the free plan's ${plans.free.monitors}-site limit. Compare plans: ${billing}`,
    },
    agency: {
      subject: 'Turn monitoring into a reason clients renew',
      body:
        h1('Send clients proof that their site is in good hands') +
        p(`You're watching ${stats.monitors || 'a lot of'} sites. On the <strong>Agency</strong> plan, ${e(config.brandName)} emails each client a monthly report under <em>your</em> brand: uptime, response times, incidents, and SSL and domain renewal dates.`) +
        p('Agencies use it to justify retainers and catch upsell opportunities. Your clients never see our name.') +
        button(billing, `Try Agency free for ${config.stripe.trialDays} days`),
      text: `Agency plan: white-label monthly client reports. Try it: ${billing}`,
    },
    checkin: {
      subject: `Your first two weeks with ${config.brandName}`,
      body:
        h1('Here is what we did for you') +
        p(`In the last 14 days we ran <strong>${(stats.checks || 0).toLocaleString('en-US')}</strong> checks on your sites and caught <strong>${stats.incidents || 0}</strong> outage${stats.incidents === 1 ? '' : 's'}.`) +
        p(`Want faster detection? Pro checks every minute instead of every 5, so you hear about outages up to 4 minutes sooner — $${plans.pro.monthly}/month.`) +
        button(billing, 'See plans'),
      text: `In 14 days we ran ${stats.checks || 0} checks and caught ${stats.incidents || 0} outages. See plans: ${billing}`,
    },
  };
  const v = variants[kind];
  const html = layout({ config, title: v.subject, body: v.body, unsubscribeUrl });
  return { subject: v.subject, html, text: `${v.text}\n\nUnsubscribe: ${unsubscribeUrl}`, email: user.email };
}

function uptimeColor(uptime) {
  if (uptime == null) return MUTED;
  if (uptime >= 99.9) return '#006300';
  if (uptime >= 99) return INK;
  return '#b42318';
}

function expiryLine(label, ms, now) {
  if (!ms) return '';
  const days = daysUntil(ms, now);
  const color = days < 0 ? '#b42318' : days <= 14 ? '#8a5a00' : INK;
  return `<span style="color:${MUTED}">${label}</span> <span style="color:${color};white-space:nowrap">${formatDate(ms)}</span>`;
}


export function reportEmail({ config, report, brand, showPoweredBy }) {
  const now = report.end;
  const color = brand.color || ACCENT;
  const subject = `${report.page.title}: website report for ${report.periodLabel}`;
  const td = 'padding:10px 0;border-bottom:1px solid ' + LINE + ';font-size:14px;line-height:1.7;vertical-align:top';
  const rows = report.monitors
    .map((m) => {
      const renewals = [expiryLine('SSL renews', m.sslExpiresAt, now), expiryLine('Domain renews', m.domainExpiresAt, now)].filter(Boolean);
      return `<tr><td style="${td}">
        <strong>${e(m.name)}</strong> <span style="color:${MUTED}">· ${e(hostnameOf(m.url))}</span><br>
        Uptime <strong style="color:${uptimeColor(m.uptime)}">${formatPercent(m.uptime)}</strong>
        <span style="color:${MUTED}">·</span> Avg. response <strong>${formatMs(m.avgMs)}</strong>
        <span style="color:${MUTED}">·</span> Incidents <strong>${m.incidents}</strong>
        ${renewals.length ? `<br>${renewals.join(' <span style="color:' + MUTED + '">·</span> ')}` : ''}
      </td></tr>`;
    })
    .join('');
  const incidents = report.incidents.length
    ? `<h2 style="font-size:16px;margin:28px 0 8px">Incidents</h2>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${report.incidents
         .map(
           (i) => `<tr><td style="${td}"><strong>${e(i.monitorName)}</strong> was unavailable for ${formatDuration(i.durationMs)}<br><span style="color:${MUTED}">${formatDateTime(i.startedAt)} · ${e(i.cause || 'No response')}</span></td></tr>`,
         )
         .join('')}</table>`
    : `<p style="margin:24px 0 0;color:#006300;font-weight:600">No incidents this month. Every site stayed online.</p>`;
  const renewals = report.monitors.filter(
    (m) =>
      (m.sslExpiresAt && daysUntil(m.sslExpiresAt, now) <= 45) ||
      (m.domainExpiresAt && daysUntil(m.domainExpiresAt, now) <= 60),
  );
  const renewalNote = renewals.length
    ? `<h2 style="font-size:16px;margin:28px 0 8px">Upcoming renewals</h2><ul style="margin:0;padding-left:20px;font-size:14px">${renewals
        .map((m) => {
          const parts = [];
          if (m.sslExpiresAt && daysUntil(m.sslExpiresAt, now) <= 45) parts.push(`SSL certificate renews by ${formatDate(m.sslExpiresAt)}`);
          if (m.domainExpiresAt && daysUntil(m.domainExpiresAt, now) <= 60) parts.push(`domain renews by ${formatDate(m.domainExpiresAt)}`);
          return `<li><strong>${e(hostnameOf(m.url))}</strong>: ${parts.join('; ')}</li>`;
        })
        .join('')}</ul><p style="font-size:13px;color:${MUTED}">We are tracking these and will make sure they renew on time.</p>`
    : '';

  const stat = (label, value, valueColor = INK) =>
    `<td style="padding:10px;border:1px solid ${LINE};border-radius:8px;width:33%;vertical-align:top"><div style="font-size:12px;color:${MUTED}">${label}</div><div style="font-size:20px;font-weight:700;color:${valueColor};white-space:nowrap">${value}</div></td>`;

  const body =
    h1(`Website report · ${e(report.periodLabel)}`) +
    p(`Here is how <strong>${e(report.page.title)}</strong> performed last month. We monitored ${report.monitors.length} site${report.monitors.length === 1 ? '' : 's'} around the clock.`) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:8px 0 20px"><tr>
      ${stat('Overall uptime', formatPercent(report.overall.uptime), uptimeColor(report.overall.uptime))}
      ${stat('Incidents', String(report.overall.incidents))}
      ${stat('Avg. response', formatMs(report.overall.avgMs))}
    </tr></table>
    <h2 style="font-size:16px;margin:8px 0 4px">Sites</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` +
    incidents +
    renewalNote +
    button(`${config.baseUrl}/status/${report.page.slug}`, 'View live status page', color);

  const poweredBy = showPoweredBy
    ? `Monitoring by <a href="${e(config.baseUrl)}/?ref=report" style="color:${MUTED}">${e(config.brandName)}</a>. `
    : '';
  const html = layout({
    config: showPoweredBy ? config : { ...config, companyAddress: '' },
    title: subject,
    body,
    brand,
    footerNote: `${poweredBy}Report period: ${formatDate(report.start)} – ${formatDate(report.end - 1)} (UTC).`,
  });
  const text = [
    `Website report for ${report.page.title} — ${report.periodLabel}`,
    `Overall uptime: ${formatPercent(report.overall.uptime)} · Incidents: ${report.overall.incidents} · Avg. response: ${formatMs(report.overall.avgMs)}`,
    '',
    ...report.monitors.map(
      (m) => `${m.name} (${hostnameOf(m.url)}): uptime ${formatPercent(m.uptime)}, avg ${formatMs(m.avgMs)}, incidents ${m.incidents}, SSL expires ${formatDate(m.sslExpiresAt)}, domain expires ${formatDate(m.domainExpiresAt)}`,
    ),
    '',
    `Live status: ${config.baseUrl}/status/${report.page.slug}`,
  ].join('\n');
  return { subject, html, text };
}

export function ownerDigestEmail({ config, stats }) {
  const subject = `${config.brandName} weekly: $${stats.mrr} MRR, ${stats.newUsers} new signups`;
  const row = (label, value) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid ${LINE};color:${MUTED}">${label}</td><td style="padding:8px 0;border-bottom:1px solid ${LINE};text-align:right;font-weight:600">${value}</td></tr>`;
  const body =
    h1('Your business this week') +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row('Monthly recurring revenue', `$${stats.mrr.toLocaleString('en-US')}`)}
      ${row('Paying customers', `${stats.paying} (Pro ${stats.byPlan.pro || 0} · Agency ${stats.byPlan.agency || 0})`)}
      ${row('New signups (7 days)', stats.newUsers)}
      ${row('New paying customers (7 days)', stats.newPaying)}
      ${row('Cancellations (7 days)', stats.churned)}
      ${row('Total users', stats.users)}
      ${row('Sites monitored', stats.monitors)}
      ${row('Checks run (7 days)', stats.checks.toLocaleString('en-US'))}
      ${row('Alerts sent (7 days)', stats.alerts)}
    </table>` +
    p('') +
    p(stats.actions.length ? `<strong>Worth a look:</strong><br>${stats.actions.map(e).join('<br>')}` : 'Nothing needs your attention. Enjoy your week.') +
    button(`${config.baseUrl}/admin`, 'Open admin dashboard');
  const text = `MRR $${stats.mrr} · paying ${stats.paying} · new signups ${stats.newUsers} · cancellations ${stats.churned}\n${stats.actions.join('\n')}\n${config.baseUrl}/admin`;
  return { subject, html: layout({ config, title: subject, body }), text };
}
