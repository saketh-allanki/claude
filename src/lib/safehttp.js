// Minimal HTTP client with SSRF protection, redirect following and hard timeouts.
import http from 'node:http';
import https from 'node:https';
import { safeLookup, assertPublicHost } from './netguard.js';

const MAX_BODY = 1024 * 1024;

const FRIENDLY_ERRORS = {
  ENOTFOUND: 'DNS lookup failed (domain not found)',
  EAI_AGAIN: 'DNS lookup timed out',
  ECONNREFUSED: 'Connection refused',
  ECONNRESET: 'Connection reset by server',
  EHOSTUNREACH: 'Host unreachable',
  ENETUNREACH: 'Network unreachable',
  ETIMEDOUT: 'Connection timed out',
  EPRIVATE: 'URL points to a private network address',
  CERT_HAS_EXPIRED: 'SSL certificate has expired',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'SSL certificate is self-signed',
  SELF_SIGNED_CERT_IN_CHAIN: 'SSL certificate chain contains a self-signed certificate',
  ERR_TLS_CERT_ALTNAME_INVALID: 'SSL certificate does not match the domain',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'SSL certificate chain is incomplete',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'SSL certificate issuer is not trusted',
  CERT_NOT_YET_VALID: 'SSL certificate is not valid yet',
  HPE_INVALID_CONSTANT: 'Server sent an invalid HTTP response',
};

export function friendlyError(err) {
  if (!err) return 'Unknown error';
  return FRIENDLY_ERRORS[err.code] || err.message || String(err);
}

function requestOnce(url, { method, headers, body, timeoutMs, allowPrivate, readBody }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      reject(new Error('Only http and https URLs are supported'));
      return;
    }
    try {
      assertPublicHost(u.hostname, allowPrivate);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      u,
      { method, headers, agent: false, lookup: safeLookup(allowPrivate) },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          if (!readBody) return;
          size += chunk.length;
          if (size <= MAX_BODY) chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    const timer = setTimeout(() => {
      const err = new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`);
      err.code = 'TIMEOUT';
      req.destroy(err);
    }, timeoutMs);
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on('close', () => clearTimeout(timer));
    if (body) req.write(body);
    req.end();
  });
}

export async function request(url, opts = {}) {
  const options = {
    method: opts.method || 'GET',
    headers: { 'user-agent': opts.userAgent || 'SitewardenBot/1.0', accept: '*/*', ...(opts.headers || {}) },
    body: opts.body,
    timeoutMs: opts.timeoutMs || 15000,
    allowPrivate: Boolean(opts.allowPrivate),
    readBody: opts.readBody !== false,
  };
  if (options.body && !options.headers['content-length']) {
    options.headers['content-length'] = Buffer.byteLength(options.body);
  }
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = url;
  for (let hop = 0; ; hop++) {
    const res = await requestOnce(current, options);
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location && options.method === 'GET') {
      if (hop >= maxRedirects) throw new Error(`Too many redirects (more than ${maxRedirects})`);
      current = new URL(res.headers.location, current).toString();
      continue;
    }
    return { ...res, url: current };
  }
}

export async function postJson(url, payload, opts = {}) {
  const res = await request(url, {
    ...opts,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: JSON.stringify(payload),
    maxRedirects: 0,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Webhook responded with HTTP ${res.status}`);
  }
  return res;
}
