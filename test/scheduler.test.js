import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { DAY } from '../src/lib/format.js';

async function setup(checks = {}) {
  const app = await startApp({
    checks: {
      http: async () => ({ ok: true, ms: 120, code: 200, error: null }),
      ssl: async () => ({ ok: true, validTo: Date.now() + 80 * DAY, issuer: 'Test CA' }),
      domain: async () => ({ ok: true, domain: 'example.com', expiresAt: Date.now() + 300 * DAY, registrar: 'Reg' }),
      ...checks,
    },
  });
  const user = app.accounts.createUser('agency@example.com');
  const monitor = app.monitors.create(user, { url: 'https://example.com' });
  return { app, user, monitor };
}

const alertsOf = (app, kind) => app.db.all('SELECT * FROM alert_log WHERE kind = ?', kind);
const fresh = (app, id) => app.db.get('SELECT * FROM monitors WHERE id = ?', id);

test('a failure is confirmed before alerting, and recovery reports downtime', async (t) => {
  const { app, monitor } = await setup();
  t.after(() => app.close());
  const s = app.scheduler;
  const t0 = Date.now();

  assert.deepEqual(s.applyHttpResult(fresh(app, monitor.id), { ok: true, ms: 100, code: 200 }, t0), []);
  assert.equal(fresh(app, monitor.id).status, 'up');

  // First failure: no alert yet, quick re-check scheduled.
  let events = s.applyHttpResult(fresh(app, monitor.id), { ok: false, error: 'HTTP 500', code: 500 }, t0 + 60_000);
  assert.deepEqual(events, []);
  let m = fresh(app, monitor.id);
  assert.equal(m.status, 'up');
  assert.equal(m.consecutive_failures, 1);
  assert.equal(m.next_check_at, t0 + 60_000 + 30_000);

  // Second failure: confirmed down, incident opened.
  events = s.applyHttpResult(fresh(app, monitor.id), { ok: false, error: 'HTTP 500', code: 500 }, t0 + 90_000);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'down');
  m = fresh(app, monitor.id);
  assert.equal(m.status, 'down');
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM incidents WHERE resolved_at IS NULL').n, 1);

  // Further failures do not re-alert.
  assert.deepEqual(s.applyHttpResult(fresh(app, monitor.id), { ok: false, error: 'HTTP 500' }, t0 + 150_000), []);

  // Recovery.
  events = s.applyHttpResult(fresh(app, monitor.id), { ok: true, ms: 90, code: 200 }, t0 + 690_000);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'up');
  assert.equal(events[0].downtimeMs, 600_000);
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM incidents WHERE resolved_at IS NOT NULL').n, 1);

  const stats = app.db.get('SELECT * FROM daily_stats WHERE monitor_id = ?', monitor.id);
  assert.equal(stats.checks, 5);
  assert.equal(stats.up, 2);
});

test('SSL alerts follow the 14/7/3/1 ladder once each and reset after renewal', async (t) => {
  const { app, monitor } = await setup();
  t.after(() => app.close());
  const s = app.scheduler;
  const now = Date.now();
  const expires = now + 10 * DAY + 3600_000;
  const kinds = (events) => events.map((e) => `${e.kind}:${e.daysLeft ?? ''}`);

  assert.deepEqual(kinds(s.applySslResult(fresh(app, monitor.id), { ok: true, validTo: expires, issuer: 'CA' }, now)), ['ssl_expiring:10']);
  assert.deepEqual(s.applySslResult(fresh(app, monitor.id), { ok: true, validTo: expires, issuer: 'CA' }, now + 3600_000), []);
  assert.deepEqual(kinds(s.applySslResult(fresh(app, monitor.id), { ok: true, validTo: expires, issuer: 'CA' }, now + 4 * DAY)), ['ssl_expiring:6']);
  assert.deepEqual(kinds(s.applySslResult(fresh(app, monitor.id), { ok: false, validTo: expires, issuer: 'CA', errorCode: 'CERT_HAS_EXPIRED', error: 'SSL certificate has expired' }, now + 11 * DAY)), ['ssl_expired:-1']);

  // Renewed certificate: ladder resets silently, later expiry alerts again.
  const renewed = now + 100 * DAY;
  assert.deepEqual(s.applySslResult(fresh(app, monitor.id), { ok: true, validTo: renewed, issuer: 'CA' }, now + 11 * DAY), []);
  assert.equal(fresh(app, monitor.id).ssl_alerted_days, null);
  assert.deepEqual(kinds(s.applySslResult(fresh(app, monitor.id), { ok: true, validTo: renewed, issuer: 'CA' }, renewed - 2 * DAY)), ['ssl_expiring:2']);

  // A new trust problem alerts once.
  const bad = { ok: false, validTo: renewed, issuer: 'CA', errorCode: 'ERR_TLS_CERT_ALTNAME_INVALID', error: 'SSL certificate does not match the domain' };
  assert.deepEqual(kinds(s.applySslResult(fresh(app, monitor.id), bad, renewed - 2 * DAY)), ['ssl_invalid:']);
  assert.deepEqual(s.applySslResult(fresh(app, monitor.id), bad, renewed - 2 * DAY - 1000), []);
});

test('domain expiry alerts and tick() runs checks end-to-end with notifications', async (t) => {
  const { app, monitor, user } = await setup({
    domain: async () => ({ ok: true, domain: 'example.com', expiresAt: Date.now() + 20 * DAY, registrar: 'Reg Inc' }),
    http: async () => ({ ok: false, ms: 50, code: null, error: 'Connection refused' }),
  });
  t.after(() => app.close());
  app.db.run("INSERT INTO channels (user_id, type, target, created_at) VALUES (?, 'email', 'team@example.com', ?)", user.id, Date.now());

  await app.scheduler.tick();
  await app.scheduler.drain();
  let m = fresh(app, monitor.id);
  assert.equal(m.consecutive_failures, 1);
  assert.equal(m.ssl_issuer, 'Test CA');
  assert.equal(m.domain_registrar, 'Reg Inc');
  assert.equal(alertsOf(app, 'domain_expiring').length, 1);

  // Force the confirmation re-check.
  app.db.run('UPDATE monitors SET next_check_at = 0 WHERE id = ?', monitor.id);
  await app.scheduler.tick();
  await app.scheduler.drain();
  m = fresh(app, monitor.id);
  assert.equal(m.status, 'down');
  assert.equal(alertsOf(app, 'down').length, 1);

  const subjects = app.mailer.outbox.map((x) => `${x.to.join(',')}|${x.subject}`);
  assert.ok(subjects.includes('agency@example.com|DOWN: example.com is not responding'), subjects.join('\n'));
  assert.ok(subjects.includes('team@example.com|DOWN: example.com is not responding'));
  assert.ok(subjects.some((s) => s.startsWith('agency@example.com|Domain example.com expires in')));
});

test('plan limits pause extra monitors on downgrade and resume on upgrade', async (t) => {
  const { app, user } = await setup();
  t.after(() => app.close());
  app.accounts.setPlan(user.id, 'pro');
  const pro = app.accounts.findUser(user.id);
  for (let i = 0; i < 7; i++) app.monitors.create(pro, { url: `https://site${i}.example.com`, interval: 60 });
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM monitors WHERE user_id = ?', user.id).n, 8);

  app.accounts.setPlan(user.id, 'free');
  const rows = app.db.all('SELECT paused, paused_reason, interval_sec FROM monitors WHERE user_id = ? ORDER BY id', user.id);
  assert.equal(rows.filter((r) => !r.paused).length, 5);
  assert.equal(rows.filter((r) => r.paused_reason === 'plan_limit').length, 3);
  assert.ok(rows.every((r) => r.interval_sec >= 300));
  assert.throws(() => app.monitors.create(app.accounts.findUser(user.id), { url: 'https://new.example.com' }), /includes 5 sites/);

  app.accounts.setPlan(user.id, 'agency');
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM monitors WHERE user_id = ? AND paused = 1', user.id).n, 0);
  const changes = app.db.all('SELECT from_plan, to_plan FROM plan_changes WHERE user_id = ?', user.id);
  assert.deepEqual(changes.map((c) => `${c.from_plan}>${c.to_plan}`), ['free>pro', 'pro>free', 'free>agency']);
});

test('monthly reports are sent once, after the 1st, only for Agency pages', async (t) => {
  const { app, user, monitor } = await setup();
  t.after(() => app.close());
  const may15 = Date.UTC(2026, 4, 15);
  const agencyPage = app.monitors.createPage({ ...user, plan: 'agency' }, { title: 'Client Co', reportEmails: 'client@example.com' }, Date.UTC(2026, 3, 1));
  app.db.run('UPDATE monitors SET page_id = ? WHERE id = ?', agencyPage.id, monitor.id);
  app.db.run("INSERT INTO daily_stats (monitor_id, day, checks, up, total_ms) VALUES (?, '2026-05-10', 1440, 1438, 432000)", monitor.id);
  app.db.run('INSERT INTO incidents (monitor_id, started_at, resolved_at, cause) VALUES (?, ?, ?, ?)', monitor.id, may15, may15 + 20 * 60_000, 'HTTP 502');

  // Recipients are stored, but nothing is sent while the account is not on the Agency plan.
  assert.equal(await app.reports.sendDueReports(Date.UTC(2026, 5, 1, 8)), 0);

  app.accounts.setPlan(user.id, 'agency');
  app.db.run("DELETE FROM kv WHERE key LIKE 'report:%'");
  assert.equal(await app.reports.sendDueReports(Date.UTC(2026, 5, 1, 6)), 0, 'not before 07:00 UTC');
  assert.equal(await app.reports.sendDueReports(Date.UTC(2026, 5, 1, 8)), 1);
  assert.equal(await app.reports.sendDueReports(Date.UTC(2026, 5, 2, 8)), 0, 'only once per month');

  const report = app.mailer.outbox.find((m) => m.to.includes('client@example.com'));
  assert.ok(report);
  assert.equal(report.subject, 'Client Co: website report for May 2026');
  assert.match(report.html, /99\.86%/);
  assert.match(report.html, /HTTP 502/);
  assert.doesNotMatch(report.html, /Sitewarden/, 'agency reports are white-labelled');
  assert.ok(app.mailer.outbox.find((m) => m.to.includes('agency@example.com') && m.subject.startsWith('[Copy]')));
});

test('lifecycle emails are sent once and respect opt-out', async (t) => {
  const { app, user } = await setup();
  t.after(() => app.close());
  const now = Date.now();
  const lonely = app.accounts.createUser('lonely@example.com', now - 2 * DAY);
  const optedOut = app.accounts.createUser('quiet@example.com', now - 2 * DAY);
  app.db.run('UPDATE users SET marketing_opt_out = 1 WHERE id = ?', optedOut.id);
  app.db.run('UPDATE users SET created_at = ? WHERE id = ?', now - 4 * DAY, user.id);
  for (let i = 0; i < 4; i++) app.monitors.create(app.accounts.findUser(user.id), { url: `https://x${i}.example.com` });

  await app.scheduler.sendLifecycleEmails(now);
  await app.scheduler.sendLifecycleEmails(now);
  const to = (email) => app.mailer.outbox.filter((m) => m.to.includes(email)).map((m) => m.subject);
  assert.deepEqual(to('lonely@example.com'), ['Your sites are not being watched yet']);
  assert.deepEqual(to('quiet@example.com'), []);
  assert.deepEqual(to('agency@example.com'), ["You've reached the 5-site limit"]);
  const unsub = app.mailer.outbox.find((m) => m.to.includes('lonely@example.com')).text.match(/Unsubscribe: (\S+)/)[1];
  assert.match(unsub, new RegExp(`/unsubscribe\\?u=${lonely.id}&s=`));
});

test('changing the URL or pausing a down site closes its open incident', async (t) => {
  const { app, user, monitor } = await setup();
  t.after(() => app.close());
  const s = app.scheduler;
  const goDown = (id, at) => {
    s.applyHttpResult(fresh(app, id), { ok: false, error: 'HTTP 500' }, at);
    s.applyHttpResult(fresh(app, id), { ok: false, error: 'HTTP 500' }, at + 30_000);
    assert.equal(fresh(app, id).status, 'down');
  };
  const openIncidents = (id) => app.db.get('SELECT COUNT(*) AS n FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL', id).n;
  const t0 = Date.now() - 3600_000;

  goDown(monitor.id, t0);
  assert.equal(openIncidents(monitor.id), 1);
  app.monitors.update(user, monitor.id, { url: 'https://other.example.com' });
  assert.equal(openIncidents(monitor.id), 0);
  assert.equal(fresh(app, monitor.id).status, 'pending');

  // Editing without changing the URL keeps the incident open.
  goDown(monitor.id, t0 + 60_000);
  app.monitors.update(user, monitor.id, { url: 'https://other.example.com', name: 'Renamed' });
  assert.equal(openIncidents(monitor.id), 1);

  app.monitors.setPaused(user, monitor.id, true);
  assert.equal(openIncidents(monitor.id), 0);
  assert.equal(fresh(app, monitor.id).status, 'pending');

  // Pausing because of a plan limit closes incidents too.
  app.monitors.setPaused(user, monitor.id, false);
  app.accounts.setPlan(user.id, 'pro');
  const extra = [];
  for (let i = 0; i < 5; i++) extra.push(app.monitors.create(app.accounts.findUser(user.id), { url: `https://e${i}.example.com` }));
  const last = extra.at(-1);
  goDown(last.id, t0 + 120_000);
  app.accounts.setPlan(user.id, 'free');
  assert.equal(fresh(app, last.id).paused_reason, 'plan_limit');
  assert.equal(openIncidents(last.id), 0);
});
