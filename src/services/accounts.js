// Plans, limits and account lifecycle.
import { PLAN_ORDER } from '../config.js';

export function createAccounts({ db, config }) {
  const planId = (user) => {
    const id = user?.plan_override || user?.plan || 'free';
    return config.plans[id] ? id : 'free';
  };
  const planOf = (user) => config.plans[planId(user)];

  const findUser = (id) => db.get('SELECT * FROM users WHERE id = ?', id);
  const findByEmail = (email) => db.get('SELECT * FROM users WHERE email = ?', String(email).trim().toLowerCase());

  function createUser(email, now = Date.now()) {
    const normalized = String(email).trim().toLowerCase();
    const result = db.run('INSERT INTO users (email, created_at) VALUES (?, ?)', normalized, now);
    return findUser(Number(result.lastInsertRowid));
  }

  // Pause monitors over the plan limit (newest first) and resume them after an upgrade.
  function enforceLimits(userId, now = Date.now()) {
    const user = findUser(userId);
    if (!user) return;
    const plan = planOf(user);
    db.tx(() => {
      const monitors = db.all('SELECT id, paused, paused_reason, interval_sec FROM monitors WHERE user_id = ? ORDER BY id', userId);
      monitors.forEach((m, index) => {
        if (index < plan.monitors) {
          if (m.paused && m.paused_reason === 'plan_limit') {
            db.run("UPDATE monitors SET paused = 0, paused_reason = NULL, next_check_at = ? WHERE id = ?", now, m.id);
          }
        } else if (!m.paused) {
          db.run("UPDATE monitors SET paused = 1, paused_reason = 'plan_limit' WHERE id = ?", m.id);
        }
        if (m.interval_sec < plan.minInterval) {
          db.run('UPDATE monitors SET interval_sec = ? WHERE id = ?', plan.minInterval, m.id);
        }
      });
    });
  }

  function setPlan(userId, newPlan, fields = {}, now = Date.now()) {
    const user = findUser(userId);
    if (!user) return null;
    const target = config.plans[newPlan] ? newPlan : 'free';
    const sets = ['plan = ?'];
    const values = [target];
    for (const [key, value] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(value ?? null);
    }
    db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...values, userId);
    if (user.plan !== target) {
      db.run('INSERT INTO plan_changes (user_id, from_plan, to_plan, at) VALUES (?, ?, ?, ?)', userId, user.plan, target, now);
    }
    enforceLimits(userId, now);
    return findUser(userId);
  }

  function setOverride(userId, override) {
    db.run('UPDATE users SET plan_override = ? WHERE id = ?', config.plans[override] ? override : null, userId);
    enforceLimits(userId);
  }

  const isUpgrade = (from, to) => PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from);

  function markEvent(userId, key, now = Date.now()) {
    const res = db.run('INSERT OR IGNORE INTO user_events (user_id, key, at) VALUES (?, ?, ?)', userId, key, now);
    return res.changes > 0;
  }
  const hasEvent = (userId, key) => Boolean(db.get('SELECT 1 FROM user_events WHERE user_id = ? AND key = ?', userId, key));

  function deleteUser(userId) {
    db.run('DELETE FROM users WHERE id = ?', userId);
  }

  return { planId, planOf, findUser, findByEmail, createUser, enforceLimits, setPlan, setOverride, isUpgrade, markEvent, hasEvent, deleteUser };
}
