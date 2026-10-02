// Routes inside the logged-in app.
import { sendHtml, redirect, setFlash } from '../http/server.js';
import {
  dashboardPage,
  monitorFormPage,
  monitorDetailPage,
  alertsPage,
  pagesListPage,
  pageEditPage,
  settingsPage,
  billingPage,
} from '../views/app.js';
import { UserError } from '../lib/errors.js';
import { chartWindowHours } from '../views/components.js';
import { DAY, previousMonthRange } from '../lib/format.js';

export function registerAppRoutes(router, ctx) {
  const { db, config, monitors: svc, accounts, alerter, reports, billing, rateLimit, logger = console } = ctx;
  const auth = { auth: true };

  // Runs a form action; validation problems go back to the referring page as a flash message.
  const action = (fallback, fn) => async (req, res, params) => {
    try {
      await fn(req, res, params);
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      setFlash(res, 'error', err.message);
      redirect(res, typeof fallback === 'function' ? fallback(params) : fallback);
    }
  };

  // Stripe outages become a friendly message instead of an error page.
  const stripeCall = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof UserError) throw err;
      logger.error(`[billing] ${err.message}`);
      throw new UserError('We could not reach our payment provider. Please try again in a minute.');
    }
  };

  const loadMonitor = (req, id) => {
    const monitor = svc.get(req.user.id, id);
    if (!monitor) throw new UserError('That site was not found.', 404);
    return monitor;
  };

  // ---- Sites ---------------------------------------------------------------
  router.get(
    '/app',
    (req, res) => {
      const plan = accounts.planOf(req.user);
      sendHtml(res, 200, dashboardPage(ctx, req, { monitors: svc.list(req.user.id), plan }));
    },
    auth,
  );

  router.get(
    '/app/monitors/new',
    (req, res) => {
      const plan = accounts.planOf(req.user);
      sendHtml(res, 200, monitorFormPage(ctx, req, { plan, pages: svc.listPages(req.user.id), values: { url: req.query.get('url') || '' } }));
    },
    auth,
  );

  router.post(
    '/app/monitors',
    async (req, res) => {
      const plan = accounts.planOf(req.user);
      try {
        const monitor = svc.create(req.user, req.body);
        setFlash(res, 'success', `Now monitoring ${monitor.name}. First results arrive within a minute.`);
        redirect(res, `/app/monitors/${monitor.id}`);
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        if (err.status === 402) {
          setFlash(res, 'error', err.message);
          return redirect(res, '/app/billing');
        }
        sendHtml(res, 400, monitorFormPage(ctx, req, { plan, pages: svc.listPages(req.user.id), values: req.body, error: err.message }));
      }
    },
    auth,
  );

  router.get(
    '/app/monitors/:id',
    (req, res, { id }) => {
      const monitor = svc.get(req.user.id, id);
      if (!monitor) return ctx.views.notFound(req, res);
      const now = Date.now();
      const bars = svc.dailyBars(monitor.id, 90, now);
      const u30 = svc.uptimeBetween(monitor.id, now - 29 * DAY, now + DAY);
      const u7 = svc.uptimeBetween(monitor.id, now - 6 * DAY, now + DAY);
      const chartHours = chartWindowHours(monitor.created_at, now);
      sendHtml(
        res,
        200,
        monitorDetailPage(ctx, req, {
          monitor,
          bars,
          series: svc.responseSeries(monitor.id, chartHours, now),
          chartHours,
          incidents: svc.incidents(monitor.id),
          uptime30: u30.uptime,
          uptime7: u7.uptime,
          avg30: u30.avgMs,
        }),
      );
    },
    auth,
  );

  router.get(
    '/app/monitors/:id/edit',
    (req, res, { id }) => {
      const monitor = svc.get(req.user.id, id);
      if (!monitor) return ctx.views.notFound(req, res);
      sendHtml(res, 200, monitorFormPage(ctx, req, { monitor, plan: accounts.planOf(req.user), pages: svc.listPages(req.user.id) }));
    },
    auth,
  );

  router.post(
    '/app/monitors/:id',
    async (req, res, { id }) => {
      const monitor = svc.get(req.user.id, id);
      if (!monitor) return ctx.views.notFound(req, res);
      try {
        svc.update(req.user, monitor.id, req.body);
        setFlash(res, 'success', 'Changes saved.');
        redirect(res, `/app/monitors/${monitor.id}`);
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        sendHtml(
          res,
          400,
          monitorFormPage(ctx, req, { monitor, plan: accounts.planOf(req.user), pages: svc.listPages(req.user.id), values: req.body, error: err.message }),
        );
      }
    },
    auth,
  );

  router.post(
    '/app/monitors/:id/pause',
    action(
      ({ id }) => `/app/monitors/${id}`,
      (req, res, { id }) => {
        svc.setPaused(req.user, loadMonitor(req, id).id, true);
        setFlash(res, 'info', 'Monitoring paused. No checks or alerts until you resume.');
        redirect(res, `/app/monitors/${id}`);
      },
    ),
    auth,
  );

  router.post(
    '/app/monitors/:id/resume',
    action(
      ({ id }) => `/app/monitors/${id}`,
      (req, res, { id }) => {
        svc.setPaused(req.user, loadMonitor(req, id).id, false);
        setFlash(res, 'success', 'Monitoring resumed.');
        redirect(res, `/app/monitors/${id}`);
      },
    ),
    auth,
  );

  router.post(
    '/app/monitors/:id/check',
    action(
      ({ id }) => `/app/monitors/${id}`,
      (req, res, { id }) => {
        if (!rateLimit(`checknow:${req.user.id}`, 10, 10 * 60_000)) throw new UserError('Please wait a few minutes before checking again.');
        svc.checkNow(req.user, loadMonitor(req, id).id);
        setFlash(res, 'info', 'Check queued — refresh in a few seconds to see the result.');
        redirect(res, `/app/monitors/${id}`);
      },
    ),
    auth,
  );

  router.post(
    '/app/monitors/:id/delete',
    action('/app', (req, res, { id }) => {
      const monitor = loadMonitor(req, id);
      svc.remove(req.user, monitor.id);
      accounts.enforceLimits(req.user.id);
      setFlash(res, 'success', `${monitor.name} deleted.`);
      redirect(res, '/app');
    }),
    auth,
  );

  // ---- Alerts ----------------------------------------------------------------
  router.get(
    '/app/alerts',
    (req, res) => {
      const recent = db.all('SELECT * FROM alert_log WHERE user_id = ? ORDER BY at DESC LIMIT 25', req.user.id);
      sendHtml(
        res,
        200,
        alertsPage(ctx, req, { channels: svc.listChannels(req.user.id), plan: accounts.planOf(req.user), types: svc.CHANNEL_TYPES, recent }),
      );
    },
    auth,
  );

  router.post(
    '/app/alerts',
    action('/app/alerts', (req, res) => {
      svc.createChannel(req.user, req.body);
      setFlash(res, 'success', 'Alert channel added. Use “Send test” to make sure it works.');
      redirect(res, '/app/alerts');
    }),
    auth,
  );

  router.post(
    '/app/alerts/:id/test',
    action('/app/alerts', async (req, res, { id }) => {
      const channel = svc.getChannel(req.user.id, id);
      if (!channel) throw new UserError('Channel not found.');
      if (!rateLimit(`testalert:${req.user.id}`, 10, 10 * 60_000)) throw new UserError('Too many test alerts. Please wait a few minutes.');
      try {
        await alerter.sendTest(channel, req.user);
      } catch (err) {
        logger.error(`[alerts] test failed: ${err.message}`);
        throw new UserError(`Test failed: ${err.message}`);
      }
      setFlash(res, 'success', 'Test alert sent.');
      redirect(res, '/app/alerts');
    }),
    auth,
  );

  router.post(
    '/app/alerts/:id/delete',
    action('/app/alerts', (req, res, { id }) => {
      svc.deleteChannel(req.user, id);
      setFlash(res, 'success', 'Alert channel removed.');
      redirect(res, '/app/alerts');
    }),
    auth,
  );

  // ---- Status pages & reports ------------------------------------------------
  router.get(
    '/app/pages',
    (req, res) => sendHtml(res, 200, pagesListPage(ctx, req, { pages: svc.listPages(req.user.id), plan: accounts.planOf(req.user) })),
    auth,
  );

  router.post(
    '/app/pages',
    action('/app/pages', (req, res) => {
      const page = svc.createPage(req.user, req.body);
      setFlash(res, 'success', 'Status page created. Choose which sites appear on it.');
      redirect(res, `/app/pages/${page.id}`);
    }),
    auth,
  );

  router.get(
    '/app/pages/:id',
    (req, res, { id }) => {
      const page = svc.getPage(req.user.id, id);
      if (!page) return ctx.views.notFound(req, res);
      sendHtml(res, 200, pageEditPage(ctx, req, { page, monitors: svc.list(req.user.id), plan: accounts.planOf(req.user) }));
    },
    auth,
  );

  router.post(
    '/app/pages/:id',
    action(
      ({ id }) => `/app/pages/${id}`,
      (req, res, { id }) => {
        svc.updatePage(req.user, id, req.body);
        setFlash(res, 'success', 'Status page saved.');
        redirect(res, `/app/pages/${id}`);
      },
    ),
    auth,
  );

  router.post(
    '/app/pages/:id/delete',
    action('/app/pages', (req, res, { id }) => {
      svc.deletePage(req.user, id);
      setFlash(res, 'success', 'Status page deleted.');
      redirect(res, '/app/pages');
    }),
    auth,
  );

  router.get(
    '/app/pages/:id/report',
    (req, res, { id }) => {
      const page = svc.getPage(req.user.id, id);
      if (!page) return ctx.views.notFound(req, res);
      const msg = reports.render(page, req.user, previousMonthRange(Date.now()));
      sendHtml(res, 200, msg.html);
    },
    auth,
  );

  router.post(
    '/app/pages/:id/send-report',
    action(
      ({ id }) => `/app/pages/${id}`,
      async (req, res, { id }) => {
        const page = svc.getPage(req.user.id, id);
        if (!page) throw new UserError('Page not found.');
        if (!accounts.planOf(req.user).reports) throw new UserError('Client reports are part of the Agency plan.', 402);
        if (!rateLimit(`samplereport:${req.user.id}`, 5, 60 * 60_000)) throw new UserError('Please wait a while before sending another sample.');
        await reports.sendReport(page, req.user, previousMonthRange(Date.now()), { onlyTo: req.user.email });
        setFlash(res, 'success', `Sample report sent to ${req.user.email}.`);
        redirect(res, `/app/pages/${id}`);
      },
    ),
    auth,
  );

  // ---- Settings ----------------------------------------------------------------
  router.get('/app/settings', (req, res) => sendHtml(res, 200, settingsPage(ctx, req, { user: req.user, plan: accounts.planOf(req.user) })), auth);

  router.post(
    '/app/settings/branding',
    action('/app/settings', (req, res) => {
      if (!accounts.planOf(req.user).whiteLabel) throw new UserError('Custom branding is part of the Agency plan.', 402);
      const name = String(req.body.brandName || '').trim().slice(0, 60) || null;
      const logo = String(req.body.brandLogoUrl || '').trim() || null;
      const color = String(req.body.brandColor || '').trim() || null;
      if (logo && !/^https:\/\/\S+$/i.test(logo)) throw new UserError('The logo URL must start with https://');
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new UserError('Brand colour must be a hex value like #2a78d6.');
      db.run('UPDATE users SET brand_name = ?, brand_logo_url = ?, brand_color = ? WHERE id = ?', name, logo, color, req.user.id);
      setFlash(res, 'success', 'Branding saved.');
      redirect(res, '/app/settings');
    }),
    auth,
  );

  router.post(
    '/app/settings/emails',
    action('/app/settings', (req, res) => {
      db.run('UPDATE users SET marketing_opt_out = ? WHERE id = ?', req.body.marketing ? 0 : 1, req.user.id);
      setFlash(res, 'success', 'Email preference saved.');
      redirect(res, '/app/settings');
    }),
    auth,
  );

  router.post(
    '/app/settings/delete',
    action('/app/settings', async (req, res) => {
      if (String(req.body.confirm || '').trim() !== 'DELETE') throw new UserError('Type DELETE to confirm account deletion.');
      await billing.cancelImmediately(req.user);
      accounts.deleteUser(req.user.id);
      res.cookies.push(ctx.auth.sessionCookie('', 0));
      redirect(res, '/?deleted=1');
    }),
    auth,
  );

  // ---- Billing -------------------------------------------------------------------
  router.get(
    '/app/billing',
    async (req, res) => {
      let user = req.user;
      const sessionId = req.query.get('session_id');
      if (req.query.get('success') && sessionId) {
        try {
          user = (await billing.syncCheckoutSession(user, sessionId)) || accounts.findUser(user.id);
        } catch (err) {
          logger.error(`[billing] could not sync checkout session: ${err.message}`);
        }
      }
      const counts = { monitors: db.get('SELECT COUNT(*) AS n FROM monitors WHERE user_id = ?', user.id).n };
      const notice = req.query.get('success') ? 'success' : req.query.get('canceled') ? 'canceled' : null;
      const billingReady = config.stripe.enabled && Boolean(config.stripe.prices.pro.month && config.stripe.prices.agency.month);
      sendHtml(res, 200, billingPage(ctx, req, { user, plan: accounts.planOf(user), billingReady, counts, notice }));
    },
    auth,
  );

  router.post(
    '/app/billing/checkout',
    action('/app/billing', async (req, res) => {
      const plan = String(req.body.plan || '');
      if (!['pro', 'agency'].includes(plan)) throw new UserError('Please choose a plan.');
      const url = await stripeCall(() =>
        billing.hasActiveSubscription(req.user)
          ? billing.createPortal(req.user)
          : billing.createCheckout(req.user, plan, req.body.interval === 'year' ? 'year' : 'month'),
      );
      redirect(res, url);
    }),
    auth,
  );

  router.post(
    '/app/billing/portal',
    action('/app/billing', async (req, res) => {
      redirect(res, await stripeCall(() => billing.createPortal(req.user)));
    }),
    auth,
  );
}
