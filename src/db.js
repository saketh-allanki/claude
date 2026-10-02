// SQLite storage using Node's built-in driver (no native dependencies to maintain).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    plan TEXT NOT NULL DEFAULT 'free',
    plan_override TEXT,
    billing_interval TEXT,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT,
    current_period_end INTEGER,
    brand_name TEXT,
    brand_logo_url TEXT,
    brand_color TEXT,
    marketing_opt_out INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX users_customer ON users(stripe_customer_id);

  CREATE TABLE login_tokens (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    pending_url TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );

  CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE pages (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    report_emails TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX pages_user ON pages(user_id);

  CREATE TABLE monitors (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    keyword TEXT,
    interval_sec INTEGER NOT NULL DEFAULT 300,
    paused INTEGER NOT NULL DEFAULT 0,
    paused_reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    status_since INTEGER,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_checked_at INTEGER,
    next_check_at INTEGER NOT NULL DEFAULT 0,
    last_response_ms INTEGER,
    last_status_code INTEGER,
    last_error TEXT,
    ssl_expires_at INTEGER,
    ssl_issuer TEXT,
    ssl_error TEXT,
    ssl_checked_at INTEGER NOT NULL DEFAULT 0,
    ssl_alerted_days INTEGER,
    domain_expires_at INTEGER,
    domain_registrar TEXT,
    domain_error TEXT,
    domain_checked_at INTEGER NOT NULL DEFAULT 0,
    domain_alerted_days INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX monitors_due ON monitors(paused, next_check_at);
  CREATE INDEX monitors_user ON monitors(user_id);
  CREATE INDEX monitors_page ON monitors(page_id);

  CREATE TABLE check_results (
    monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    ok INTEGER NOT NULL,
    ms INTEGER,
    code INTEGER
  );
  CREATE INDEX check_results_monitor_at ON check_results(monitor_id, at);

  CREATE TABLE daily_stats (
    monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    checks INTEGER NOT NULL DEFAULT 0,
    up INTEGER NOT NULL DEFAULT 0,
    total_ms INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (monitor_id, day)
  );

  CREATE TABLE incidents (
    id INTEGER PRIMARY KEY,
    monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    resolved_at INTEGER,
    cause TEXT
  );
  CREATE INDEX incidents_monitor ON incidents(monitor_id, started_at);

  CREATE TABLE channels (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    target TEXT NOT NULL,
    label TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX channels_user ON channels(user_id);

  CREATE TABLE alert_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    monitor_id INTEGER REFERENCES monitors(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX alert_log_user ON alert_log(user_id, at);

  CREATE TABLE user_events (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );

  CREATE TABLE kv (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
  );

  CREATE TABLE billing_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    at INTEGER NOT NULL
  );

  CREATE TABLE plan_changes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    from_plan TEXT NOT NULL,
    to_plan TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  `,
];

export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');

  const version = raw.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    raw.exec('BEGIN');
    try {
      raw.exec(MIGRATIONS[v]);
      raw.exec(`PRAGMA user_version = ${v + 1}`);
      raw.exec('COMMIT');
    } catch (err) {
      raw.exec('ROLLBACK');
      throw err;
    }
  }

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };

  let depth = 0;
  return {
    raw,
    get: (sql, ...params) => stmt(sql).get(...params),
    all: (sql, ...params) => stmt(sql).all(...params),
    run: (sql, ...params) => stmt(sql).run(...params),
    exec: (sql) => raw.exec(sql),
    tx(fn) {
      if (depth > 0) return fn();
      depth++;
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },
    kvGet(key) {
      const row = stmt('SELECT value FROM kv WHERE key = ?').get(key);
      return row ? row.value : null;
    },
    kvSet(key, value) {
      stmt(
        'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      ).run(key, value == null ? null : String(value), Date.now());
    },
    close: () => raw.close(),
  };
}
