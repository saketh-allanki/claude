// All runtime configuration lives here and comes from environment variables.
// See .env.example for documentation of every variable.
import crypto from 'node:crypto';

const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d = false) =>
  v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const PLAN_ORDER = ['free', 'pro', 'agency'];

export function buildPlans(env = process.env) {
  const proMonthly = num(env.PRICE_PRO_MONTHLY, 9);
  const agencyMonthly = num(env.PRICE_AGENCY_MONTHLY, 39);
  return {
    free: {
      id: 'free',
      name: 'Free',
      tagline: 'For your own sites',
      monthly: 0,
      yearly: 0,
      monitors: int(env.FREE_MONITORS, 5),
      minInterval: 300,
      pages: 1,
      channels: ['email'],
      whiteLabel: false,
      reports: false,
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      tagline: 'For freelancers',
      monthly: proMonthly,
      yearly: num(env.PRICE_PRO_YEARLY, proMonthly * 10),
      monitors: int(env.PRO_MONITORS, 30),
      minInterval: 60,
      pages: 5,
      channels: ['email', 'slack', 'discord', 'webhook'],
      whiteLabel: false,
      reports: false,
    },
    agency: {
      id: 'agency',
      name: 'Agency',
      tagline: 'For agencies with clients',
      monthly: agencyMonthly,
      yearly: num(env.PRICE_AGENCY_YEARLY, agencyMonthly * 10),
      monitors: int(env.AGENCY_MONITORS, 200),
      minInterval: 60,
      pages: 500,
      channels: ['email', 'slack', 'discord', 'webhook'],
      whiteLabel: true,
      reports: true,
    },
  };
}

export function loadConfig(overrides = {}, env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const baseUrl = (env.BASE_URL || `http://localhost:${int(env.PORT, 3000)}`).replace(/\/+$/, '');
  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    if (nodeEnv === 'production') {
      throw new Error('SESSION_SECRET must be set in production (any long random string).');
    }
    sessionSecret = crypto.randomBytes(32).toString('hex');
  }

  const config = {
    env: nodeEnv,
    isProd: nodeEnv === 'production',
    port: int(env.PORT, 3000),
    baseUrl,
    secureCookies: baseUrl.startsWith('https://'),
    brandName: env.BRAND_NAME || 'Sitewarden',
    supportEmail: env.SUPPORT_EMAIL || 'support@example.com',
    companyName: env.COMPANY_NAME || env.BRAND_NAME || 'Sitewarden',
    companyAddress: env.COMPANY_ADDRESS || '',
    governingLaw: env.GOVERNING_LAW || 'the State of Delaware, USA',
    databasePath: env.DATABASE_PATH || './data/sitewarden.db',
    backupDir: env.BACKUP_DIR || '',
    backupKeep: int(env.BACKUP_KEEP, 7),
    sessionSecret,
    adminEmails: list(env.ADMIN_EMAILS),
    trustProxy: bool(env.TRUST_PROXY, nodeEnv === 'production'),
    allowPrivateTargets: bool(env.ALLOW_PRIVATE_TARGETS, false),
    plausibleDomain: env.PLAUSIBLE_DOMAIN || '',
    email: {
      provider: (env.EMAIL_PROVIDER || (env.EMAIL_API_KEY ? 'resend' : 'log')).toLowerCase(),
      apiKey: env.EMAIL_API_KEY || '',
      from: env.EMAIL_FROM || `${env.BRAND_NAME || 'Sitewarden'} <alerts@example.com>`,
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || '',
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
      portalConfiguration: env.STRIPE_PORTAL_CONFIGURATION || '',
      automaticTax: bool(env.STRIPE_AUTOMATIC_TAX, false),
      trialDays: int(env.TRIAL_DAYS, 14),
      prices: {
        pro: { month: env.STRIPE_PRICE_PRO_MONTHLY || '', year: env.STRIPE_PRICE_PRO_YEARLY || '' },
        agency: { month: env.STRIPE_PRICE_AGENCY_MONTHLY || '', year: env.STRIPE_PRICE_AGENCY_YEARLY || '' },
      },
    },
    scheduler: {
      enabled: bool(env.SCHEDULER_ENABLED, true),
      tickMs: int(env.SCHEDULER_TICK_MS, 5000),
      concurrency: int(env.CHECK_CONCURRENCY, 40),
      confirmFailures: int(env.CONFIRM_FAILURES, 2),
      retryDelayMs: int(env.RETRY_DELAY_MS, 30000),
      httpTimeoutMs: int(env.HTTP_TIMEOUT_MS, 15000),
      sslEveryMs: int(env.SSL_CHECK_HOURS, 6) * 3600_000,
      domainEveryMs: int(env.DOMAIN_CHECK_HOURS, 24) * 3600_000,
    },
    plans: buildPlans(env),
    ...overrides,
  };
  config.stripe.enabled = Boolean(config.stripe.secretKey);
  return config;
}

export const SSL_THRESHOLDS = [14, 7, 3, 1];
export const DOMAIN_THRESHOLDS = [30, 14, 7, 1];
