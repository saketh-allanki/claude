// One-time Stripe setup. Creates (or reuses) the products, prices, webhook endpoint and
// customer-portal configuration, then prints the environment variables to set.
//
//   STRIPE_SECRET_KEY=sk_live_... BASE_URL=https://yourdomain.com npm run stripe:setup
//
// Safe to run more than once: prices are found again by their lookup keys.
import { formEncode } from '../src/services/billing.js';
import { buildPlans } from '../src/config.js';

const key = process.env.STRIPE_SECRET_KEY;
const baseUrl = (process.env.BASE_URL || '').replace(/\/+$/, '');
const brand = process.env.BRAND_NAME || 'Sitewarden';
const prefix = brand.toLowerCase().replace(/[^a-z0-9]+/g, '_');

if (!key || !baseUrl.startsWith('https://')) {
  console.error('Usage: STRIPE_SECRET_KEY=sk_... BASE_URL=https://yourdomain.com npm run stripe:setup');
  process.exit(1);
}

async function stripe(method, path, params) {
  const url = new URL(`https://api.stripe.com/v1${path}`);
  const init = { method, headers: { authorization: `Bearer ${key}`, 'stripe-version': '2024-06-20' } };
  if (params && method === 'GET') for (const [k, v] of formEncode(params)) url.searchParams.append(k, v);
  else if (params) {
    init.headers['content-type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(formEncode(params)).toString();
  }
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error?.message || res.status}`);
  return data;
}

const plans = buildPlans(process.env);
const env = {};
const allPrices = [];
const products = [];

for (const plan of [plans.pro, plans.agency]) {
  const lookups = { month: `${prefix}_${plan.id}_monthly`, year: `${prefix}_${plan.id}_yearly` };
  const existing = await stripe('GET', '/prices', { lookup_keys: Object.values(lookups), active: 'true', expand: ['data.product'] });
  let productId = existing.data[0]?.product?.id;
  if (!productId) {
    const product = await stripe('POST', '/products', {
      name: `${brand} ${plan.name}`,
      metadata: { plan: plan.id },
      description: `${plan.monitors} websites monitored for uptime, SSL and domain expiry${plan.reports ? ', with white-label client reports' : ''}.`,
    });
    productId = product.id;
    console.log(`Created product ${product.name} (${productId})`);
  }
  products.push(productId);
  for (const [interval, lookup] of Object.entries(lookups)) {
    let price = existing.data.find((p) => p.lookup_key === lookup);
    const amount = Math.round((interval === 'month' ? plan.monthly : plan.yearly) * 100);
    if (price && price.unit_amount !== amount) {
      console.log(`Price ${lookup} changed (${price.unit_amount} -> ${amount} cents); creating a new price and moving the lookup key.`);
      price = null;
    }
    if (!price) {
      price = await stripe('POST', '/prices', {
        product: productId,
        currency: 'usd',
        unit_amount: amount,
        recurring: { interval },
        lookup_key: lookup,
        transfer_lookup_key: 'true',
        nickname: `${plan.name} ${interval === 'month' ? 'monthly' : 'yearly'}`,
        metadata: { plan: plan.id },
        tax_behavior: 'exclusive',
      });
      console.log(`Created price ${price.nickname}: $${amount / 100}/${interval}`);
    }
    allPrices.push({ product: productId, price: price.id });
    env[`STRIPE_PRICE_${plan.id.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'YEARLY'}`] = price.id;
  }
}

// Webhook endpoint (the signing secret is only shown when the endpoint is created).
const webhookUrl = `${baseUrl}/webhooks/stripe`;
const events = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
];
const hooks = await stripe('GET', '/webhook_endpoints', { limit: 100 });
const existingHook = hooks.data.find((h) => h.url === webhookUrl);
if (existingHook && !process.argv.includes('--recreate-webhook')) {
  console.log(`Webhook endpoint already exists (${existingHook.id}). Keep your current STRIPE_WEBHOOK_SECRET,`);
  console.log('or re-run with --recreate-webhook to replace it and print a new secret.');
} else {
  if (existingHook) await stripe('DELETE', `/webhook_endpoints/${existingHook.id}`);
  const hook = await stripe('POST', '/webhook_endpoints', { url: webhookUrl, enabled_events: events, api_version: '2024-06-20', description: `${brand} subscriptions` });
  env.STRIPE_WEBHOOK_SECRET = hook.secret;
  console.log(`Created webhook endpoint ${hook.url}`);
}

// Customer portal: customers can update cards, see invoices, switch plans and cancel themselves.
const byProduct = new Map();
for (const { product, price } of allPrices) byProduct.set(product, [...(byProduct.get(product) || []), price]);
const portal = await stripe('POST', '/billing_portal/configurations', {
  business_profile: { headline: `${brand} billing`, privacy_policy_url: `${baseUrl}/privacy`, terms_of_service_url: `${baseUrl}/terms` },
  default_return_url: `${baseUrl}/app/billing`,
  features: {
    customer_update: { enabled: 'true', allowed_updates: ['email', 'address', 'tax_id'] },
    invoice_history: { enabled: 'true' },
    payment_method_update: { enabled: 'true' },
    subscription_cancel: { enabled: 'true', mode: 'at_period_end', cancellation_reason: { enabled: 'true', options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] } },
    subscription_update: {
      enabled: 'true',
      default_allowed_updates: ['price'],
      proration_behavior: 'create_prorations',
      products: [...byProduct].map(([product, prices]) => ({ product, prices })),
    },
  },
});
env.STRIPE_PORTAL_CONFIGURATION = portal.id;

console.log('\nDone. Add these to your environment variables:\n');
for (const [k, v] of Object.entries(env)) console.log(`${k}=${v}`);
console.log('');
