import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

export const silentLogger = { log() {}, error() {}, warn() {} };

export async function startApp({ env = {}, checks = {}, fetchImpl } = {}) {
  const config = loadConfig(
    {},
    {
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      SESSION_SECRET: 'test-secret',
      SCHEDULER_ENABLED: '0',
      BASE_URL: 'http://localhost',
      ADMIN_EMAILS: 'owner@example.com',
      ...env,
    },
  );
  const app = createApp({ config, checks, fetchImpl, logger: silentLogger });
  const port = await app.listen(0);
  const base = `http://127.0.0.1:${port}`;
  // BASE_URL must match the listening address for Origin checks; patch it after listening.
  app.base = base;
  return app;
}

export function client(app) {
  let cookie = '';
  async function request(method, path, { form, headers = {}, raw } = {}) {
    const init = { method, redirect: 'manual', headers: { ...headers } };
    if (cookie) init.headers.cookie = cookie;
    if (form) {
      init.headers['content-type'] = 'application/x-www-form-urlencoded';
      init.body = new URLSearchParams(form).toString();
    }
    if (raw !== undefined) init.body = raw;
    const res = await fetch(app.base + path, init);
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [name, value] = pair.split('=');
      if (name === 'sid') cookie = value ? `sid=${value}` : '';
    }
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text, headers: res.headers };
  }
  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, form, opts = {}) => request('POST', path, { ...opts, form }),
    raw: request,
    setCookie: (value) => {
      cookie = value;
    },
    get cookie() {
      return cookie;
    },
  };
}

// Signs a user in through the real magic-link flow and returns the CSRF token.
export async function signIn(app, c, email, extra = {}) {
  await c.post('/login', { email, ...extra });
  const mail = app.mailer.outbox.findLast((m) => m.to.includes(email));
  const token = new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
  const res = await c.post('/auth/verify', { token });
  const page = await c.get('/app/settings');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  return { res, csrf, user: app.accounts.findByEmail(email) };
}
