import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, signIn } from './helpers.js';
import { signStripePayload } from '../src/services/billing.js';

const okChecks = {
  http: async () => ({ ok: true, ms: 100, code: 200, error: null }),
  ssl: async () => ({ ok: true, validTo: Date.now() + 50 * 86400_000, issuer: 'Test CA', validFrom: Date.now() - 86400_000, subject: 'example.com' }),
  domain: async (host) => ({ ok: true, domain: host, expiresAt: Date.now() + 200 * 86400_000, registrar: 'Reg' }),
};

test('public pages render with security headers', async (t) => {
  const app = await startApp({ checks: okChecks });
  t.after(() => app.close());
  const c = client(app);
  for (const path of ['/', '/agencies', '/pricing', '/tools', '/blog', '/terms', '/privacy', '/login', '/signup', '/status/demo']) {
    const res = await c.get(path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  }
  assert.match((await c.get('/sitemap.xml')).text, /<loc>http:\/\/localhost\/pricing<\/loc>/);
  assert.match((await c.get('/robots.txt')).text, /Disallow: \/app/);
  assert.match((await c.get('/badge/demo.svg')).text, /operational/);
  assert.equal((await c.get('/does-not-exist')).status, 404);
  assert.equal((await c.get('/app')).location, '/login?next=%2Fapp');
  const blog = await c.get('/blog');
  const first = blog.text.match(/href="\/blog\/([a-z0-9-]+)"/);
  if (first) assert.equal((await c.get(`/blog/${first[1]}`)).status, 200);
});

test('free tools return results and are rate limited', async (t) => {
  const app = await startApp({ checks: okChecks });
  t.after(() => app.close());
  const c = client(app);
  const ssl = await c.get('/tools/ssl-checker?domain=https://www.example.com/path');
  assert.equal(ssl.status, 200);
  assert.match(ssl.text, /The certificate for www.example.com is valid and expires in (49|50) days/);
  const dom = await c.get('/tools/domain-expiry-checker?domain=shop.example.com');
  assert.match(dom.text, /example.com expires in (199|200) days/);
  const up = await c.get('/tools/website-down-checker?url=example.com');
  assert.match(up.text, /is up and responding/);
  const bad = await c.get('/tools/ssl-checker?domain=not a domain');
  assert.equal(bad.status, 400);
  let last;
  for (let i = 0; i < 20; i++) last = await c.get('/tools/website-down-checker?url=example.com');
  assert.equal(last.status, 429);
});

test('sign-up via magic link creates the account and the first monitor', async (t) => {
  const app = await startApp({ checks: okChecks });
  t.after(() => app.close());
  const c = client(app);

  const res = await c.post('/login', { email: 'New@Agency.com', url: 'client-site.com', ref: 'hero' });
  assert.equal(res.status, 200);
  assert.match(res.text, /Check your inbox/);
  const mail = app.mailer.outbox.at(-1);
  assert.deepEqual(mail.to, ['new@agency.com']);
  const link = mail.text.match(/https?:\/\/\S+/)[0];
  const token = new URL(link).searchParams.get('token');

  // Visiting the link (as an email scanner would) must not consume it.
  const view = await c.get(`/auth/verify?token=${token}`);
  assert.equal(view.status, 200);
  assert.match(view.text, /Continue/);

  const verify = await c.post('/auth/verify', { token });
  assert.equal(verify.status, 303);
  assert.match(verify.location, /^\/app\/monitors\/\d+$/);
  assert.ok(c.cookie.startsWith('sid='));

  const user = app.accounts.findByEmail('new@agency.com');
  const monitors = app.monitors.list(user.id);
  assert.equal(monitors.length, 1);
  assert.equal(monitors[0].url, 'https://client-site.com/');
  assert.ok(app.mailer.outbox.some((m) => m.subject.startsWith('Welcome to')));

  // Tokens are single use.
  const again = await c.post('/auth/verify', { token });
  assert.equal(again.status, 410);

  const detail = await c.get(verify.location);
  assert.equal(detail.status, 200);
  assert.match(detail.text, /client-site\.com/);
});

test('app actions require CSRF tokens and enforce ownership and limits', async (t) => {
  const app = await startApp({ checks: okChecks });
  t.after(() => app.close());
  const alice = client(app);
  const bob = client(app);
  const { csrf } = await signIn(app, alice, 'alice@example.com');
  const bobAuth = await signIn(app, bob, 'bob@example.com');

  const noCsrf = await alice.post('/app/monitors', { url: 'example.com' });
  assert.equal(noCsrf.status, 403);

  const crossSite = await alice.post('/app/monitors', { url: 'example.com', _csrf: csrf }, { headers: { origin: 'https://evil.example' } });
  assert.equal(crossSite.status, 403);

  const created = await alice.post('/app/monitors', { url: 'example.com', name: 'Main site', _csrf: csrf });
  assert.equal(created.status, 303);
  const id = created.location.split('/').pop();

  const invalid = await alice.post('/app/monitors', { url: 'http://localhost', _csrf: csrf });
  assert.equal(invalid.status, 400);
  assert.match(invalid.text, /public website address/);

  // Bob cannot see or delete Alice's monitor.
  assert.equal((await bob.get(`/app/monitors/${id}`)).status, 404);
  await bob.post(`/app/monitors/${id}/delete`, { _csrf: bobAuth.csrf });
  assert.ok(app.db.get('SELECT 1 FROM monitors WHERE id = ?', Number(id)));

  for (let i = 0; i < 4; i++) await alice.post('/app/monitors', { url: `site${i}.example.com`, _csrf: csrf });
  const over = await alice.post('/app/monitors', { url: 'one-too-many.example.com', _csrf: csrf });
  assert.equal(over.status, 303);
  assert.equal(over.location, '/app/billing');

  // Slack alerts are a paid feature.
  const slack = await alice.post('/app/alerts', { type: 'slack', target: 'https://hooks.slack.com/services/T/B/X', _csrf: csrf });
  assert.equal(slack.location, '/app/alerts');
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM channels').n, 0);

  const dashboard = await alice.get('/app');
  assert.match(dashboard.text, /5 of 5 sites/);
  assert.match(dashboard.text, /Main site/);

  // Status page with a monitor, publicly visible.
  const page = await alice.post('/app/pages', { title: 'Acme Corp', _csrf: csrf });
  const pageId = page.location.split('/').pop();
  await alice.post(`/app/pages/${pageId}`, { title: 'Acme Corp', slug: 'acme-corp', monitorIds: id, _csrf: csrf });
  const pub = await client(app).get('/status/acme-corp');
  assert.equal(pub.status, 200);
  assert.match(pub.text, /Main site/);
  assert.match(pub.text, /Powered by/);
  assert.equal(pub.headers.get('x-frame-options'), null, 'status pages can be embedded');

  // Admin is hidden from non-admins.
  assert.equal((await alice.get('/admin')).status, 404);

  const logout = await alice.post('/logout', { _csrf: csrf });
  assert.equal(logout.location, '/');
  assert.equal((await alice.get('/app')).status, 303);
});

test('Stripe webhooks upgrade and downgrade plans idempotently', async (t) => {
  const app = await startApp({
    checks: okChecks,
    env: { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PRICE_AGENCY_MONTHLY: 'price_agency_m', STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m' },
  });
  t.after(() => app.close());
  const user = app.accounts.createUser('payer@example.com');
  const c = client(app);
  const send = (event) => {
    const body = JSON.stringify(event);
    return c.raw('POST', '/webhooks/stripe', { raw: body, headers: { 'content-type': 'application/json', 'stripe-signature': signStripePayload(body, 'whsec_x') } });
  };
  const sub = (status, price = 'price_agency_m') => ({
    id: 'sub_1',
    customer: 'cus_1',
    status,
    metadata: { user_id: String(user.id) },
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    items: { data: [{ price: { id: price, recurring: { interval: 'month' } } }] },
  });

  const forged = await c.raw('POST', '/webhooks/stripe', { raw: '{}', headers: { 'stripe-signature': 't=1,v1=abc' } });
  assert.equal(forged.status, 400);

  let res = await send({ id: 'evt_1', type: 'customer.subscription.created', data: { object: sub('trialing') } });
  assert.equal(res.status, 200);
  let u = app.accounts.findUser(user.id);
  assert.equal(u.plan, 'agency');
  assert.equal(u.stripe_customer_id, 'cus_1');
  assert.equal(u.subscription_status, 'trialing');

  res = await send({ id: 'evt_1', type: 'customer.subscription.created', data: { object: sub('trialing') } });
  assert.match(res.text, /duplicate/);

  await send({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: sub('active', 'price_pro_m') } });
  assert.equal(app.accounts.findUser(user.id).plan, 'pro');
  assert.equal(app.admin.overview().mrr, 9);

  await send({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: sub('canceled', 'price_pro_m') } });
  u = app.accounts.findUser(user.id);
  assert.equal(u.plan, 'free');
  assert.equal(u.subscription_status, 'canceled');
  assert.equal(app.admin.weeklyStats().churned, 1);
});

test('checkout redirects to Stripe with the right parameters', async (t) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: init.body });
    return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test' }), { status: 200 });
  };
  const app = await startApp({
    checks: okChecks,
    fetchImpl,
    env: { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_AGENCY_MONTHLY: 'price_agency_m', STRIPE_PRICE_AGENCY_YEARLY: 'price_agency_y', STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m' },
  });
  t.after(() => app.close());
  const c = client(app);
  const { csrf, user } = await signIn(app, c, 'buyer@example.com');
  const res = await c.post('/app/billing/checkout', { plan: 'agency', interval: 'year', _csrf: csrf });
  assert.equal(res.status, 303);
  assert.equal(res.location, 'https://checkout.stripe.com/c/pay/cs_test');
  const params = new URLSearchParams(calls.at(-1).body);
  assert.equal(params.get('line_items[0][price]'), 'price_agency_y');
  assert.equal(params.get('client_reference_id'), String(user.id));
  assert.equal(params.get('customer_email'), 'buyer@example.com');
  assert.equal(params.get('subscription_data[trial_period_days]'), '14');
  assert.equal(params.get('subscription_data[metadata][user_id]'), String(user.id));
});

test('account deletion removes all user data', async (t) => {
  const app = await startApp({ checks: okChecks });
  t.after(() => app.close());
  const c = client(app);
  const { csrf, user } = await signIn(app, c, 'leaver@example.com');
  await c.post('/app/monitors', { url: 'example.com', _csrf: csrf });
  const wrong = await c.post('/app/settings/delete', { confirm: 'nope', _csrf: csrf });
  assert.equal(wrong.location, '/app/settings');
  assert.ok(app.accounts.findUser(user.id));
  const res = await c.post('/app/settings/delete', { confirm: 'DELETE', _csrf: csrf });
  assert.equal(res.location, '/?deleted=1');
  assert.equal(app.accounts.findUser(user.id), undefined);
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM monitors').n, 0);
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM sessions').n, 0);
});

test('admin dashboard is available to owners', async (t) => {
  const app = await startApp({ checks: okChecks });
  t.after(() => app.close());
  const c = client(app);
  await signIn(app, c, 'owner@example.com');
  const res = await c.get('/admin');
  assert.equal(res.status, 200);
  assert.match(res.text, /Monthly recurring revenue/);
});
