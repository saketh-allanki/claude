// Business metrics for the owner: the admin dashboard and the weekly digest email.
import { DAY } from '../lib/format.js';

export function createAdmin({ db, config, accounts }) {
  function monthlyValue(user) {
    const plan = config.plans[accounts.planId(user)];
    if (!plan || user.plan_override) return 0;
    if (!['active', 'past_due'].includes(user.subscription_status)) return 0;
    return user.billing_interval === 'year' ? plan.yearly / 12 : plan.monthly;
  }

  function overview(now = Date.now()) {
    const users = db.all('SELECT * FROM users');
    const byPlan = { free: 0, pro: 0, agency: 0 };
    let mrr = 0;
    let paying = 0;
    let trialing = 0;
    for (const u of users) {
      const plan = accounts.planId(u);
      byPlan[plan] = (byPlan[plan] || 0) + 1;
      const value = monthlyValue(u);
      mrr += value;
      if (value > 0) paying++;
      if (u.subscription_status === 'trialing') trialing++;
    }
    const count = (sql, ...p) => db.get(sql, ...p).n;
    return {
      users: users.length,
      byPlan,
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12),
      paying,
      trialing,
      monitors: count('SELECT COUNT(*) AS n FROM monitors'),
      activeMonitors: count('SELECT COUNT(*) AS n FROM monitors WHERE paused = 0'),
      down: count("SELECT COUNT(*) AS n FROM monitors WHERE status = 'down' AND paused = 0"),
      pages: count('SELECT COUNT(*) AS n FROM pages'),
      signups7: count('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 7 * DAY),
      signups30: count('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 30 * DAY),
      checks24h: count('SELECT COUNT(*) AS n FROM check_results WHERE at > ?', now - DAY),
      alerts7: count('SELECT COUNT(*) AS n FROM alert_log WHERE at > ?', now - 7 * DAY),
      lastTick: Number(db.kvGet('scheduler:last_tick')) || null,
    };
  }

  function recentUsers(limit = 50) {
    return db.all(
      `SELECT u.*, (SELECT COUNT(*) FROM monitors m WHERE m.user_id = u.id) AS monitor_count
       FROM users u ORDER BY u.created_at DESC LIMIT ?`,
      limit,
    );
  }

  function weeklyStats(now = Date.now()) {
    const o = overview(now);
    const since = now - 7 * DAY;
    const changes = db.all('SELECT * FROM plan_changes WHERE at > ?', since);
    const newPaying = changes.filter((c) => c.from_plan === 'free' && c.to_plan !== 'free').length;
    const churned = changes.filter((c) => c.from_plan !== 'free' && c.to_plan === 'free').length;
    const checks = db.get(
      'SELECT COALESCE(SUM(checks), 0) AS n FROM daily_stats WHERE day >= ?',
      new Date(since).toISOString().slice(0, 10),
    ).n;
    const pastDue = db.get("SELECT COUNT(*) AS n FROM users WHERE subscription_status IN ('past_due', 'unpaid')").n;
    const actions = [];
    if (o.lastTick && now - o.lastTick > 10 * 60_000) actions.push('The monitoring scheduler has not run for over 10 minutes — check the server logs.');
    if (pastDue) actions.push(`${pastDue} customer(s) have a failed payment. Stripe retries automatically; no action needed unless it persists.`);
    if (churned) actions.push(`${churned} cancellation(s) this week. Consider a short personal email asking why.`);
    return {
      mrr: o.mrr,
      paying: o.paying,
      byPlan: o.byPlan,
      users: o.users,
      newUsers: o.signups7,
      newPaying,
      churned,
      monitors: o.monitors,
      checks,
      alerts: o.alerts7,
      actions,
    };
  }

  return { overview, recentUsers, weeklyStats, monthlyValue };
}
