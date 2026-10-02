// Monthly client reports (Agency plan): uptime, response time, incidents and renewal dates,
// branded with the agency's name, logo and colour, emailed on the 1st of every month.
import { previousMonthRange, startOfUtcMonth, formatMonth, utcMonth, HOUR } from '../lib/format.js';
import { reportEmail } from './emails.js';

export function createReports(ctx) {
  const { db, config, accounts, monitors, mailer, logger = console } = ctx;

  function brandFor(user) {
    const plan = accounts.planOf(user);
    if (!plan.whiteLabel) return { name: config.brandName, color: null, logoUrl: null, whiteLabel: false };
    return {
      name: user.brand_name || 'Website Care Report',
      color: user.brand_color || null,
      logoUrl: user.brand_logo_url || null,
      whiteLabel: true,
    };
  }

  function buildReport(page, { start, end }) {
    const rows = [];
    const incidents = [];
    let totalChecks = 0;
    let totalUp = 0;
    const avgs = [];
    for (const m of monitors.pageMonitors(page.id)) {
      const stats = monitors.uptimeBetween(m.id, start, end);
      const list = db.all(
        'SELECT * FROM incidents WHERE monitor_id = ? AND started_at < ? AND (resolved_at IS NULL OR resolved_at >= ?) ORDER BY started_at',
        m.id,
        end,
        start,
      );
      let downtimeMs = 0;
      for (const i of list) {
        const duration = Math.min(i.resolved_at || end, end) - Math.max(i.started_at, start);
        downtimeMs += duration;
        incidents.push({ monitorName: m.name, startedAt: i.started_at, resolvedAt: i.resolved_at, durationMs: duration, cause: i.cause });
      }
      totalChecks += stats.checks;
      totalUp += stats.uptime != null ? (stats.uptime * stats.checks) / 100 : 0;
      if (stats.avgMs != null) avgs.push(stats.avgMs);
      rows.push({
        name: m.name,
        url: m.url,
        uptime: stats.uptime,
        avgMs: stats.avgMs,
        incidents: list.length,
        downtimeMs,
        sslExpiresAt: m.ssl_expires_at,
        domainExpiresAt: m.domain_expires_at,
      });
    }
    incidents.sort((a, b) => a.startedAt - b.startedAt);
    return {
      page,
      start,
      end,
      periodLabel: formatMonth(start),
      monitors: rows,
      incidents: incidents.slice(0, 25),
      overall: {
        uptime: totalChecks ? (totalUp * 100) / totalChecks : null,
        incidents: incidents.length,
        avgMs: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null,
      },
    };
  }

  function render(page, user, range) {
    const brand = brandFor(user);
    return reportEmail({ config, report: buildReport(page, range), brand, showPoweredBy: !brand.whiteLabel });
  }

  async function sendReport(page, user, range, { onlyTo } = {}) {
    const msg = render(page, user, range);
    const recipients = onlyTo ? [onlyTo] : String(page.report_emails || '').split(/,\s*/).filter(Boolean);
    for (const to of recipients) {
      await mailer.trySend({ to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: user.email });
    }
    if (!onlyTo) {
      await mailer.trySend({ to: user.email, subject: `[Copy] ${msg.subject}`, html: msg.html, text: msg.text });
    }
    return recipients.length;
  }

  // Called by the scheduler: sends last month's reports once, from 07:00 UTC on the 1st onwards.
  async function sendDueReports(now = Date.now()) {
    const monthStart = startOfUtcMonth(now);
    if (now < monthStart + 7 * HOUR) return 0;
    const range = previousMonthRange(now);
    const month = utcMonth(range.start);
    const pages = db.all(
      `SELECT p.* FROM pages p
       WHERE p.report_emails IS NOT NULL AND p.report_emails != '' AND p.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM kv WHERE kv.key = 'report:' || p.id || ':' || ?)
       AND EXISTS (SELECT 1 FROM monitors m WHERE m.page_id = p.id)
       LIMIT 20`,
      monthStart,
      month,
    );
    let sent = 0;
    for (const page of pages) {
      db.kvSet(`report:${page.id}:${month}`, now);
      const user = accounts.findUser(page.user_id);
      if (!user || !accounts.planOf(user).reports) continue;
      try {
        await sendReport(page, user, range);
        sent++;
      } catch (err) {
        logger.error(`[reports] page ${page.id} failed: ${err.message}`);
      }
    }
    return sent;
  }

  return { buildReport, render, sendReport, sendDueReports, brandFor };
}
