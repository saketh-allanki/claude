// Page chrome shared by every screen: <head>, navigation, flash messages and footer.
import { html, raw } from '../lib/html.js';

export const LOGO_SVG = raw(
  `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 4 6.8v8.4c0 7.4 5.1 13.3 12 14.8 6.9-1.5 12-7.4 12-14.8V6.8L16 2z" fill="currentColor"/><path d="M8.5 16.5h4l2-4.5 3.5 8 2-3.5h3.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
);

function analytics(config) {
  if (!config.plausibleDomain) return '';
  return html`<script defer data-domain="${config.plausibleDomain}" src="https://plausible.io/js/script.js"></script>`;
}

function marketingNav(ctx, req) {
  return html`<header class="site-header">
    <div class="container nav">
      <a class="brand" href="/">${LOGO_SVG}<span>${ctx.config.brandName}</span></a>
      <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-label="Toggle menu">
      <label for="nav-toggle" class="nav-burger" aria-hidden="true"><span></span></label>
      <nav class="nav-links" aria-label="Main">
        <a href="/#features">Features</a>
        <a href="/agencies">For agencies</a>
        <a href="/pricing">Pricing</a>
        <a href="/tools">Free tools</a>
        <a href="/blog">Guides</a>
        ${req.user
          ? html`<a class="btn btn-primary btn-sm" href="/app">Dashboard</a>`
          : html`<a href="/login">Sign in</a><a class="btn btn-primary btn-sm" href="/signup">Start free</a>`}
      </nav>
    </div>
  </header>`;
}

function appNav(ctx, req) {
  const isAdmin = ctx.config.adminEmails.includes(String(req.user?.email).toLowerCase());
  const link = (href, label) =>
    html`<a href="${href}" class="${req.path === href || (href !== '/app' && req.path.startsWith(href)) ? 'active' : ''}">${label}</a>`;
  return html`<header class="site-header app-header">
    <div class="container nav">
      <a class="brand" href="/app">${LOGO_SVG}<span>${ctx.config.brandName}</span></a>
      <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-label="Toggle menu">
      <label for="nav-toggle" class="nav-burger" aria-hidden="true"><span></span></label>
      <nav class="nav-links" aria-label="App">
        ${link('/app', 'Sites')}
        ${link('/app/pages', 'Status pages')}
        ${link('/app/alerts', 'Alerts')}
        ${link('/app/settings', 'Settings')}
        ${link('/app/billing', 'Billing')}
        ${isAdmin ? link('/admin', 'Admin') : ''}
        <form method="post" action="/logout" class="inline-form">
          <input type="hidden" name="_csrf" value="${req.csrf}">
          <button class="link-button" type="submit">Sign out</button>
        </form>
      </nav>
    </div>
  </header>`;
}

function footer(ctx) {
  const c = ctx.config;
  return html`<footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <a class="brand" href="/">${LOGO_SVG}<span>${c.brandName}</span></a>
        <p class="muted small">Uptime, SSL and domain monitoring with client-ready reports. Built for people who look after websites.</p>
      </div>
      <div>
        <h4>Product</h4>
        <a href="/#features">Features</a><a href="/agencies">For agencies</a><a href="/pricing">Pricing</a><a href="/status/demo">Example status page</a>
      </div>
      <div>
        <h4>Free tools</h4>
        <a href="/tools/ssl-checker">SSL checker</a><a href="/tools/domain-expiry-checker">Domain expiry checker</a><a href="/tools/website-down-checker">Is it down?</a>
      </div>
      <div>
        <h4>Company</h4>
        <a href="/blog">Guides</a><a href="mailto:${c.supportEmail}">Contact</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a>
      </div>
    </div>
    <div class="container muted small footer-bottom">© ${new Date().getUTCFullYear()} ${c.companyName}. All rights reserved.</div>
  </footer>`;
}

export function flashMessage(req) {
  if (!req.flash?.message) return '';
  const type = ['success', 'error', 'info'].includes(req.flash.type) ? req.flash.type : 'info';
  return html`<div class="flash flash-${type}" role="status">${req.flash.message}</div>`;
}

export function layout(ctx, req, opts) {
  const c = ctx.config;
  const {
    title,
    description = `${c.brandName} monitors uptime, SSL certificates and domain expiry for every site you manage, and sends clients branded monthly reports.`,
    body,
    canonical = null,
    noindex = false,
    app = false,
    bare = false,
    head = '',
    jsonLd = null,
  } = opts;
  const fullTitle = title ? `${title} · ${c.brandName}` : `${c.brandName} — Uptime, SSL & domain monitoring for agencies`;
  const canonicalUrl = canonical ? `${c.baseUrl}${canonical}` : null;
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  <meta name="description" content="${description}">
  ${noindex || app ? html`<meta name="robots" content="noindex">` : ''}
  ${canonicalUrl ? html`<link rel="canonical" href="${canonicalUrl}">` : ''}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${c.brandName}">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${description}">
  ${canonicalUrl ? html`<meta property="og:url" content="${canonicalUrl}">` : ''}
  <meta name="twitter:card" content="summary">
  <meta name="theme-color" content="#2a78d6">
  <link rel="icon" href="${ctx.asset('favicon.svg')}" type="image/svg+xml">
  <link rel="stylesheet" href="${ctx.asset('styles.css')}">
  <script src="${ctx.asset('app.js')}" defer></script>
  ${jsonLd ? raw(`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`) : ''}
  ${analytics(c)}
  ${head}
</head>
<body class="${app ? 'is-app' : 'is-site'}">
  <a class="skip-link" href="#main">Skip to content</a>
  ${bare ? '' : app ? appNav(ctx, req) : marketingNav(ctx, req)}
  <main id="main">
    ${flashMessage(req)}
    ${body}
  </main>
  ${bare || app ? '' : footer(ctx)}
</body>
</html>`;
}
