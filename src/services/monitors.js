// Monitors (websites being watched), status pages, alert channels and their statistics.
import net from 'node:net';
import { UserError } from '../lib/errors.js';
import { isPrivateAddress } from '../lib/netguard.js';
import { DAY, utcDay, hostnameOf } from '../lib/format.js';

export function normalizeUrl(input, { allowPrivate = false } = {}) {
  let value = String(input || '').trim();
  if (!value) throw new UserError('Please enter a website address.');
  if (value.length > 2000) throw new UserError('That URL is too long.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UserError('That does not look like a valid website address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UserError('Only http:// and https:// addresses can be monitored.');
  if (url.username || url.password) throw new UserError('URLs with embedded credentials are not supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const isIp = net.isIP(host) !== 0;
  if (!allowPrivate) {
    if (isIp && isPrivateAddress(host)) throw new UserError('Private and local network addresses cannot be monitored.');
    if (!isIp && (!host.includes('.') || /\.(local|internal|localhost|lan|home|corp)$/i.test(host) || host === 'localhost')) {
      throw new UserError('Please enter a public website address, like example.com.');
    }
  }
  url.hash = '';
  return url.toString();
}

// Stops tracking a monitor's current state (its URL changed or it was paused): closes any
// open incident so it is not counted as downtime forever, and the next check starts fresh.
export function resetMonitorState(db, monitorId, now = Date.now()) {
  db.run('UPDATE incidents SET resolved_at = ? WHERE monitor_id = ? AND resolved_at IS NULL', now, monitorId);
  db.run("UPDATE monitors SET status = 'pending', status_since = NULL, consecutive_failures = 0 WHERE id = ?", monitorId);
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

const RESERVED_SLUGS = new Set(['admin', 'app', 'api', 'login', 'status', 'www', 'help', 'support', 'billing', 'demo']);

export function createMonitorService({ db, config, accounts }) {
  const allowPrivate = config.allowPrivateTargets;

  function intervalFor(plan, requested) {
    const value = Number.parseInt(requested, 10) || plan.minInterval;
    const allowed = [60, 120, 300, 600, 900, 1800, 3600];
    const snapped = allowed.find((v) => v >= value) || 3600;
    return Math.max(snapped, plan.minInterval);
  }

  function ownedPageId(userId, pageId) {
    if (!pageId) return null;
    const page = db.get('SELECT id FROM pages WHERE id = ? AND user_id = ?', Number(pageId), userId);
    return page ? page.id : null;
  }

  function create(user, input, now = Date.now()) {
    const plan = accounts.planOf(user);
    const count = db.get('SELECT COUNT(*) AS n FROM monitors WHERE user_id = ?', user.id).n;
    if (count >= plan.monitors) {
      throw new UserError(`Your ${plan.name} plan includes ${plan.monitors} sites. Upgrade to add more.`, 402);
    }
    const url = normalizeUrl(input.url, { allowPrivate });
    const name = String(input.name || '').trim().slice(0, 80) || hostnameOf(url).replace(/^www\./, '');
    const keyword = String(input.keyword || '').trim().slice(0, 200) || null;
    const result = db.run(
      `INSERT INTO monitors (user_id, page_id, name, url, keyword, interval_sec, next_check_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      ownedPageId(user.id, input.pageId),
      name,
      url,
      keyword,
      intervalFor(plan, input.interval),
      now,
      now,
    );
    return get(user.id, Number(result.lastInsertRowid));
  }

  function update(user, id, input, now = Date.now()) {
    const monitor = get(user.id, id);
    if (!monitor) throw new UserError('Monitor not found.', 404);
    const plan = accounts.planOf(user);
    const url = normalizeUrl(input.url, { allowPrivate });
    const urlChanged = url !== monitor.url;
    const name = String(input.name || '').trim().slice(0, 80) || hostnameOf(url).replace(/^www\./, '');
    db.run(
      `UPDATE monitors SET name = ?, url = ?, keyword = ?, interval_sec = ?, page_id = ?, next_check_at = ?
       ${urlChanged ? ", status = 'pending', status_since = NULL, consecutive_failures = 0, ssl_checked_at = 0, domain_checked_at = 0, ssl_expires_at = NULL, domain_expires_at = NULL, ssl_alerted_days = NULL, domain_alerted_days = NULL, ssl_error = NULL, domain_error = NULL" : ''}
       WHERE id = ? AND user_id = ?`,
      name,
      url,
      String(input.keyword || '').trim().slice(0, 200) || null,
      intervalFor(plan, input.interval),
      ownedPageId(user.id, input.pageId),
      now,
      id,
      user.id,
    );
    if (urlChanged) resetMonitorState(db, monitor.id, now);
    return get(user.id, id);
  }

  function get(userId, id) {
    return db.get('SELECT * FROM monitors WHERE id = ? AND user_id = ?', Number(id), userId);
  }

  function list(userId, now = Date.now()) {
    const since = utcDay(now - 29 * DAY);
    return db.all(
      `SELECT m.*, p.title AS page_title,
         (SELECT CAST(SUM(up) AS REAL) * 100 / NULLIF(SUM(checks), 0) FROM daily_stats d WHERE d.monitor_id = m.id AND d.day >= ?) AS uptime30
       FROM monitors m LEFT JOIN pages p ON p.id = m.page_id
       WHERE m.user_id = ? ORDER BY CASE m.status WHEN 'down' THEN 0 ELSE 1 END, m.name COLLATE NOCASE`,
      since,
      userId,
    );
  }

  function setPaused(user, id, paused) {
    const monitor = get(user.id, id);
    if (!monitor) throw new UserError('Monitor not found.', 404);
    if (!paused && monitor.paused_reason === 'plan_limit') {
      throw new UserError('This site is paused because your plan limit was reached. Upgrade to resume it.', 402);
    }
    const now = Date.now();
    db.run(
      'UPDATE monitors SET paused = ?, paused_reason = ?, next_check_at = ? WHERE id = ?',
      paused ? 1 : 0,
      paused ? 'user' : null,
      now,
      monitor.id,
    );
    if (paused) resetMonitorState(db, monitor.id, now);
  }

  function remove(user, id) {
    db.run('DELETE FROM monitors WHERE id = ? AND user_id = ?', Number(id), user.id);
  }

  function checkNow(user, id) {
    const monitor = get(user.id, id);
    if (!monitor) throw new UserError('Monitor not found.', 404);
    db.run('UPDATE monitors SET next_check_at = 0, ssl_checked_at = 0 WHERE id = ?', monitor.id);
  }

  // ---- statistics ---------------------------------------------------------

  function dailyBars(monitorId, days = 90, now = Date.now()) {
    const since = utcDay(now - (days - 1) * DAY);
    const rows = db.all('SELECT day, checks, up, total_ms FROM daily_stats WHERE monitor_id = ? AND day >= ?', monitorId, since);
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = utcDay(now - i * DAY);
      const r = byDay.get(day);
      out.push({
        day,
        checks: r?.checks || 0,
        uptime: r && r.checks ? (r.up * 100) / r.checks : null,
        avgMs: r && r.up ? r.total_ms / r.up : null,
      });
    }
    return out;
  }

  function uptimeBetween(monitorId, startMs, endMs) {
    const row = db.get(
      'SELECT SUM(checks) AS checks, SUM(up) AS up, SUM(total_ms) AS total_ms FROM daily_stats WHERE monitor_id = ? AND day >= ? AND day < ?',
      monitorId,
      utcDay(startMs),
      utcDay(endMs),
    );
    return {
      checks: row?.checks || 0,
      uptime: row?.checks ? (row.up * 100) / row.checks : null,
      avgMs: row?.up ? row.total_ms / row.up : null,
    };
  }

  function responseSeries(monitorId, hours = 24, now = Date.now()) {
    return db.all(
      'SELECT at, ok, ms FROM check_results WHERE monitor_id = ? AND at >= ? ORDER BY at',
      monitorId,
      now - hours * 3600_000,
    );
  }

  function incidents(monitorId, limit = 20) {
    return db.all('SELECT * FROM incidents WHERE monitor_id = ? ORDER BY started_at DESC LIMIT ?', monitorId, limit);
  }

  // ---- status pages -------------------------------------------------------

  function listPages(userId) {
    return db.all(
      `SELECT p.*, (SELECT COUNT(*) FROM monitors m WHERE m.page_id = p.id) AS monitor_count
       FROM pages p WHERE p.user_id = ? ORDER BY p.title COLLATE NOCASE`,
      userId,
    );
  }

  const getPage = (userId, id) => db.get('SELECT * FROM pages WHERE id = ? AND user_id = ?', Number(id), userId);
  const pageBySlug = (slug) => db.get('SELECT * FROM pages WHERE slug = ?', String(slug).toLowerCase());

  function validateSlug(slug, exceptId = null) {
    if (!SLUG_RE.test(slug)) throw new UserError('Page address may use lowercase letters, numbers and dashes (3–50 characters).');
    if (RESERVED_SLUGS.has(slug)) throw new UserError('That page address is reserved. Please choose another.');
    const existing = pageBySlug(slug);
    if (existing && existing.id !== exceptId) throw new UserError('That page address is already taken.');
  }

  function parseEmails(value) {
    const emails = String(value || '')
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    for (const email of emails) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError(`"${email}" is not a valid email address.`);
    }
    if (emails.length > 10) throw new UserError('Up to 10 report recipients per client.');
    return emails.join(', ');
  }

  function createPage(user, input, now = Date.now()) {
    const plan = accounts.planOf(user);
    const count = db.get('SELECT COUNT(*) AS n FROM pages WHERE user_id = ?', user.id).n;
    if (count >= plan.pages) throw new UserError(`Your ${plan.name} plan includes ${plan.pages} status page${plan.pages === 1 ? '' : 's'}. Upgrade to add more.`, 402);
    const title = String(input.title || '').trim().slice(0, 80);
    if (!title) throw new UserError('Please give the page a name, such as your client’s company name.');
    let slug = slugify(input.slug || title);
    if (slug.length < 3) slug = `${slug || 'status'}-page`;
    if (!input.slug) {
      let candidate = slug;
      for (let n = 2; pageBySlug(candidate) || RESERVED_SLUGS.has(candidate); n++) candidate = `${slug}-${n}`;
      slug = candidate;
    }
    validateSlug(slug);
    const reportEmails = plan.reports ? parseEmails(input.reportEmails) : '';
    const result = db.run(
      'INSERT INTO pages (user_id, slug, title, report_emails, created_at) VALUES (?, ?, ?, ?, ?)',
      user.id,
      slug,
      title,
      reportEmails || null,
      now,
    );
    const page = getPage(user.id, Number(result.lastInsertRowid));
    if (input.monitorIds) assignMonitors(user, page.id, input.monitorIds);
    return page;
  }

  function updatePage(user, id, input) {
    const page = getPage(user.id, id);
    if (!page) throw new UserError('Page not found.', 404);
    const plan = accounts.planOf(user);
    const title = String(input.title || '').trim().slice(0, 80);
    if (!title) throw new UserError('Please give the page a name.');
    const slug = slugify(input.slug || page.slug);
    validateSlug(slug, page.id);
    const reportEmails = plan.reports ? parseEmails(input.reportEmails) : page.report_emails;
    db.run('UPDATE pages SET title = ?, slug = ?, report_emails = ? WHERE id = ?', title, slug, reportEmails || null, page.id);
    assignMonitors(user, page.id, input.monitorIds || []);
    return getPage(user.id, id);
  }

  function assignMonitors(user, pageId, monitorIds) {
    const ids = new Set((Array.isArray(monitorIds) ? monitorIds : [monitorIds]).map(Number).filter(Boolean));
    db.tx(() => {
      for (const m of db.all('SELECT id, page_id FROM monitors WHERE user_id = ?', user.id)) {
        if (ids.has(m.id) && m.page_id !== pageId) db.run('UPDATE monitors SET page_id = ? WHERE id = ?', pageId, m.id);
        if (!ids.has(m.id) && m.page_id === pageId) db.run('UPDATE monitors SET page_id = NULL WHERE id = ?', m.id);
      }
    });
  }

  function deletePage(user, id) {
    db.run('DELETE FROM pages WHERE id = ? AND user_id = ?', Number(id), user.id);
  }

  const pageMonitors = (pageId) =>
    db.all('SELECT * FROM monitors WHERE page_id = ? ORDER BY name COLLATE NOCASE', pageId);

  // ---- alert channels -----------------------------------------------------

  const CHANNEL_TYPES = {
    email: { label: 'Email', validate: (t) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t), hint: 'a valid email address' },
    slack: { label: 'Slack', validate: (t) => /^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(t), hint: 'a Slack incoming webhook URL (https://hooks.slack.com/services/…)' },
    discord: { label: 'Discord', validate: (t) => /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\S+$/.test(t), hint: 'a Discord webhook URL (https://discord.com/api/webhooks/…)' },
    webhook: { label: 'Webhook', validate: (t) => /^https?:\/\/\S+$/.test(t), hint: 'an http(s) URL that accepts JSON POST requests' },
  };

  function listChannels(userId) {
    return db.all('SELECT * FROM channels WHERE user_id = ? ORDER BY id', userId);
  }

  function createChannel(user, input, now = Date.now()) {
    const type = String(input.type || '');
    const def = CHANNEL_TYPES[type];
    if (!def) throw new UserError('Choose a channel type.');
    const plan = accounts.planOf(user);
    if (!plan.channels.includes(type)) throw new UserError(`${def.label} alerts are available on paid plans. Upgrade to connect ${def.label}.`, 402);
    const target = String(input.target || '').trim();
    if (!def.validate(target)) throw new UserError(`Please enter ${def.hint}.`);
    if (type === 'webhook') normalizeUrl(target, { allowPrivate });
    const count = db.get('SELECT COUNT(*) AS n FROM channels WHERE user_id = ?', user.id).n;
    if (count >= 20) throw new UserError('You can add up to 20 alert channels.');
    const label = String(input.label || '').trim().slice(0, 60) || null;
    const result = db.run('INSERT INTO channels (user_id, type, target, label, created_at) VALUES (?, ?, ?, ?, ?)', user.id, type, target, label, now);
    return db.get('SELECT * FROM channels WHERE id = ?', Number(result.lastInsertRowid));
  }

  const getChannel = (userId, id) => db.get('SELECT * FROM channels WHERE id = ? AND user_id = ?', Number(id), userId);
  const deleteChannel = (user, id) => db.run('DELETE FROM channels WHERE id = ? AND user_id = ?', Number(id), user.id);

  return {
    create,
    update,
    get,
    list,
    setPaused,
    remove,
    checkNow,
    dailyBars,
    uptimeBetween,
    responseSeries,
    incidents,
    listPages,
    getPage,
    pageBySlug,
    createPage,
    updatePage,
    deletePage,
    pageMonitors,
    CHANNEL_TYPES,
    listChannels,
    createChannel,
    getChannel,
    deleteChannel,
    intervalFor,
  };
}
