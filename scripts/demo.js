// Runs the app locally with realistic sample data so you can click around.
//   npm run demo   →   open the sign-in link printed in the terminal.
// Uses a separate database (data/demo.db) and does not run real checks.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { DAY, utcDay } from '../src/lib/format.js';

export function seedDemo(app, { email = 'demo@example.com', now = Date.now() } = {}) {
  const { db, accounts } = app;
  let user = accounts.findByEmail(email) || accounts.createUser(email, now - 120 * DAY);
  db.run("UPDATE users SET plan_override = 'agency', brand_name = 'Northwind Digital', brand_color = '#2a78d6' WHERE id = ?", user.id);
  user = accounts.findUser(user.id);
  if (db.get('SELECT COUNT(*) AS n FROM monitors WHERE user_id = ?', user.id).n) return user;

  const page = db.run(
    "INSERT INTO pages (user_id, slug, title, report_emails, created_at) VALUES (?, 'bright-smile', 'Bright Smile Dental', 'owner@brightsmile.example', ?)",
    user.id,
    now - 100 * DAY,
  );
  const pageId = Number(page.lastInsertRowid);
  const sites = [
    ['Bright Smile — website', 'https://brightsmile-dental.example', 'up', 63, 211, pageId, 0.9995],
    ['Bright Smile — booking', 'https://book.brightsmile-dental.example', 'up', 63, 211, pageId, 0.998],
    ['Northside Plumbing', 'https://northside-plumbing.example', 'down', 41, 12, null, 0.985],
    ['Bloom Florist', 'https://bloom-florist.example', 'up', 6, 340, null, 0.9999],
    ['Harbor Law', 'https://harbor-law.example', 'up', 88, 95, null, 0.9992],
    ['Agency website', 'https://northwind-digital.example', 'up', 120, 400, null, 1],
  ];
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const [name, url, status, sslDays, domainDays, pid, reliability] of sites) {
    const res = db.run(
      `INSERT INTO monitors (user_id, page_id, name, url, interval_sec, status, status_since, last_checked_at, next_check_at,
        last_response_ms, last_status_code, last_error, consecutive_failures, ssl_expires_at, ssl_issuer, ssl_checked_at,
        domain_expires_at, domain_registrar, domain_checked_at, created_at)
       VALUES (?, ?, ?, ?, 60, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Let''s Encrypt', ?, ?, 'Namecheap, Inc.', ?, ?)`,
      user.id,
      pid,
      name,
      url,
      status,
      status === 'down' ? now - 23 * 60_000 : now - 9 * DAY,
      now - 30_000,
      now + 10 * 365 * DAY,
      status === 'down' ? null : 280 + Math.round(rand() * 200),
      status === 'down' ? null : 200,
      status === 'down' ? 'Connection timed out' : null,
      status === 'down' ? 3 : 0,
      now + sslDays * DAY,
      now,
      now + domainDays * DAY,
      now,
      now - 95 * DAY,
    );
    const id = Number(res.lastInsertRowid);
    for (let i = 89; i >= 0; i--) {
      const checks = 1440;
      const r = rand();
      const upRatio = r > 0.92 ? reliability - rand() * 0.02 : 1;
      db.run(
        'INSERT INTO daily_stats (monitor_id, day, checks, up, total_ms) VALUES (?, ?, ?, ?, ?)',
        id,
        utcDay(now - i * DAY),
        checks,
        Math.round(checks * Math.min(1, upRatio)),
        Math.round(checks * upRatio * (300 + rand() * 150)),
      );
    }
    for (let t = now - DAY; t < now; t += 5 * 60_000) {
      const fail = status === 'down' ? t > now - 23 * 60_000 : rand() < 0.004;
      const base = 320 + Math.sin(t / 3_600_000) * 60;
      db.run('INSERT INTO check_results (monitor_id, at, ok, ms, code) VALUES (?, ?, ?, ?, ?)', id, t, fail ? 0 : 1, fail ? null : Math.round(base + rand() * 120), fail ? null : 200);
    }
    if (reliability < 1) {
      db.run('INSERT INTO incidents (monitor_id, started_at, resolved_at, cause) VALUES (?, ?, ?, ?)', id, now - 12 * DAY, now - 12 * DAY + 47 * 60_000, 'HTTP 502');
    }
    if (status === 'down') {
      db.run('INSERT INTO incidents (monitor_id, started_at, cause) VALUES (?, ?, ?)', id, now - 23 * 60_000, 'Connection timed out');
    }
  }
  db.run("INSERT INTO channels (user_id, type, target, label, created_at) VALUES (?, 'slack', 'https://hooks.slack.com/services/T000/B000/XXXXXXXX', '#client-alerts', ?)", user.id, now);
  db.run(
    'INSERT INTO alert_log (user_id, monitor_id, kind, message, at) SELECT ?, id, ?, ?, ? FROM monitors WHERE user_id = ? AND status = ? LIMIT 1',
    user.id,
    'down',
    'Northside Plumbing (https://northside-plumbing.example) is DOWN. Reason: Connection timed out',
    now - 22 * 60_000,
    user.id,
    'down',
  );
  return user;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync('data', { recursive: true });
  const port = Number(process.env.PORT || 3000);
  const config = loadConfig(
    {},
    {
      ...process.env,
      DATABASE_PATH: 'data/demo.db',
      SCHEDULER_ENABLED: '0',
      EMAIL_PROVIDER: 'log',
      BASE_URL: process.env.BASE_URL || `http://localhost:${port}`,
      ADMIN_EMAILS: 'demo@example.com',
    },
  );
  const app = createApp({ config });
  const user = seedDemo(app);
  await app.listen(port);
  const { token } = await app.auth.requestLogin(user.email);
  console.log(`\nDemo running at ${config.baseUrl}`);
  console.log(`Sign in as the demo agency: ${config.baseUrl}/auth/verify?token=${token}\n`);
}
