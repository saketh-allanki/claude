// Free tools (SEO lead magnets), guides and legal pages.
import { html, raw } from '../lib/html.js';
import { layout } from './layout.js';
import { signupForm } from './site.js';
import { formatDate, formatMs, daysUntil } from '../lib/format.js';

const TOOLS = [
  {
    slug: 'ssl-checker',
    name: 'SSL certificate checker',
    short: 'See when a site’s SSL certificate expires, who issued it and whether browsers trust it.',
    field: 'domain',
    placeholder: 'example.com',
  },
  {
    slug: 'domain-expiry-checker',
    name: 'Domain expiry checker',
    short: 'Look up a domain’s expiration date and registrar straight from the registry.',
    field: 'domain',
    placeholder: 'example.com',
  },
  {
    slug: 'website-down-checker',
    name: 'Is it down? Website checker',
    short: 'Check whether a website is up for everyone or just you, with status code and response time.',
    field: 'url',
    placeholder: 'https://example.com',
  },
];

export const toolList = TOOLS;

export function toolsIndexPage(ctx, req) {
  const body = html`<section class="hero slim"><div class="container narrow center">
      <h1>Free website tools</h1>
      <p class="lead">Quick checks for the things that take websites offline. No sign-up needed.</p>
    </div></section>
    <section class="section tight"><div class="container cards-3">
      ${TOOLS.map((t) => html`<a class="card feature link-card" href="/tools/${t.slug}"><h3>${t.name}</h3><p>${t.short}</p><span class="link-arrow">Open tool →</span></a>`)}
    </div></section>`;
  return layout(ctx, req, {
    title: 'Free SSL, domain expiry and uptime checkers',
    description: 'Free tools to check SSL certificate expiry, domain expiration dates and whether a website is down.',
    body,
    canonical: '/tools',
  });
}

function resultRow(label, value) {
  return html`<div class="result-row"><span class="muted">${label}</span><strong>${value}</strong></div>`;
}

function verdict(kind, text) {
  return html`<div class="verdict verdict-${kind}"><span class="verdict-icon" aria-hidden="true">${kind === 'good' ? '✓' : kind === 'warn' ? '!' : '✕'}</span>${text}</div>`;
}

function toolResult(slug, input, result) {
  if (!result) return '';
  if (result.error && !result.validTo && !result.expiresAt && slug !== 'website-down-checker') {
    return html`<div class="card result">${verdict('bad', result.error)}</div>`;
  }
  if (slug === 'ssl-checker') {
    const days = daysUntil(result.validTo);
    const kind = !result.ok || days < 0 ? 'bad' : days <= 14 ? 'warn' : 'good';
    const text =
      days < 0
        ? `The certificate for ${input} expired ${-days} days ago.`
        : !result.ok
          ? `Certificate problem: ${result.error}`
          : `The certificate for ${input} is valid and expires in ${days} days.`;
    return html`<div class="card result">
      ${verdict(kind, text)}
      ${resultRow('Expires', formatDate(result.validTo))}
      ${resultRow('Days remaining', days)}
      ${resultRow('Issued', formatDate(result.validFrom))}
      ${resultRow('Issuer', result.issuer)}
      ${resultRow('Common name', result.subject)}
      ${resultRow('Trusted by browsers', result.ok ? 'Yes' : `No — ${result.error}`)}
    </div>`;
  }
  if (slug === 'domain-expiry-checker') {
    const days = daysUntil(result.expiresAt);
    const kind = days < 0 ? 'bad' : days <= 30 ? 'warn' : 'good';
    return html`<div class="card result">
      ${verdict(kind, days < 0 ? `${result.domain} expired ${-days} days ago.` : `${result.domain} expires in ${days} days.`)}
      ${resultRow('Expires', formatDate(result.expiresAt))}
      ${resultRow('Days remaining', days)}
      ${resultRow('Registered', formatDate(result.registeredAt))}
      ${resultRow('Registrar', result.registrar || 'Not published')}
    </div>`;
  }
  return html`<div class="card result">
    ${result.ok ? verdict('good', `${input} is up and responding.`) : verdict('bad', `${input} appears to be down: ${result.error}`)}
    ${resultRow('HTTP status', result.code ?? '—')}
    ${resultRow('Response time', formatMs(result.ms))}
    ${resultRow('Checked from', 'Our monitoring server')}
  </div>`;
}

const TOOL_COPY = {
  'ssl-checker': html`
    <h2>What this SSL checker tells you</h2>
    <p>It connects to the website the same way a browser does and reads the certificate the server presents: when it expires, who issued it, which name it covers and whether browsers trust the chain. If any of those is wrong, visitors see a full-page “Your connection is not private” warning instead of the site.</p>
    <h2>Why certificates still expire in the age of auto-renewal</h2>
    <p>Free certificates from Let’s Encrypt last 90 days and are renewed automatically — until a DNS change, firewall rule, expired API key or server migration quietly breaks the renewal job. Nobody notices until the day the warning appears. Monitoring the actual certificate, not the renewal job, is the only reliable check.</p>
    <h2>Get warned automatically</h2>
    <p>A one-time check only tells you about today. Add the site to monitoring and we will email you 14, 7, 3 and 1 day before the certificate expires — and immediately if it becomes invalid.</p>`,
  'domain-expiry-checker': html`
    <h2>How the lookup works</h2>
    <p>We query the official registry for the domain using RDAP, the modern replacement for WHOIS, and read the expiration date and registrar directly from the source. Subdomains are resolved to the registrable domain automatically.</p>
    <h2>What happens when a domain expires</h2>
    <p>Usually the registrar parks the domain within days: the website disappears and email to that domain stops arriving. After a grace and redemption period the name is released and anyone — including domain squatters — can register it. Expired cards on registrar accounts are the most common cause.</p>
    <h2>Never miss a renewal</h2>
    <p>Add the domain to monitoring and we will remind you 30, 14, 7 and 1 day before it expires, for free.</p>`,
  'website-down-checker': html`
    <h2>Is it down for everyone or just me?</h2>
    <p>This tool requests the page from our server, not your computer. If it loads here but not for you, the problem is probably your network, DNS cache or browser. If it fails here too, the site is down for everyone.</p>
    <h2>Common reasons a website goes down</h2>
    <ul>
      <li>The hosting server or database crashed or ran out of resources.</li>
      <li>A plugin, theme or code deployment broke the site.</li>
      <li>The SSL certificate expired or the domain lapsed.</li>
      <li>DNS records were changed or the domain’s nameservers are failing.</li>
    </ul>
    <h2>Find out the moment it happens</h2>
    <p>Monitoring checks the site every few minutes and alerts you by email, Slack or Discord when it goes down — and again when it recovers.</p>`,
};

export function toolPage(ctx, req, { slug, input = '', result = null, error = '' }) {
  const tool = TOOLS.find((t) => t.slug === slug);
  const monitorTarget = input ? (tool.field === 'url' ? input : `https://${input}`) : '';
  const body = html`<section class="hero slim"><div class="container narrow center">
      <p class="eyebrow"><a href="/tools">Free tools</a></p>
      <h1>${tool.name}</h1>
      <p class="lead">${tool.short}</p>
      <form class="tool-form" method="get" action="/tools/${slug}">
        <label class="sr-only" for="tool-input">${tool.field === 'url' ? 'Website URL' : 'Domain name'}</label>
        <input id="tool-input" name="${tool.field}" type="text" value="${input}" placeholder="${tool.placeholder}" required>
        <button class="btn btn-primary" type="submit">Check</button>
      </form>
    </div></section>
    <section class="section tight"><div class="container narrow">
      ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
      ${toolResult(slug, input, result)}
      ${result
        ? html`<div class="card cta-card">
            <h3>Don’t check this by hand again</h3>
            <p>Monitor ${input} for downtime, SSL and domain expiry — free for ${ctx.config.plans.free.monitors} sites.</p>
            ${signupForm(ctx, req, { ref: `tool-${slug}`, url: monitorTarget, compact: true })}
          </div>`
        : ''}
      <div class="prose">${TOOL_COPY[slug]}</div>
    </div></section>`;
  return layout(ctx, req, {
    title: tool.name,
    description: `${tool.short} Free, instant, no sign-up.`,
    body,
    canonical: `/tools/${slug}`,
    noindex: Boolean(input),
  });
}

export function blogIndexPage(ctx, req, posts) {
  const body = html`<section class="hero slim"><div class="container narrow center">
      <h1>Guides</h1>
      <p class="lead">Practical advice on keeping websites online, secure and renewed — for agencies, freelancers and site owners.</p>
    </div></section>
    <section class="section tight"><div class="container narrow post-list">
      ${posts.map(
        (p) => html`<article class="post-item">
          <h2><a href="/blog/${p.slug}">${p.title}</a></h2>
          <p class="muted">${p.description}</p>
          <p class="small muted">${formatDate(Date.parse(p.date))} · ${p.readingMinutes} min read</p>
        </article>`,
      )}
    </div></section>`;
  return layout(ctx, req, {
    title: 'Guides on uptime, SSL and domain monitoring',
    description: 'Practical guides on website uptime, SSL certificate expiry, domain renewals and client reporting.',
    body,
    canonical: '/blog',
  });
}

export function blogPostPage(ctx, req, post) {
  const c = ctx.config;
  const body = html`<article class="section tight"><div class="container narrow">
      <p class="eyebrow"><a href="/blog">Guides</a></p>
      <h1 class="post-title">${post.title}</h1>
      <p class="small muted">${formatDate(Date.parse(post.date))} · ${post.readingMinutes} min read</p>
      <div class="prose">${raw(post.html)}</div>
      <div class="card cta-card">
        <h3>Let ${c.brandName} watch your sites</h3>
        <p>Uptime, SSL and domain expiry monitoring with alerts by email, Slack and Discord. Free for ${c.plans.free.monitors} sites.</p>
        ${signupForm(ctx, req, { ref: `blog-${post.slug}`, compact: true })}
      </div>
    </div></article>`;
  return layout(ctx, req, {
    title: post.title,
    description: post.description,
    body,
    canonical: `/blog/${post.slug}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      publisher: { '@type': 'Organization', name: c.brandName },
      mainEntityOfPage: `${c.baseUrl}/blog/${post.slug}`,
    },
  });
}

export function legalPage(ctx, req, { title, html: content, canonical }) {
  const body = html`<section class="section tight"><div class="container narrow prose">
    <h1>${title}</h1>
    ${content}
  </div></section>`;
  return layout(ctx, req, { title, body, canonical });
}

export function termsContent(ctx) {
  const c = ctx.config;
  return html`
  <p class="muted">Last updated: ${formatDate(Date.UTC(2026, 9, 1))}</p>
  <p>These terms govern your use of ${c.brandName} (the “Service”), provided by ${c.companyName} (“we”, “us”). By creating an account you agree to them.</p>
  <h2>1. The Service</h2>
  <p>The Service checks the availability of websites you specify, reads their SSL certificates and public domain registration data, and notifies you and people you designate. Checks are made from our servers over the public internet. We aim for high reliability but do not guarantee that every outage or expiry will be detected or that notifications will be delivered.</p>
  <h2>2. Your account</h2>
  <p>You must provide a valid email address and keep access to it secure, because it is how you sign in. You are responsible for activity under your account. You must be at least 18 years old or the age of majority where you live.</p>
  <h2>3. Acceptable use</h2>
  <p>Only monitor websites you own, manage or are authorised to monitor. Do not use the Service to load-test, attack or probe systems, to send unsolicited messages, or in violation of any law. We may suspend accounts that put the Service or others at risk.</p>
  <h2>4. Plans, billing and cancellation</h2>
  <p>Paid plans are billed in advance, monthly or yearly, through our payment processor, Stripe. Free trials convert to a paid subscription unless cancelled before the trial ends. You can cancel at any time from the billing page; your plan stays active until the end of the paid period. Except where required by law, payments are non-refundable, but if something went wrong contact us at <a href="mailto:${c.supportEmail}">${c.supportEmail}</a> and we will make it right. We may change prices with at least 30 days’ notice by email.</p>
  <h2>5. Your content</h2>
  <p>You keep ownership of the information you add, such as URLs, logos and email addresses. You grant us the rights needed to operate the Service, including displaying status pages you choose to make public and sending reports to recipients you specify. You confirm you have permission to send reports to those recipients.</p>
  <h2>6. Availability and changes</h2>
  <p>We may modify or discontinue features. If we discontinue the Service entirely we will give at least 30 days’ notice and refund any prepaid unused period.</p>
  <h2>7. Disclaimer</h2>
  <p>The Service is provided “as is” and “as available”, without warranties of any kind, express or implied, including fitness for a particular purpose. Monitoring is an aid, not a guarantee: you remain responsible for renewing your domains and certificates and for the operation of your websites.</p>
  <h2>8. Limitation of liability</h2>
  <p>To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue or data. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim.</p>
  <h2>9. Termination</h2>
  <p>You may delete your account at any time from the settings page, which permanently deletes your data. We may terminate accounts that breach these terms.</p>
  <h2>10. Governing law</h2>
  <p>These terms are governed by the laws of ${c.governingLaw}, without regard to conflict-of-law rules.</p>
  <h2>11. Contact</h2>
  <p>Questions about these terms: <a href="mailto:${c.supportEmail}">${c.supportEmail}</a>${c.companyAddress ? html`, ${c.companyName}, ${c.companyAddress}` : ''}.</p>`;
}

export function privacyContent(ctx) {
  const c = ctx.config;
  return html`
  <p class="muted">Last updated: ${formatDate(Date.UTC(2026, 9, 1))}</p>
  <p>This policy explains what personal data ${c.companyName} collects when you use ${c.brandName}, why, and what rights you have. We keep it short because we collect very little.</p>
  <h2>What we collect</h2>
  <ul>
    <li><strong>Account data:</strong> your email address, plan, and branding details you choose to add.</li>
    <li><strong>Monitoring data:</strong> the URLs you monitor, check results, incidents, and alert destinations (email addresses, Slack/Discord/webhook URLs).</li>
    <li><strong>Report recipients:</strong> email addresses you add to receive client reports.</li>
    <li><strong>Billing data:</strong> handled by Stripe. We receive your customer ID, plan and payment status — never your full card number.</li>
    <li><strong>Technical data:</strong> IP addresses in short-lived server logs and rate limiting, used for security.</li>
  </ul>
  <h2>How we use it</h2>
  <p>To provide the Service (run checks, send alerts and reports), to sign you in, to bill you, to send essential service emails, and — unless you unsubscribe — occasional tips about getting more from the product. We do not sell personal data or use it for advertising.</p>
  <h2>Legal bases (EEA/UK)</h2>
  <p>Performance of our contract with you; our legitimate interests in securing and improving the Service and in sending relevant product emails (you can opt out at any time); and compliance with legal obligations such as tax records.</p>
  <h2>Processors</h2>
  <p>We use carefully chosen providers to run the Service: our hosting provider, our email delivery provider, Stripe for payments${c.plausibleDomain ? ', and Plausible for cookie-free, aggregate website analytics' : ''}. They process data only on our instructions.</p>
  <h2>Cookies</h2>
  <p>We use a single essential cookie to keep you signed in, and a short-lived cookie to show confirmation messages. No advertising or tracking cookies.</p>
  <h2>Retention</h2>
  <p>Detailed check results are kept for 3 days, daily statistics for about 13 months, and alert history for 6 months. Account data is kept until you delete your account, which permanently deletes it from our live database immediately and from backups within 7 days. Billing records are retained as required by law.</p>
  <h2>Your rights</h2>
  <p>You can access, correct, export or delete your data. Most of this you can do yourself in the app; for anything else email <a href="mailto:${c.supportEmail}">${c.supportEmail}</a>. If you are in the EEA or UK you may also complain to your local data protection authority.</p>
  <h2>Contact</h2>
  <p>${c.companyName}${c.companyAddress ? html`, ${c.companyAddress}` : ''} · <a href="mailto:${c.supportEmail}">${c.supportEmail}</a></p>`;
}
