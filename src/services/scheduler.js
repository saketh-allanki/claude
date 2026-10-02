// The background engine: runs checks when they are due, turns results into incidents and
// alerts, and performs periodic housekeeping (emails, reports, backups, data pruning).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { SSL_THRESHOLDS, DOMAIN_THRESHOLDS } from '../config.js';
import { DAY, utcDay, daysUntil } from '../lib/format.js';
import { registrableDomain } from '../checks/domain.js';
import { nudgeEmail, ownerDigestEmail } from './emails.js';

// Map "days left" to the most urgent threshold crossed (0 = already expired).
export function expiryBucket(daysLeft, thresholds) {
  if (daysLeft == null) return null;
  if (daysLeft < 0) return 0;
  let bucket = null;
  for (const t of thresholds) if (daysLeft <= t) bucket = t;
  return bucket;
}

export function createScheduler(ctx) {
  const { db, config, alerter, checks, accounts, mailer, logger = console } = ctx;
  const s = config.scheduler;
  const inFlight = new Map();
  let timer = null;
  let ticking = false;

  function track(key, promise) {
    const p = promise
      .catch((err) => logger.error(`[scheduler] ${key} failed: ${err.stack || err.message}`))
      .finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  }

  async function notifyAll(monitor, events) {
    for (const event of events) await alerter.notify(monitor, event);
  }

  // ---- HTTP uptime ----------------------------------------------------------

  function applyHttpResult(monitor, result, now = Date.now()) {
    const events = [];
    db.tx(() => {
      db.run('INSERT INTO check_results (monitor_id, at, ok, ms, code) VALUES (?, ?, ?, ?, ?)', monitor.id, now, result.ok ? 1 : 0, result.ms ?? null, result.code ?? null);
      db.run(
        `INSERT INTO daily_stats (monitor_id, day, checks, up, total_ms) VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(monitor_id, day) DO UPDATE SET checks = checks + 1, up = up + excluded.up, total_ms = total_ms + excluded.total_ms`,
        monitor.id,
        utcDay(now),
        result.ok ? 1 : 0,
        result.ok ? result.ms || 0 : 0,
      );

      let status = monitor.status;
      let statusSince = monitor.status_since;
      let failures = monitor.consecutive_failures;
      let next = now + monitor.interval_sec * 1000;

      if (result.ok) {
        if (monitor.status === 'down') {
          db.run('UPDATE incidents SET resolved_at = ? WHERE monitor_id = ? AND resolved_at IS NULL', now, monitor.id);
          events.push({ kind: 'up', downtimeMs: now - (monitor.status_since || now), at: now });
        }
        if (status !== 'up') {
          status = 'up';
          statusSince = now;
        }
        failures = 0;
      } else {
        failures += 1;
        if (status !== 'down') {
          if (failures >= s.confirmFailures) {
            status = 'down';
            statusSince = now;
            db.run('INSERT INTO incidents (monitor_id, started_at, cause) VALUES (?, ?, ?)', monitor.id, now, result.error || 'No response');
            events.push({ kind: 'down', error: result.error, at: now });
          } else {
            // Re-check soon to confirm before alerting (avoids false alarms from network blips).
            next = now + Math.min(s.retryDelayMs, monitor.interval_sec * 1000);
          }
        }
      }

      db.run(
        `UPDATE monitors SET status = ?, status_since = ?, consecutive_failures = ?, last_checked_at = ?, next_check_at = ?,
           last_response_ms = ?, last_status_code = ?, last_error = ? WHERE id = ?`,
        status,
        statusSince,
        failures,
        now,
        next,
        result.ms ?? null,
        result.code ?? null,
        result.ok ? null : result.error || 'Unknown error',
        monitor.id,
      );
    });
    return events;
  }

  async function runHttpCheck(monitor) {
    const result = await checks.http(monitor.url, {
      timeoutMs: s.httpTimeoutMs,
      keyword: monitor.keyword,
      allowPrivate: config.allowPrivateTargets,
      userAgent: `${config.brandName}Bot/1.0 (+${config.baseUrl}/bot)`,
    });
    const fresh = db.get('SELECT * FROM monitors WHERE id = ?', monitor.id);
    if (!fresh || fresh.paused) return;
    const events = applyHttpResult(fresh, result);
    await notifyAll(fresh, events);
  }

  // ---- SSL certificates -----------------------------------------------------

  function applySslResult(monitor, result, now = Date.now()) {
    const events = [];
    let alerted = monitor.ssl_alerted_days;
    let expiresAt = monitor.ssl_expires_at;
    let issuer = monitor.ssl_issuer;
    if (result.validTo) {
      // A later expiry date means the certificate was renewed: reset the alert ladder.
      if (monitor.ssl_expires_at && result.validTo > monitor.ssl_expires_at + DAY) alerted = null;
      expiresAt = result.validTo;
      issuer = result.issuer;
      const daysLeft = daysUntil(result.validTo, now);
      const bucket = expiryBucket(daysLeft, SSL_THRESHOLDS);
      if (bucket != null && (alerted == null || bucket < alerted)) {
        events.push({ kind: bucket === 0 ? 'ssl_expired' : 'ssl_expiring', daysLeft, expiresAt: result.validTo, at: now });
        alerted = bucket;
      }
      const error = result.errorCode === 'CERT_HAS_EXPIRED' ? null : result.error;
      if (error && error !== monitor.ssl_error) events.push({ kind: 'ssl_invalid', error, at: now });
    }
    db.run(
      'UPDATE monitors SET ssl_expires_at = ?, ssl_issuer = ?, ssl_error = ?, ssl_checked_at = ?, ssl_alerted_days = ? WHERE id = ?',
      expiresAt ?? null,
      issuer ?? null,
      result.error ?? null,
      now,
      alerted ?? null,
      monitor.id,
    );
    return events;
  }

  async function runSslCheck(monitor) {
    const url = new URL(monitor.url);
    const result = await checks.ssl(url.hostname, {
      port: url.port ? Number(url.port) : 443,
      allowPrivate: config.allowPrivateTargets,
    });
    const fresh = db.get('SELECT * FROM monitors WHERE id = ?', monitor.id);
    if (!fresh) return;
    await notifyAll(fresh, applySslResult(fresh, result));
  }

  // ---- Domain registration -------------------------------------------------

  function applyDomainResult(monitor, result, now = Date.now()) {
    const events = [];
    let alerted = monitor.domain_alerted_days;
    if (result.expiresAt) {
      if (monitor.domain_expires_at && result.expiresAt > monitor.domain_expires_at + DAY) alerted = null;
      const daysLeft = daysUntil(result.expiresAt, now);
      const bucket = expiryBucket(daysLeft, DOMAIN_THRESHOLDS);
      if (bucket != null && (alerted == null || bucket < alerted)) {
        events.push({
          kind: bucket === 0 ? 'domain_expired' : 'domain_expiring',
          daysLeft,
          expiresAt: result.expiresAt,
          domain: result.domain,
          registrar: result.registrar,
          at: now,
        });
        alerted = bucket;
      }
    }
    db.run(
      'UPDATE monitors SET domain_expires_at = ?, domain_registrar = ?, domain_error = ?, domain_checked_at = ?, domain_alerted_days = ? WHERE id = ?',
      result.expiresAt ?? monitor.domain_expires_at ?? null,
      result.registrar ?? monitor.domain_registrar ?? null,
      result.ok ? null : result.error ?? null,
      now,
      alerted ?? null,
      monitor.id,
    );
    return events;
  }

  async function runDomainCheck(monitor) {
    const host = new URL(monitor.url).hostname.replace(/^\[|\]$/g, '');
    const result = net.isIP(host) || !host.includes('.')
      ? { ok: false, unsupported: true, error: 'Domain expiry does not apply to this address' }
      : await checks.domain(host);
    const fresh = db.get('SELECT * FROM monitors WHERE id = ?', monitor.id);
    if (!fresh) return;
    await notifyAll(fresh, applyDomainResult(fresh, result));
  }

  // ---- The loop --------------------------------------------------------------

  function dispatchDueChecks(now = Date.now()) {
    const slots = s.concurrency - inFlight.size;
    if (slots <= 0) return;

    const due = db.all('SELECT * FROM monitors WHERE paused = 0 AND next_check_at <= ? ORDER BY next_check_at LIMIT ?', now, slots);
    for (const m of due) {
      const key = `http:${m.id}`;
      if (inFlight.has(key)) continue;
      // Push the next check out now so a slow check is never started twice.
      db.run('UPDATE monitors SET next_check_at = ? WHERE id = ?', now + m.interval_sec * 1000, m.id);
      track(key, runHttpCheck(m));
    }

    const sslDue = db.all(
      "SELECT * FROM monitors WHERE paused = 0 AND url LIKE 'https://%' AND ssl_checked_at <= ? ORDER BY ssl_checked_at LIMIT 5",
      now - s.sslEveryMs,
    );
    for (const m of sslDue) {
      const key = `ssl:${m.id}`;
      if (inFlight.has(key)) continue;
      db.run('UPDATE monitors SET ssl_checked_at = ? WHERE id = ?', now, m.id);
      track(key, runSslCheck(m));
    }

    const domainDue = db.all('SELECT * FROM monitors WHERE paused = 0 AND domain_checked_at <= ? ORDER BY domain_checked_at LIMIT 5', now - s.domainEveryMs);
    for (const m of domainDue) {
      const key = `domain:${registrableDomain(new URL(m.url).hostname)}:${m.id}`;
      if (inFlight.has(key)) continue;
      db.run('UPDATE monitors SET domain_checked_at = ? WHERE id = ?', now, m.id);
      track(key, runDomainCheck(m));
    }
  }

  // Run a job at most once per period, remembering the last run in the kv table.
  async function once(key, fn) {
    if (db.kvGet(key)) return false;
    db.kvSet(key, Date.now());
    await fn();
    return true;
  }

  async function housekeeping(now = Date.now()) {
    const hourKey = new Date(now).toISOString().slice(0, 13);
    await once(`job:hourly:${hourKey}`, async () => {
      prune(now);
      await sendLifecycleEmails(now);
    });
    if (ctx.reports) await ctx.reports.sendDueReports(now);
    const d = new Date(now);
    if (d.getUTCDay() === 1 && d.getUTCHours() >= 8) {
      await once(`job:digest:${utcDay(now)}`, () => sendOwnerDigest(now));
    }
    if (config.backupDir) {
      await once(`job:backup:${utcDay(now)}`, async () => backup(now));
    }
  }

  function prune(now) {
    db.run('DELETE FROM check_results WHERE at < ?', now - 3 * DAY);
    db.run('DELETE FROM daily_stats WHERE day < ?', utcDay(now - 400 * DAY));
    db.run('DELETE FROM sessions WHERE expires_at < ?', now);
    db.run('DELETE FROM login_tokens WHERE expires_at < ?', now - DAY);
    db.run('DELETE FROM alert_log WHERE at < ?', now - 180 * DAY);
    db.run("DELETE FROM kv WHERE key LIKE 'job:hourly:%' AND updated_at < ?", now - 7 * DAY);
  }

  async function sendLifecycleEmails(now) {
    const unsubscribeUrl = (user) => ctx.unsubscribeUrl(user);
    const send = async (user, kind, stats) => {
      if (!accounts.markEvent(user.id, `email:${kind}`, now)) return;
      const msg = nudgeEmail({ config, kind, user, unsubscribeUrl: unsubscribeUrl(user), stats });
      await mailer.trySend({ to: user.email, subject: msg.subject, html: msg.html, text: msg.text, replyTo: config.supportEmail });
    };
    const candidates = db.all(
      `SELECT u.*, (SELECT COUNT(*) FROM monitors m WHERE m.user_id = u.id) AS monitor_count
       FROM users u WHERE u.marketing_opt_out = 0 AND u.created_at > ? AND u.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM user_events e WHERE e.user_id = u.id AND e.key = 'email:checkin')`,
      now - 60 * DAY,
      now - DAY,
    );
    for (const user of candidates) {
      const plan = accounts.planId(user);
      const age = now - user.created_at;
      if (user.monitor_count === 0 && age < 7 * DAY) {
        await send(user, 'first_monitor');
      } else if (plan === 'free' && user.monitor_count >= config.plans.free.monitors && age > 3 * DAY) {
        await send(user, 'upgrade');
      } else if (plan === 'pro' && user.monitor_count >= 10) {
        await send(user, 'agency', { monitors: user.monitor_count });
      } else if (plan === 'free' && user.monitor_count > 0 && age > 14 * DAY && age < 21 * DAY) {
        const stats = db.get(
          `SELECT COALESCE(SUM(d.checks), 0) AS checks FROM daily_stats d JOIN monitors m ON m.id = d.monitor_id
           WHERE m.user_id = ? AND d.day >= ?`,
          user.id,
          utcDay(now - 14 * DAY),
        );
        const inc = db.get(
          'SELECT COUNT(*) AS n FROM incidents i JOIN monitors m ON m.id = i.monitor_id WHERE m.user_id = ? AND i.started_at >= ?',
          user.id,
          now - 14 * DAY,
        );
        await send(user, 'checkin', { checks: stats.checks, incidents: inc.n });
      }
    }
  }

  async function sendOwnerDigest(now) {
    if (!config.adminEmails.length || !ctx.admin) return;
    const stats = ctx.admin.weeklyStats(now);
    const msg = ownerDigestEmail({ config, stats });
    await mailer.trySend({ to: config.adminEmails, ...msg });
  }

  function backup(now) {
    fs.mkdirSync(config.backupDir, { recursive: true });
    const file = path.join(config.backupDir, `backup-${utcDay(now)}.db`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const backups = fs
      .readdirSync(config.backupDir)
      .filter((f) => /^backup-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - config.backupKeep))) {
      fs.unlinkSync(path.join(config.backupDir, old));
    }
    logger.log(`[backup] wrote ${file}`);
  }

  async function tick(now = Date.now()) {
    if (ticking) return;
    ticking = true;
    try {
      dispatchDueChecks(now);
      await housekeeping(now);
      db.kvSet('scheduler:last_tick', now);
    } catch (err) {
      logger.error(`[scheduler] tick failed: ${err.stack || err.message}`);
    } finally {
      ticking = false;
    }
  }

  function start() {
    if (timer) return;
    const loop = async () => {
      await tick();
      timer = setTimeout(loop, s.tickMs);
      timer.unref?.();
    };
    timer = setTimeout(loop, 1000);
    timer.unref?.();
    logger.log(`[scheduler] started (tick ${s.tickMs}ms, concurrency ${s.concurrency})`);
  }

  async function stop() {
    clearTimeout(timer);
    timer = null;
    await drain();
  }

  async function drain() {
    while (inFlight.size) await Promise.allSettled([...inFlight.values()]);
  }

  return {
    start,
    stop,
    tick,
    drain,
    applyHttpResult,
    applySslResult,
    applyDomainResult,
    sendLifecycleEmails,
    backup,
    get inFlight() {
      return inFlight.size;
    },
  };
}
