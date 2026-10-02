// Owner-only routes (restricted to ADMIN_EMAILS) and the Stripe webhook endpoint.
import fs from 'node:fs';
import path from 'node:path';
import { sendHtml, sendJson, redirect, setFlash } from '../http/server.js';
import { adminPage } from '../views/admin.js';
import { EMAIL_RE } from '../services/auth.js';

export function registerAdminRoutes(router, ctx) {
  const { config, admin, accounts, billing, logger = console } = ctx;
  const opts = { auth: true, admin: true };

  const listBackups = () =>
    config.backupDir && fs.existsSync(config.backupDir)
      ? fs
          .readdirSync(config.backupDir)
          .filter((f) => /^backup-\d{4}-\d{2}-\d{2}\.db$/.test(f))
          .sort()
          .reverse()
      : [];

  router.get('/admin', (req, res) => sendHtml(res, 200, adminPage(ctx, req, { o: admin.overview(), users: admin.recentUsers(100), backups: listBackups() })), opts);

  router.post(
    '/admin/users/:id/override',
    (req, res, { id }) => {
      accounts.setOverride(Number(id), String(req.body.plan || ''));
      setFlash(res, 'success', 'Complimentary plan updated.');
      redirect(res, '/admin');
    },
    opts,
  );

  router.post(
    '/admin/change-email',
    (req, res) => {
      const from = String(req.body.from || '').trim().toLowerCase();
      const to = String(req.body.to || '').trim().toLowerCase();
      const user = accounts.findByEmail(from);
      if (!user) setFlash(res, 'error', `No account uses ${from}.`);
      else if (!EMAIL_RE.test(to)) setFlash(res, 'error', `${to} is not a valid email address.`);
      else if (accounts.findByEmail(to)) setFlash(res, 'error', `${to} already has an account.`);
      else {
        ctx.db.run('UPDATE users SET email = ? WHERE id = ?', to, user.id);
        ctx.db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
        setFlash(res, 'success', `Changed ${from} to ${to}. They can now sign in with the new address.`);
      }
      redirect(res, '/admin');
    },
    opts,
  );

  router.post(
    '/admin/delete-user',
    async (req, res) => {
      const email = String(req.body.email || '').trim().toLowerCase();
      const user = accounts.findByEmail(email);
      if (!user) setFlash(res, 'error', `No account uses ${email}.`);
      else if (String(req.body.confirm || '').trim() !== 'DELETE') setFlash(res, 'error', 'Type DELETE to confirm.');
      else {
        await billing.cancelImmediately(user);
        accounts.deleteUser(user.id);
        setFlash(res, 'success', `Deleted ${email} and all of their data. Any subscription was cancelled.`);
      }
      redirect(res, '/admin');
    },
    opts,
  );

  router.get(
    '/admin/backups/:file',
    (req, res, { file }) => {
      if (!listBackups().includes(file)) return ctx.views.notFound(req, res);
      const full = path.join(config.backupDir, file);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file}"`,
        'Content-Length': fs.statSync(full).size,
      });
      fs.createReadStream(full).pipe(res);
    },
    opts,
  );

  router.post(
    '/webhooks/stripe',
    async (req, res) => {
      let event;
      try {
        event = billing.verify(req.rawBody, req.headers['stripe-signature']);
      } catch (err) {
        logger.error(`[stripe] webhook rejected: ${err.message}`);
        return sendJson(res, 400, { error: 'invalid signature' });
      }
      try {
        const outcome = await billing.handleEvent(event);
        sendJson(res, 200, { received: true, outcome });
      } catch (err) {
        logger.error(`[stripe] webhook ${event.type} failed: ${err.stack || err.message}`);
        // Allow Stripe to retry this event later.
        ctx.db.run('DELETE FROM billing_events WHERE id = ?', event.id);
        sendJson(res, 500, { error: 'processing failed' });
      }
    },
    { skipCsrf: true },
  );
}
