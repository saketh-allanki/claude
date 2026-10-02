// Sign-up, sign-in (magic links) and sign-out.
import { sendHtml, redirect, setFlash } from '../http/server.js';
import { loginPage, checkEmailPage, verifyPage } from '../views/site.js';
import { normalizeUrl } from '../services/monitors.js';
import { UserError } from '../lib/errors.js';
import { sha256 } from '../lib/crypto.js';

const safeNext = (value) => (typeof value === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(value) ? value : '/app');

export function registerAuthRoutes(router, ctx) {
  const { config, auth, db, monitors, accounts, rateLimit, logger = console } = ctx;

  router.get('/login', (req, res) => {
    if (req.user) return redirect(res, '/app');
    sendHtml(res, 200, loginPage(ctx, req, { next: String(req.query.get('next') || '') }));
  });

  router.get('/signup', (req, res) => {
    if (req.user) return redirect(res, '/app');
    const plan = String(req.query.get('plan') || '');
    const next = ['pro', 'agency'].includes(plan) ? '/app/billing' : '';
    sendHtml(res, 200, loginPage(ctx, req, { signup: true, url: String(req.query.get('url') || '').slice(0, 300), next }));
  });

  router.post('/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const rawUrl = String(req.body.url || '').trim();
    const signup = Boolean(req.body.ref) || 'url' in req.body;
    const next = String(req.body.next || '');
    const fail = (status, error) =>
      sendHtml(res, status, loginPage(ctx, req, { signup, error, email, url: rawUrl, next }));

    if (!rateLimit(`login-ip:${req.ip}`, 10, 15 * 60_000) || !rateLimit(`login-email:${email}`, 5, 15 * 60_000)) {
      return fail(429, 'Too many sign-in attempts. Please wait a few minutes and try again.');
    }
    let pendingUrl = null;
    try {
      if (rawUrl) pendingUrl = normalizeUrl(rawUrl, { allowPrivate: config.allowPrivateTargets });
      await auth.requestLogin(email, { pendingUrl: pendingUrl ? JSON.stringify({ url: pendingUrl, next }) : next ? JSON.stringify({ next }) : null });
    } catch (err) {
      if (err instanceof UserError) return fail(400, err.message);
      logger.error(`[auth] could not send login email: ${err.message}`);
      return fail(502, 'We could not send the email just now. Please try again in a minute.');
    }
    sendHtml(res, 200, checkEmailPage(ctx, req, { email }));
  });

  // GET only shows a confirmation button, so email link scanners cannot use up the token.
  router.get('/auth/verify', (req, res) => {
    const token = String(req.query.get('token') || '');
    const row = token ? db.get('SELECT * FROM login_tokens WHERE token_hash = ?', sha256(token)) : null;
    const valid = Boolean(row && !row.used_at && row.expires_at > Date.now());
    sendHtml(res, valid ? 200 : 410, verifyPage(ctx, req, { token, valid }));
  });

  router.post('/auth/verify', async (req, res) => {
    const result = auth.consumeLogin(req.body.token);
    if (!result) return sendHtml(res, 410, verifyPage(ctx, req, { token: '', valid: false }));
    const { user, isNew } = result;
    let pending = {};
    try {
      pending = result.pendingUrl ? JSON.parse(result.pendingUrl) : {};
    } catch {
      pending = {};
    }
    const session = auth.createSession(user.id);
    res.cookies.push(auth.sessionCookie(session.id, Math.floor(auth.SESSION_TTL / 1000)));

    let destination = safeNext(pending.next);
    if (pending.url) {
      try {
        const monitor = monitors.create(user, { url: pending.url });
        destination = `/app/monitors/${monitor.id}`;
        setFlash(res, 'success', `We're now monitoring ${monitor.name}. First results arrive within a minute.`);
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        setFlash(res, 'error', err.message);
      }
    } else if (isNew) {
      setFlash(res, 'success', 'Welcome! Add your first website below to start monitoring.');
    }
    if (isNew) await auth.sendWelcome(accounts.findUser(user.id), pending.url);
    redirect(res, destination);
  }, { csrfToken: false });

  router.post('/logout', (req, res) => {
    auth.destroySession(req.cookies.sid);
    res.cookies.push(auth.sessionCookie('', 0));
    redirect(res, '/');
  });
}
