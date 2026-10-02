// Wires configuration, storage, services, routes and the scheduler into one application.
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createMailer } from './services/mailer.js';
import { createAccounts } from './services/accounts.js';
import { createMonitorService } from './services/monitors.js';
import { createAlerter } from './services/alerts.js';
import { createAuth } from './services/auth.js';
import { createBilling } from './services/billing.js';
import { createReports } from './services/reports.js';
import { createAdmin } from './services/admin.js';
import { createScheduler } from './services/scheduler.js';
import { loadContent } from './services/content.js';
import { httpCheck } from './checks/http.js';
import { sslCheck } from './checks/ssl.js';
import { createDomainChecker } from './checks/domain.js';
import { createRouter, createHttpServer, createRateLimiter, sendHtml, redirect } from './http/server.js';
import { layout } from './views/layout.js';
import { notFoundBody, errorBody } from './views/site.js';
import { registerSiteRoutes } from './routes/site.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAppRoutes } from './routes/app.js';
import { registerAdminRoutes } from './routes/admin.js';

export function createApp({ config = loadConfig(), checks = {}, fetchImpl = globalThis.fetch, logger = console } = {}) {
  const ctx = { config, logger, redirect };
  ctx.db = openDatabase(config.databasePath);
  ctx.mailer = createMailer(config, { fetchImpl, logger });
  ctx.accounts = createAccounts(ctx);
  ctx.monitors = createMonitorService(ctx);
  ctx.alerter = createAlerter(ctx);
  ctx.auth = createAuth(ctx);
  ctx.unsubscribeUrl = (user) => ctx.auth.unsubscribeUrl(user);
  ctx.billing = createBilling({ ...ctx, fetchImpl });
  ctx.reports = createReports(ctx);
  ctx.admin = createAdmin(ctx);
  ctx.content = loadContent({ brandName: config.brandName });
  // Reload hourly so future-dated guides publish themselves on their date.
  const contentTimer = setInterval(() => {
    ctx.content = loadContent({ brandName: config.brandName });
  }, 3600_000);
  contentTimer.unref?.();
  ctx.rateLimit = createRateLimiter();
  const domainChecker = createDomainChecker({ fetchImpl });
  ctx.checks = { http: httpCheck, ssl: sslCheck, domain: domainChecker.check, ...checks };
  ctx.scheduler = createScheduler(ctx);

  ctx.views = {
    notFound: (req, res) => sendHtml(res, 404, layout(ctx, req, { title: 'Not found', body: notFoundBody(), app: Boolean(req.user && req.path?.startsWith('/app')), noindex: true })),
    errorPage: (req, res, status, message) =>
      sendHtml(res, status, layout(ctx, req, { title: 'Error', body: errorBody(status, message, req), app: Boolean(req.user && req.path?.startsWith('/app')), noindex: true })),
  };

  const router = createRouter();
  registerSiteRoutes(router, ctx);
  registerAuthRoutes(router, ctx);
  registerAppRoutes(router, ctx);
  registerAdminRoutes(router, ctx);
  ctx.server = createHttpServer(ctx, router);

  ctx.listen = (port = config.port) =>
    new Promise((resolve) => {
      ctx.server.listen(port, () => resolve(ctx.server.address().port));
    });

  ctx.close = async () => {
    clearInterval(contentTimer);
    await ctx.scheduler.stop();
    await new Promise((resolve) => ctx.server.close(() => resolve()));
    ctx.db.close();
  };

  return ctx;
}
