// Public routes: marketing pages, free tools, guides, legal, SEO files, status pages and badges.
import { sendHtml, sendText } from '../http/server.js';
import { homePage, agenciesPage, pricingPage, unsubscribedPage } from '../views/site.js';
import { toolsIndexPage, toolPage, blogIndexPage, blogPostPage, legalPage, termsContent, privacyContent, toolList } from '../views/content.js';
import { statusPage, badgeSvg } from '../views/status.js';
import { normalizeUrl } from '../services/monitors.js';
import { registrableDomain } from '../checks/domain.js';
import { UserError } from '../lib/errors.js';
import { DAY, utcDay } from '../lib/format.js';

function cleanDomain(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return '';
  let host;
  try {
    host = value.includes('://') ? new URL(value).hostname : value.split('/')[0].split(':')[0];
  } catch {
    throw new UserError('Please enter a domain name like example.com.');
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || host.length > 253) throw new UserError('Please enter a domain name like example.com.');
  return host;
}

// Deterministic sample data for the public demo status page.
function demoPage(ctx) {
  const now = Date.now();
  const names = [
    ['Website', 'brightsmile-dental.example'],
    ['Online booking', 'book.brightsmile-dental.example'],
    ['Patient portal', 'portal.brightsmile-dental.example'],
  ];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const monitors = names.map(([name, host], idx) => {
    const bars = [];
    for (let i = 89; i >= 0; i--) {
      const r = rand();
      const uptime = r > 0.97 ? 97 + rand() * 2.5 : r > 0.93 ? 99.2 + rand() * 0.6 : 100;
      bars.push({ day: utcDay(now - i * DAY), checks: 1440, uptime: idx === 2 && i > 60 ? null : uptime });
    }
    const valid = bars.filter((b) => b.uptime != null);
    return {
      name,
      url: `https://${host}`,
      status: 'up',
      paused: 0,
      bars,
      uptime90: valid.reduce((a, b) => a + b.uptime, 0) / valid.length,
    };
  });
  return {
    page: { title: 'Bright Smile Dental (demo)', slug: 'demo' },
    monitors,
    brand: { name: 'Your Agency', color: null, logoUrl: null, whiteLabel: false },
    incidents: [{ monitor_name: 'Online booking', started_at: now - 3 * DAY - 7200_000, resolved_at: now - 3 * DAY - 6000_000 }],
  };
}

export function registerSiteRoutes(router, ctx) {
  const { config, monitors: svc, accounts, reports, db, auth, checks, rateLimit } = ctx;

  router.get('/', (req, res) => sendHtml(res, 200, homePage(ctx, req)));
  router.get('/agencies', (req, res) => sendHtml(res, 200, agenciesPage(ctx, req)));
  router.get('/pricing', (req, res) => sendHtml(res, 200, pricingPage(ctx, req)));
  router.get('/healthz', (req, res) => {
    db.get('SELECT 1');
    sendText(res, 200, 'ok');
  });
  router.get('/bot', (req, res) =>
    sendText(res, 200, `${config.brandName}Bot checks websites on behalf of their owners for uptime monitoring.\nIt makes one GET request per check interval. Contact: ${config.supportEmail}\n`),
  );

  // ---- Free tools ----------------------------------------------------------
  router.get('/tools', (req, res) => sendHtml(res, 200, toolsIndexPage(ctx, req)));
  router.get('/tools/:slug', async (req, res, { slug }) => {
    const tool = toolList.find((t) => t.slug === slug);
    if (!tool) return ctx.views.notFound(req, res);
    const raw = String(req.query.get(tool.field) || '').trim().slice(0, 300);
    if (!raw) return sendHtml(res, 200, toolPage(ctx, req, { slug }));
    if (!rateLimit(`tool:${req.ip}`, 20, 10 * 60_000)) {
      return sendHtml(res, 429, toolPage(ctx, req, { slug, input: raw, error: 'Too many checks from your network. Please wait a few minutes.' }));
    }
    try {
      let result;
      let input = raw;
      if (slug === 'ssl-checker') {
        input = cleanDomain(raw);
        result = await checks.ssl(input, { allowPrivate: config.allowPrivateTargets });
      } else if (slug === 'domain-expiry-checker') {
        input = registrableDomain(cleanDomain(raw));
        result = await checks.domain(input);
      } else {
        input = normalizeUrl(raw, { allowPrivate: config.allowPrivateTargets });
        result = await checks.http(input, { timeoutMs: 15000, allowPrivate: config.allowPrivateTargets });
      }
      sendHtml(res, 200, toolPage(ctx, req, { slug, input, result }));
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      sendHtml(res, 400, toolPage(ctx, req, { slug, input: raw, error: err.message }));
    }
  });

  // ---- Guides & legal --------------------------------------------------------
  router.get('/blog', (req, res) => sendHtml(res, 200, blogIndexPage(ctx, req, ctx.content.posts)));
  router.get('/blog/:slug', (req, res, { slug }) => {
    const post = ctx.content.posts.find((p) => p.slug === slug);
    if (!post) return ctx.views.notFound(req, res);
    sendHtml(res, 200, blogPostPage(ctx, req, post));
  });
  router.get('/terms', (req, res) => sendHtml(res, 200, legalPage(ctx, req, { title: 'Terms of Service', html: termsContent(ctx), canonical: '/terms' })));
  router.get('/privacy', (req, res) => sendHtml(res, 200, legalPage(ctx, req, { title: 'Privacy Policy', html: privacyContent(ctx), canonical: '/privacy' })));

  router.get('/robots.txt', (req, res) =>
    sendText(res, 200, `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /auth\n\nSitemap: ${config.baseUrl}/sitemap.xml\n`),
  );
  router.get('/sitemap.xml', (req, res) => {
    const paths = ['/', '/agencies', '/pricing', '/tools', ...toolList.map((t) => `/tools/${t.slug}`), '/blog', ...ctx.content.posts.map((p) => `/blog/${p.slug}`), '/signup', '/terms', '/privacy'];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
      .map((p) => `  <url><loc>${config.baseUrl}${p}</loc></url>`)
      .join('\n')}\n</urlset>\n`;
    sendText(res, 200, xml, 'application/xml; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
  });

  router.get('/unsubscribe', (req, res) => {
    const userId = Number(req.query.get('u'));
    if (userId && auth.verifyUnsubscribe(userId, req.query.get('s'))) {
      db.run('UPDATE users SET marketing_opt_out = 1 WHERE id = ?', userId);
    }
    sendHtml(res, 200, unsubscribedPage(ctx, req));
  });
  // One-click unsubscribe (RFC 8058) posts to the same address.
  router.post(
    '/unsubscribe',
    (req, res) => {
      const userId = Number(req.query.get('u'));
      if (userId && auth.verifyUnsubscribe(userId, req.query.get('s'))) {
        db.run('UPDATE users SET marketing_opt_out = 1 WHERE id = ?', userId);
      }
      sendText(res, 200, 'Unsubscribed');
    },
    { skipCsrf: true },
  );

  // ---- Public status pages -------------------------------------------------------
  router.get('/status/:slug', (req, res, { slug }) => {
    if (slug === 'demo') return sendHtml(res, 200, statusPage(ctx, req, demoPage(ctx)), { 'Cache-Control': 'public, max-age=60' });
    const page = svc.pageBySlug(slug);
    if (!page) return ctx.views.notFound(req, res);
    const owner = accounts.findUser(page.user_id);
    const now = Date.now();
    const list = svc.pageMonitors(page.id).map((m) => {
      const bars = svc.dailyBars(m.id, 90, now);
      return { ...m, bars, uptime90: svc.uptimeBetween(m.id, now - 89 * DAY, now + DAY).uptime };
    });
    const incidents = db.all(
      `SELECT i.*, m.name AS monitor_name FROM incidents i JOIN monitors m ON m.id = i.monitor_id
       WHERE m.page_id = ? AND i.started_at > ? ORDER BY i.started_at DESC LIMIT 20`,
      page.id,
      now - 14 * DAY,
    );
    sendHtml(res, 200, statusPage(ctx, req, { page, monitors: list, brand: reports.brandFor(owner), incidents }), {
      'Cache-Control': 'public, max-age=30',
    });
  });

  router.get('/badge/:slug.svg', (req, res, { slug }) => {
    let message = 'unknown';
    let color = '#898781';
    if (slug === 'demo') {
      message = 'operational';
      color = '#0a8a0a';
    } else {
      const page = svc.pageBySlug(slug);
      if (page) {
        const list = svc.pageMonitors(page.id).filter((m) => !m.paused);
        const down = list.filter((m) => m.status === 'down').length;
        if (!list.length) message = 'no data';
        else if (!down) {
          message = 'operational';
          color = '#0a8a0a';
        } else {
          message = down === list.length ? 'down' : 'degraded';
          color = down === list.length ? '#c23030' : '#b26b00';
        }
      }
    }
    sendText(res, 200, badgeSvg({ label: 'status', message, color }), 'image/svg+xml; charset=utf-8', { 'Cache-Control': 'public, max-age=60' });
  });
}
