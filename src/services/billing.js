// Stripe billing through the REST API (no SDK): Checkout for new subscriptions, the
// Customer Portal for self-service changes, and webhooks to keep plans in sync.
import crypto from 'node:crypto';
import { UserError } from '../lib/errors.js';
import { safeEqual } from '../lib/crypto.js';

export function formEncode(obj, prefix = '', out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') formEncode(item, `${name}[${i}]`, out);
        else out.push([`${name}[${i}]`, String(item)]);
      });
    } else if (typeof value === 'object') {
      formEncode(value, name, out);
    } else {
      out.push([name, String(value)]);
    }
  }
  return out;
}

export function signStripePayload(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

export function verifyStripeSignature(payload, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  if (!header) throw new Error('Missing Stripe-Signature header');
  let timestamp = null;
  const signatures = [];
  for (const part of String(header).split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') timestamp = Number(v);
    if (k === 'v1') signatures.push(v);
  }
  if (!timestamp || !signatures.length) throw new Error('Malformed Stripe-Signature header');
  const body = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  if (!signatures.some((sig) => safeEqual(sig, expected))) throw new Error('Stripe signature mismatch');
  if (Math.abs(now / 1000 - timestamp) > toleranceSec) throw new Error('Stripe webhook timestamp outside tolerance');
  return JSON.parse(body);
}

export function createBilling({ db, config, accounts, fetchImpl = globalThis.fetch, logger = console }) {
  const stripe = config.stripe;

  async function api(method, path, params = null) {
    if (!stripe.secretKey) throw new UserError('Billing is not configured yet. Please try again later.', 503);
    const url = new URL(`https://api.stripe.com/v1${path}`);
    const init = {
      method,
      headers: { authorization: `Bearer ${stripe.secretKey}`, 'stripe-version': '2024-06-20' },
      signal: AbortSignal.timeout(20000),
    };
    if (params && method === 'GET') {
      for (const [k, v] of formEncode(params)) url.searchParams.append(k, v);
    } else if (params) {
      init.headers['content-type'] = 'application/x-www-form-urlencoded';
      init.body = new URLSearchParams(formEncode(params)).toString();
    }
    const res = await fetchImpl(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.message || `Stripe error ${res.status}`;
      logger.error(`[stripe] ${method} ${path} failed: ${message}`);
      throw new Error(message);
    }
    return data;
  }

  // Identifies the plan for a Stripe price. Prices from earlier price changes are still
  // recognised through the plan metadata that `npm run stripe:setup` stores on every price.
  function planForPrice(price) {
    const priceId = typeof price === 'string' ? price : price?.id;
    for (const [plan, prices] of Object.entries(stripe.prices)) {
      if (priceId && (prices.month === priceId || prices.year === priceId)) return plan;
    }
    const tagged = price?.metadata?.plan || price?.product?.metadata?.plan;
    if (tagged && config.plans[tagged] && tagged !== 'free') return tagged;
    const lookup = String(price?.lookup_key || '').match(/_(pro|agency)_(monthly|yearly)$/);
    return lookup ? lookup[1] : null;
  }

  const hasActiveSubscription = (user) =>
    Boolean(user.stripe_subscription_id) && ['active', 'trialing', 'past_due', 'unpaid'].includes(user.subscription_status);

  async function createCheckout(user, plan, interval = 'month') {
    const price = stripe.prices[plan]?.[interval === 'year' ? 'year' : 'month'];
    if (!price) throw new UserError('That plan is not available for purchase yet.', 400);
    const params = {
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: `${config.baseUrl}/app/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.baseUrl}/app/billing?canceled=1`,
      client_reference_id: String(user.id),
      allow_promotion_codes: 'true',
      metadata: { user_id: String(user.id) },
      subscription_data: {
        metadata: { user_id: String(user.id) },
        trial_period_days: !user.stripe_subscription_id && stripe.trialDays > 0 ? stripe.trialDays : undefined,
      },
    };
    if (user.stripe_customer_id) params.customer = user.stripe_customer_id;
    else params.customer_email = user.email;
    if (stripe.automaticTax) {
      params.automatic_tax = { enabled: 'true' };
      params.tax_id_collection = { enabled: 'true' };
      if (user.stripe_customer_id) params.customer_update = { address: 'auto', name: 'auto' };
    }
    const session = await api('POST', '/checkout/sessions', params);
    return session.url;
  }

  async function createPortal(user) {
    if (!user.stripe_customer_id) throw new UserError('No billing account yet — choose a plan first.', 400);
    const session = await api('POST', '/billing_portal/sessions', {
      customer: user.stripe_customer_id,
      return_url: `${config.baseUrl}/app/billing`,
      configuration: stripe.portalConfiguration || undefined,
    });
    return session.url;
  }

  function syncSubscription(sub, { deleted = false } = {}) {
    let user = null;
    const metaId = Number(sub.metadata?.user_id);
    if (metaId) user = accounts.findUser(metaId);
    if (!user && sub.customer) user = db.get('SELECT * FROM users WHERE stripe_customer_id = ?', sub.customer);
    if (!user) {
      logger.error(`[stripe] subscription ${sub.id} does not match any user`);
      return null;
    }
    // Ignore updates about an old subscription once the customer has a newer one.
    if (user.stripe_subscription_id && user.stripe_subscription_id !== sub.id && hasActiveSubscription(user)) {
      if (deleted || !['active', 'trialing'].includes(sub.status)) return user;
    }
    const item = sub.items?.data?.[0];
    const active = !deleted && ['active', 'trialing', 'past_due'].includes(sub.status);
    const plan = active ? planForPrice(item?.price) || 'free' : 'free';
    const periodEnd = sub.current_period_end || item?.current_period_end;
    return accounts.setPlan(user.id, plan, {
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      subscription_status: deleted ? 'canceled' : sub.status,
      billing_interval: item?.price?.recurring?.interval || null,
      current_period_end: periodEnd ? periodEnd * 1000 : null,
    });
  }

  async function handleEvent(event) {
    const inserted = db.run('INSERT OR IGNORE INTO billing_events (id, type, at) VALUES (?, ?, ?)', event.id, event.type, Date.now());
    if (!inserted.changes) return 'duplicate';
    const obj = event.data?.object || {};
    switch (event.type) {
      case 'checkout.session.completed': {
        const userId = Number(obj.client_reference_id || obj.metadata?.user_id);
        if (userId && obj.customer) {
          db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', obj.customer, userId);
        }
        if (obj.subscription && stripe.secretKey) {
          const sub = await api('GET', `/subscriptions/${obj.subscription}`);
          syncSubscription(sub);
        }
        return 'ok';
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        syncSubscription(obj);
        return 'ok';
      case 'customer.subscription.deleted':
        syncSubscription(obj, { deleted: true });
        return 'ok';
      default:
        return 'ignored';
    }
  }

  // Applies a completed checkout immediately when the customer returns, without waiting for the webhook.
  async function syncCheckoutSession(user, sessionId) {
    if (!stripe.secretKey || !/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) return null;
    const session = await api('GET', `/checkout/sessions/${sessionId}`, { expand: ['subscription'] });
    if (String(session.client_reference_id) !== String(user.id)) return null;
    if (session.customer) db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', session.customer, user.id);
    if (session.subscription && typeof session.subscription === 'object') return syncSubscription(session.subscription);
    return null;
  }

  async function cancelImmediately(user) {
    if (!user.stripe_subscription_id || !hasActiveSubscription(user)) return;
    try {
      await api('DELETE', `/subscriptions/${user.stripe_subscription_id}`);
    } catch (err) {
      logger.error(`[stripe] could not cancel subscription for user ${user.id}: ${err.message}`);
    }
  }

  return {
    api,
    planForPrice,
    hasActiveSubscription,
    createCheckout,
    createPortal,
    handleEvent,
    syncSubscription,
    syncCheckoutSession,
    cancelImmediately,
    verify: (payload, header) => verifyStripeSignature(payload, header, stripe.webhookSecret),
  };
}
