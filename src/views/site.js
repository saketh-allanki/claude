// Public marketing pages: home, agencies, pricing, sign-in and error pages.
import { html } from '../lib/html.js';
import { layout } from './layout.js';
import { formatMoney } from '../lib/format.js';

export function signupForm(ctx, req, { compact = false, ref = 'hero', url = '' } = {}) {
  if (req.user) {
    return html`<form class="signup-form ${compact ? 'compact' : ''}" method="post" action="/app/monitors">
      <input type="hidden" name="_csrf" value="${req.csrf}">
      <label class="sr-only" for="su-url-${ref}">Website to monitor</label>
      <input id="su-url-${ref}" name="url" type="text" inputmode="url" placeholder="yourclient.com" value="${url}" required>
      <button class="btn btn-primary" type="submit">Start monitoring</button>
    </form>`;
  }
  return html`<form class="signup-form ${compact ? 'compact' : ''}" method="post" action="/login">
    <input type="hidden" name="ref" value="${ref}">
    <label class="sr-only" for="su-url-${ref}">Website to monitor</label>
    <input id="su-url-${ref}" name="url" type="text" inputmode="url" autocomplete="url" placeholder="yourclient.com" value="${url}">
    <label class="sr-only" for="su-email-${ref}">Your email</label>
    <input id="su-email-${ref}" name="email" type="email" autocomplete="email" placeholder="you@agency.com" required>
    <button class="btn btn-primary" type="submit">Start monitoring free</button>
  </form>`;
}

function demoDashboard() {
  const rows = [
    ['brightsmile.example', 'up', '99.98%', '63 days', 'ok', '211 days', 'ok'],
    ['northside.example', 'down', '97.41%', '41 days', 'ok', '12 days', 'warn'],
    ['bloomflorist.example', 'up', '100%', '6 days', 'warn', '340 days', 'ok'],
    ['harborlaw.example', 'up', '99.95%', '88 days', 'ok', '95 days', 'ok'],
  ];
  return html`<div class="demo-window" aria-label="Example dashboard (illustration)">
    <div class="demo-bar"><span></span><span></span><span></span><em>Illustration · example data</em></div>
    <div class="table-wrap"><table class="table demo-table">
      <thead><tr><th>Site</th><th>Status</th><th>SSL</th><th>Domain</th></tr></thead>
      <tbody>
        ${rows.map(
          ([site, status, , ssl, sslCls, dom, domCls]) => html`<tr>
            <td><strong>${site}</strong></td>
            <td>${status === 'up' ? html`<span class="pill pill-good"><span class="dot"></span>Up</span>` : html`<span class="pill pill-bad"><span class="dot"></span>Down</span>`}</td>
            <td><span class="expiry expiry-${sslCls}">${ssl}</span></td>
            <td><span class="expiry expiry-${domCls}">${dom}</span></td>
          </tr>`,
        )}
      </tbody>
    </table></div>
  </div>`;
}

const ICONS = {
  down: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3 7 4-14 3 7h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  globe: html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  report: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 17v-3M12 17v-6M15 17v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};

function pricingCards(ctx, req, { interval = 'month' } = {}) {
  const plans = ctx.config.plans;
  const trial = ctx.config.stripe.trialDays;
  const card = (plan, features, featured = false) => {
    const price = interval === 'year' && plan.yearly ? plan.yearly : plan.monthly;
    const per = plan.monthly === 0 ? 'forever' : interval === 'year' ? '/year' : '/month';
    const cta = plan.id === 'free' ? 'Start free' : trial ? `Start ${trial}-day free trial` : `Choose ${plan.name}`;
    const href = req.user ? '/app/billing' : `/signup?plan=${plan.id}`;
    return html`<div class="price-card ${featured ? 'featured' : ''}">
      ${featured ? html`<div class="badge">Most popular with agencies</div>` : ''}
      <h3>${plan.name}</h3>
      <p class="muted">${plan.tagline}</p>
      <div class="price"><span class="amount">${formatMoney(price)}</span><span class="per">${per}</span></div>
      ${interval === 'year' && plan.yearly ? html`<p class="small muted">${formatMoney(plan.yearly / 12)}/month billed yearly</p>` : html`<p class="small muted">&nbsp;</p>`}
      <a class="btn ${featured ? 'btn-primary' : 'btn-secondary'} btn-block" href="${href}">${cta}</a>
      <ul class="checks">${features.map((f) => html`<li>${f}</li>`)}</ul>
    </div>`;
  };
  return html`<div class="pricing-grid">
    ${card(plans.free, [`${plans.free.monitors} websites`, 'Checks every 5 minutes', 'SSL & domain expiry alerts', 'Email alerts', '1 public status page'])}
    ${card(plans.agency, [`${plans.agency.monitors} websites`, 'Checks every minute', 'White-label monthly client reports', 'Unlimited branded status pages', 'Your logo & colours — our name hidden', 'Slack, Discord & webhook alerts'], true)}
    ${card(plans.pro, [`${plans.pro.monitors} websites`, 'Checks every minute', 'SSL & domain expiry alerts', 'Slack, Discord & webhook alerts', `${plans.pro.pages} status pages`])}
  </div>`;
}

const FAQ = (ctx) => [
  ['How is this different from a free uptime checker?', `Most uptime tools only tell you a site is down. ${ctx.config.brandName} also watches the two slow-burning failures — expiring SSL certificates and lapsing domains — and turns all of it into a monthly report your clients actually read.`],
  ['Do you need access to my server, code or hosting?', 'No. We check sites from the outside, exactly like a visitor would. Paste a URL and you are done. Nothing to install.'],
  ['How do you avoid false alarms?', 'When a check fails we immediately re-check before alerting. You are only alerted when the failure is confirmed, and you get a recovery message with the total downtime when the site comes back.'],
  ['Will my clients see your brand?', 'Not on the Agency plan. Reports and status pages carry your name, logo and colour. On Free and Pro, status pages show a small “Powered by” link.'],
  ['Can I cancel any time?', 'Yes. Upgrade, downgrade or cancel yourself from the billing page — no emails, no calls. If you go over a plan limit we pause the newest sites; nothing is ever deleted.'],
  ['Which domain extensions do you support for expiry checks?', 'Every extension whose registry publishes expiry data over RDAP — including .com, .net, .org, .io, .co, .app, .dev, .uk and hundreds more. A few country-code registries do not publish expiry dates; we show this clearly instead of guessing.'],
];

function faqList(ctx) {
  return html`<div class="faq">${FAQ(ctx).map(([q, a]) => html`<details><summary>${q}</summary><p>${a}</p></details>`)}</div>`;
}

export function homePage(ctx, req) {
  const c = ctx.config;
  const body = html`
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <p class="eyebrow">Website monitoring for agencies & freelancers</p>
        <h1>Know before your clients do.</h1>
        <p class="lead">${c.brandName} watches every site you manage for downtime, expiring SSL certificates and lapsing domains — then sends each client a branded monthly report that shows exactly what you do for them.</p>
        ${signupForm(ctx, req, { ref: 'hero' })}
        <p class="small muted">Free forever for ${c.plans.free.monitors} sites · No credit card · Set up in 30 seconds</p>
      </div>
      ${demoDashboard()}
    </div>
  </section>

  <section id="features" class="section">
    <div class="container">
      <h2 class="section-title">The three ways a website quietly dies</h2>
      <p class="section-sub">Each one costs a client sales, trust or search ranking — and each one is preventable if someone is watching.</p>
      <div class="cards-3">
        <div class="card feature"><div class="icon">${ICONS.down}</div><h3>Downtime</h3><p>Servers crash, plugins break and hosts have outages. We check every minute from outside, confirm the failure and alert you by email, Slack, Discord or webhook — then tell you when it's back.</p></div>
        <div class="card feature"><div class="icon">${ICONS.lock}</div><h3>Expired SSL certificates</h3><p>When a certificate expires, browsers replace the site with a full-page security warning. Auto-renewal fails silently more often than anyone admits. We warn you 14, 7, 3 and 1 day before.</p></div>
        <div class="card feature"><div class="icon">${ICONS.globe}</div><h3>Lapsed domains</h3><p>An expired card on a registrar account can take down the website and its email at once — and a lapsed name can be bought by someone else. We read the registry's expiry date and warn you 30 days out.</p></div>
      </div>
    </div>
  </section>

  <section class="section alt">
    <div class="container split">
      <div>
        <p class="eyebrow">For agencies</p>
        <h2>Turn “nothing went wrong” into a reason to renew.</h2>
        <p class="lead-sm">When monitoring works, clients never notice — so they wonder what they pay you for. On the Agency plan, every client gets a monthly report under <strong>your</strong> brand: uptime, response times, incidents fixed, and upcoming SSL and domain renewals.</p>
        <ul class="checks">
          <li>Your logo, name and colour. Our name never appears.</li>
          <li>Sent automatically on the 1st of every month.</li>
          <li>A live status page for every client.</li>
          <li>Renewal dates surfaced early — easy upsell conversations.</li>
        </ul>
        <a class="btn btn-secondary" href="/agencies">See how agencies use it</a>
      </div>
      <div class="report-preview" aria-label="Example client report (illustration)">
        <div class="rp-head"><span class="rp-logo">●</span> Your Agency</div>
        <h3>Website report · September</h3>
        <div class="rp-stats">
          <div><span>Overall uptime</span><strong class="good-text">99.97%</strong></div>
          <div><span>Incidents</span><strong>1</strong></div>
          <div><span>Avg. response</span><strong>412 ms</strong></div>
        </div>
        <p class="small muted">Upcoming renewals: brightsmile.example — SSL certificate renews by Oct 14.</p>
        <p class="tiny muted">Illustration · example data</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <h2 class="section-title">Set up once. Never think about it again.</h2>
      <div class="steps">
        <div><span class="step-n">1</span><h3>Paste a URL</h3><p>Uptime, SSL and domain monitoring start immediately. No code, no plugin, no DNS changes.</p></div>
        <div><span class="step-n">2</span><h3>Choose where alerts go</h3><p>Email by default. Add Slack, Discord or any webhook so the right person hears about it first.</p></div>
        <div><span class="step-n">3</span><h3>Get on with your day</h3><p>We watch around the clock, re-check before alerting, and send client reports for you every month.</p></div>
      </div>
    </div>
  </section>

  <section class="section alt">
    <div class="container">
      <h2 class="section-title">Everything you need, nothing you don't</h2>
      <div class="feature-list">
        <div><h4>1-minute checks</h4><p>Hear about outages within a couple of minutes, not hours.</p></div>
        <div><h4>Confirmed alerts</h4><p>Every failure is re-checked before anyone is woken up.</p></div>
        <div><h4>Keyword checks</h4><p>Catch “200 OK” error pages by requiring a word on the page.</p></div>
        <div><h4>Public status pages</h4><p>Share a live page and an embeddable status badge per client.</p></div>
        <div><h4>Slack, Discord & webhooks</h4><p>Pipe alerts wherever your team already lives.</p></div>
        <div><h4>90-day history</h4><p>Daily uptime, response times and a full incident log.</p></div>
        <div><h4>Client reports</h4><p>Branded monthly emails that prove your value automatically.</p></div>
        <div><h4>No passwords</h4><p>Sign in with an email link. Nothing to forget or leak.</p></div>
      </div>
    </div>
  </section>

  <section class="section" id="pricing">
    <div class="container">
      <h2 class="section-title">Simple pricing</h2>
      <p class="section-sub">Start free. Upgrade when you have more sites — or clients who deserve a report.</p>
      ${pricingCards(ctx, req)}
      <p class="center small muted">Save two months with yearly billing. <a href="/pricing">Compare plans in detail →</a></p>
    </div>
  </section>

  <section class="section alt">
    <div class="container narrow">
      <h2 class="section-title">Questions</h2>
      ${faqList(ctx)}
    </div>
  </section>

  <section class="section cta-band">
    <div class="container narrow center">
      <h2>Start watching your sites in 30 seconds</h2>
      <p class="lead-sm">Free for ${c.plans.free.monitors} sites. No credit card required.</p>
      ${signupForm(ctx, req, { ref: 'footer', compact: true })}
    </div>
  </section>`;

  return layout(ctx, req, {
    body,
    canonical: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: c.brandName,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: c.baseUrl,
      description: 'Uptime, SSL certificate and domain expiry monitoring with white-label client reports for web agencies.',
      offers: Object.values(c.plans).map((p) => ({ '@type': 'Offer', name: p.name, price: String(p.monthly), priceCurrency: 'USD' })),
    },
  });
}

export function agenciesPage(ctx, req) {
  const c = ctx.config;
  const a = c.plans.agency;
  const body = html`
  <section class="hero slim">
    <div class="container narrow center">
      <p class="eyebrow">${c.brandName} for agencies</p>
      <h1>Website care plans that sell themselves.</h1>
      <p class="lead">Monitor every client site for downtime, SSL and domain expiry — and send each client a monthly report under your brand. ${formatMoney(a.monthly)}/month for up to ${a.monitors} sites.</p>
      ${signupForm(ctx, req, { ref: 'agencies' })}
    </div>
  </section>
  <section class="section">
    <div class="container prose-grid">
      <div class="prose">
        <h2>The problem with “maintenance retainers”</h2>
        <p>When you do the job well, nothing happens. Sites stay up, certificates renew, domains never lapse — and at renewal time the client asks what exactly they are paying for.</p>
        <p>${c.brandName} fixes the visibility problem. It quietly watches every site you look after and, on the 1st of each month, emails your client a clean report with your logo: uptime percentage, average response time, every incident and how long it took to fix, and the SSL and domain renewals coming up.</p>
        <h2>What your clients receive</h2>
        <ul>
          <li><strong>A monthly report</strong> in their inbox, from your brand, with no mention of us.</li>
          <li><strong>A live status page</strong> they can bookmark or link from their own site.</li>
          <li><strong>Peace of mind</strong> that someone is watching their renewals.</li>
        </ul>
        <h2>What you get</h2>
        <ul>
          <li>One dashboard for every client site, sorted with problems first.</li>
          <li>Alerts in Slack or Discord before the client notices anything.</li>
          <li>Early warning of expiring domains and certificates — and a natural upsell conversation.</li>
          <li>A tool that pays for itself if it saves a single client relationship.</li>
        </ul>
        <h2>How to package it</h2>
        <p>Many agencies bundle monitoring and reporting into a “website care plan” billed monthly per client. Even a modest care plan on a handful of clients covers the cost of the Agency plan many times over — and the report is the thing that makes the plan feel tangible.</p>
      </div>
      <aside class="card sticky">
        <h3>Agency plan</h3>
        <div class="price"><span class="amount">${formatMoney(a.monthly)}</span><span class="per">/month</span></div>
        <ul class="checks">
          <li>${a.monitors} websites, checked every minute</li>
          <li>White-label monthly client reports</li>
          <li>Unlimited branded status pages</li>
          <li>Slack, Discord & webhook alerts</li>
          <li>SSL & domain expiry tracking</li>
        </ul>
        <a class="btn btn-primary btn-block" href="${req.user ? '/app/billing' : '/signup?plan=agency'}">${c.stripe.trialDays ? `Start ${c.stripe.trialDays}-day free trial` : 'Get started'}</a>
        <p class="small muted center">Cancel any time, in two clicks.</p>
      </aside>
    </div>
  </section>`;
  return layout(ctx, req, {
    title: 'Uptime monitoring & white-label reports for web agencies',
    description: `Monitor client websites for downtime, SSL and domain expiry, and send branded monthly uptime reports automatically. ${c.brandName} for agencies.`,
    body,
    canonical: '/agencies',
  });
}

export function pricingPage(ctx, req) {
  const c = ctx.config;
  const p = c.plans;
  const yes = html`<span class="yes" aria-label="Included">✓</span>`;
  const no = html`<span class="no" aria-label="Not included">—</span>`;
  const rows = [
    ['Websites', p.free.monitors, p.pro.monitors, p.agency.monitors],
    ['Check frequency', 'Every 5 min', 'Every minute', 'Every minute'],
    ['Uptime, SSL & domain monitoring', yes, yes, yes],
    ['Email alerts', yes, yes, yes],
    ['Slack, Discord & webhook alerts', no, yes, yes],
    ['Public status pages', p.free.pages, p.pro.pages, 'Unlimited'],
    ['Status badge for your site', yes, yes, yes],
    ['White-label (your brand, not ours)', no, no, yes],
    ['Monthly client reports by email', no, no, yes],
    ['90-day history', yes, yes, yes],
  ];
  const body = html`
  <section class="hero slim">
    <div class="container narrow center">
      <h1>Pricing</h1>
      <p class="lead">Start free. Pay when you need more sites, faster checks or client reports. Cancel any time.</p>
    </div>
  </section>
  <section class="section tight">
    <div class="container">
      <div class="interval-toggle" role="tablist">
        <input type="radio" name="interval" id="int-month" checked><label for="int-month">Monthly</label>
        <input type="radio" name="interval" id="int-year"><label for="int-year">Yearly <span class="save">2 months free</span></label>
        <div class="interval-month">${pricingCards(ctx, req, { interval: 'month' })}</div>
        <div class="interval-year">${pricingCards(ctx, req, { interval: 'year' })}</div>
      </div>
      <div class="table-wrap">
        <table class="table compare">
          <thead><tr><th></th><th>Free</th><th>Pro</th><th>Agency</th></tr></thead>
          <tbody>${rows.map(([label, ...cells]) => html`<tr><th scope="row">${label}</th>${cells.map((v) => html`<td>${v}</td>`)}</tr>`)}</tbody>
        </table>
      </div>
      <p class="center small muted">Prices in USD. ${c.stripe.automaticTax ? 'Sales tax / VAT is added at checkout where required.' : ''} Paid plans include a ${c.stripe.trialDays}-day free trial.</p>
    </div>
  </section>
  <section class="section alt">
    <div class="container narrow">
      <h2 class="section-title">Questions</h2>
      ${faqList(ctx)}
    </div>
  </section>`;
  return layout(ctx, req, {
    title: 'Pricing',
    description: `${c.brandName} pricing: free for ${p.free.monitors} sites, Pro ${formatMoney(p.pro.monthly)}/month, Agency ${formatMoney(p.agency.monthly)}/month with white-label client reports.`,
    body,
    canonical: '/pricing',
  });
}

export function loginPage(ctx, req, { signup = false, error = '', email = '', url = '', next = '' } = {}) {
  const c = ctx.config;
  const body = html`<section class="auth">
    <div class="auth-card card">
      <h1>${signup ? 'Create your free account' : 'Sign in'}</h1>
      <p class="muted">${signup ? `Free for ${c.plans.free.monitors} sites. No password, no credit card — we'll email you a secure sign-in link.` : "Enter your email and we'll send you a secure sign-in link. No password needed."}</p>
      ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
      <form method="post" action="/login" class="stack">
        <input type="hidden" name="next" value="${next}">
        ${signup
          ? html`<label>Website to monitor <span class="muted">(optional)</span>
              <input name="url" type="text" inputmode="url" placeholder="yourclient.com" value="${url}"></label>`
          : ''}
        <label>Email address
          <input name="email" type="email" autocomplete="email" required autofocus value="${email}" placeholder="you@agency.com"></label>
        <button class="btn btn-primary btn-block" type="submit">${signup ? 'Create account' : 'Email me a sign-in link'}</button>
      </form>
      <p class="small muted center">${signup ? html`Already have an account? <a href="/login">Sign in</a>` : html`New here? <a href="/signup">Create a free account</a>`}</p>
      ${signup ? html`<p class="tiny muted center">By creating an account you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>` : ''}
    </div>
  </section>`;
  return layout(ctx, req, { title: signup ? 'Create your account' : 'Sign in', body, canonical: signup ? '/signup' : '/login' });
}

export function checkEmailPage(ctx, req, { email }) {
  const body = html`<section class="auth">
    <div class="auth-card card center">
      <div class="big-icon">✉️</div>
      <h1>Check your inbox</h1>
      <p>We sent a sign-in link to <strong>${email}</strong>. It expires in 20 minutes.</p>
      <p class="small muted">Nothing there after a minute? Check your spam or promotions folder, or <a href="/login">try again</a>.</p>
    </div>
  </section>`;
  return layout(ctx, req, { title: 'Check your inbox', body, noindex: true });
}

export function verifyPage(ctx, req, { token, valid }) {
  const body = html`<section class="auth">
    <div class="auth-card card center">
      ${valid
        ? html`<h1>Sign in to ${ctx.config.brandName}</h1>
            <p class="muted">Click the button to finish signing in on this device.</p>
            <form method="post" action="/auth/verify">
              <input type="hidden" name="token" value="${token}">
              <button class="btn btn-primary btn-block" type="submit">Continue</button>
            </form>`
        : html`<h1>This link has expired</h1>
            <p class="muted">Sign-in links work once and expire after 20 minutes. Request a fresh one below.</p>
            <a class="btn btn-primary" href="/login">Get a new link</a>`}
    </div>
  </section>`;
  return layout(ctx, req, { title: 'Sign in', body, noindex: true });
}

export function unsubscribedPage(ctx, req) {
  const body = html`<section class="auth"><div class="auth-card card center">
    <h1>You're unsubscribed</h1>
    <p class="muted">You won't receive tips or product emails any more. You will still get the alerts and reports you set up.</p>
    <a class="btn btn-secondary" href="/">Back to ${ctx.config.brandName}</a>
  </div></section>`;
  return layout(ctx, req, { title: 'Unsubscribed', body, noindex: true });
}

export function notFoundBody() {
  return html`<section class="auth"><div class="auth-card card center">
    <h1>Page not found</h1>
    <p class="muted">The page you were looking for doesn't exist or has moved.</p>
    <a class="btn btn-primary" href="/">Go to the homepage</a>
  </div></section>`;
}

export function errorBody(status, message, req = {}) {
  return html`<section class="auth"><div class="auth-card card center">
    <h1>${status === 402 ? 'Upgrade needed' : status >= 500 ? 'Something went wrong' : 'That did not work'}</h1>
    <p>${message}</p>
    <p>${status === 402 ? html`<a class="btn btn-primary" href="/app/billing">See plans</a>` : html`<a class="btn btn-secondary" href="${req.user ? '/app' : '/'}">${req.user ? 'Back to dashboard' : 'Go to the homepage'}</a>`}</p>
  </div></section>`;
}
