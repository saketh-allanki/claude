// HTTP plumbing: routing, body parsing, cookies, sessions, CSRF, security headers,
// static assets and rate limiting — all on Node's built-in http module.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SafeHtml } from '../lib/html.js';
import { UserError } from '../lib/errors.js';
import { safeEqual } from '../lib/crypto.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const source = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler, opts });
  };
  return {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    match(method, pathname) {
      let allowed = false;
      for (const route of routes) {
        const m = pathname.match(route.regex);
        if (!m) continue;
        if (route.method !== method && !(method === 'HEAD' && route.method === 'GET')) {
          allowed = true;
          continue;
        }
        const params = {};
        route.keys.forEach((k, i) => {
          params[k] = decodeURIComponent(m[i + 1]);
        });
        return { route, params };
      }
      return allowed ? { methodNotAllowed: true } : null;
    },
  };
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

export function formToObject(params) {
  const out = {};
  for (const [key, value] of params) {
    if (key in out) out[key] = [].concat(out[key], value);
    else out[key] = value;
  }
  return out;
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new UserError('Request body too large.', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// In-memory fixed-window rate limiter (single-instance deployment).
export function createRateLimiter() {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset < now) hits.delete(key);
  }, 60_000);
  timer.unref?.();
  return (key, limit, windowMs) => {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    return entry.count <= limit;
  };
}

function loadStatic() {
  const files = new Map();
  if (!fs.existsSync(PUBLIC_DIR)) return files;
  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    const full = path.join(PUBLIC_DIR, name);
    if (!fs.statSync(full).isFile()) continue;
    const body = fs.readFileSync(full);
    const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 10);
    files.set(name, { body, hash, type: MIME[path.extname(name)] || 'application/octet-stream' });
  }
  return files;
}

export function createHttpServer(ctx, router) {
  const { config, auth, logger = console } = ctx;
  const statics = loadStatic();
  ctx.asset = (name) => `/static/${name}?v=${statics.get(name)?.hash || '0'}`;
  const origin = new URL(config.baseUrl).origin;
  const canonicalHost = new URL(config.baseUrl).host.toLowerCase();

  function securityHeaders(res, pathname) {
    const embeddable = pathname.startsWith('/status/') || pathname.startsWith('/badge/');
    const analytics = config.plausibleDomain ? ' https://plausible.io' : '';
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: https:",
        "style-src 'self' 'unsafe-inline'",
        `script-src 'self'${analytics}`,
        `connect-src 'self'${analytics}`,
        "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
        `frame-ancestors ${embeddable ? '*' : "'none'"}`,
        "base-uri 'self'",
        "object-src 'none'",
      ].join('; '),
    );
    if (!embeddable) res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }

  function clientIp(req) {
    if (config.trustProxy) {
      const fwd = req.headers['fly-client-ip'] || req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (fwd) return fwd;
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function serveStatic(req, res, name) {
    const file = statics.get(name);
    if (!file) return false;
    res.writeHead(200, {
      'Content-Type': file.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${file.hash}"`,
    });
    res.end(req.method === 'HEAD' ? undefined : file.body);
    return true;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://internal');
    req.path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    req.query = url.searchParams;
    req.ip = clientIp(req);
    req.cookies = parseCookies(req.headers.cookie);
    res.cookies = [];
    securityHeaders(res, req.path);

    // In production, send visitors on other hostnames (www., *.fly.dev) to the canonical address.
    const host = String(req.headers.host || '').toLowerCase();
    if (config.isProd && host && host !== canonicalHost && (req.method === 'GET' || req.method === 'HEAD') && req.path !== '/healthz' && !net.isIP(host.replace(/:\d+$/, '').replace(/^\[|\]$/g, ''))) {
      res.writeHead(301, { Location: `${config.baseUrl}${req.url}` });
      res.end();
      return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && req.path.startsWith('/static/')) {
      if (serveStatic(req, res, req.path.slice('/static/'.length))) return;
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/favicon.ico') {
      if (serveStatic(req, res, 'favicon.svg')) return;
    }

    const match = router.match(req.method, req.path);
    if (!match) return ctx.views.notFound(req, res);
    if (match.methodNotAllowed) {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method not allowed');
      return;
    }
    const { route, params } = match;

    const session = auth.getSession(req.cookies.sid);
    req.user = session?.user || null;
    req.csrf = session?.csrf || null;
    if (req.cookies.flash) {
      try {
        req.flash = JSON.parse(Buffer.from(req.cookies.flash, 'base64url').toString('utf8'));
      } catch {
        req.flash = null;
      }
      res.cookies.push('flash=; Path=/; Max-Age=0');
    }

    if (req.method === 'POST') {
      req.rawBody = await readBody(req, route.opts.bodyLimit);
      const type = String(req.headers['content-type'] || '');
      req.body = type.includes('application/x-www-form-urlencoded')
        ? formToObject(new URLSearchParams(req.rawBody.toString('utf8')))
        : {};
      if (!route.opts.skipCsrf) {
        const reqOrigin = req.headers.origin;
        if (reqOrigin && reqOrigin !== origin && reqOrigin !== 'null') throw new UserError('Cross-site request blocked.', 403);
        if (req.user && route.opts.csrfToken !== false && !safeEqual(req.body._csrf, req.csrf)) {
          throw new UserError('Your session expired. Please go back, refresh the page and try again.', 403);
        }
      }
    }

    if (route.opts.auth && !req.user) {
      if (req.method === 'GET') return ctx.redirect(res, `/login?next=${encodeURIComponent(req.path + url.search)}`);
      throw new UserError('Please sign in again.', 401);
    }
    if (route.opts.admin && !(req.user && config.adminEmails.includes(req.user.email.toLowerCase()))) {
      return ctx.views.notFound(req, res);
    }
    await route.handler(req, res, params);
  }

  const server = http.createServer(async (req, res) => {
    const start = Date.now();
    try {
      await handle(req, res);
    } catch (err) {
      if (res.headersSent) {
        res.end();
      } else if (err instanceof UserError) {
        ctx.views.errorPage(req, res, err.status, err.message);
      } else {
        logger.error(`[http] ${req.method} ${req.url} failed: ${err.stack || err.message}`);
        ctx.views.errorPage(req, res, 500, 'Something went wrong on our side. Please try again in a moment.');
      }
    } finally {
      if (!config.isProd && config.env !== 'test') logger.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
    }
  });
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  return server;
}

// ---- response helpers --------------------------------------------------------

function withCookies(res, headers = {}) {
  if (res.cookies?.length) headers['Set-Cookie'] = res.cookies;
  return headers;
}

export function sendHtml(res, status, body, extra = {}) {
  const text = body instanceof SafeHtml ? body.value : String(body);
  res.writeHead(status, withCookies(res, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra }));
  res.end(text);
}

export function sendText(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, withCookies(res, { 'Content-Type': type, ...extra }));
  res.end(body);
}

export function sendJson(res, status, data) {
  sendText(res, status, JSON.stringify(data), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
}

export function redirect(res, location, status = 303) {
  res.writeHead(status, withCookies(res, { Location: location }));
  res.end();
}

export function setFlash(res, type, message) {
  const value = Buffer.from(JSON.stringify({ type, message })).toString('base64url');
  res.cookies.push(`flash=${value}; Path=/; Max-Age=60; SameSite=Lax; HttpOnly`);
}
