import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { httpCheck } from '../src/checks/http.js';
import { sslCheck } from '../src/checks/ssl.js';
import { createDomainChecker } from '../src/checks/domain.js';
import { postJson } from '../src/lib/safehttp.js';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

test('http check: success, errors, keywords, redirects, timeouts and SSRF guard', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/ok') return res.end('<h1>Welcome to the shop</h1>');
    if (req.url === '/error') {
      res.statusCode = 503;
      return res.end('down');
    }
    if (req.url === '/redirect') {
      res.writeHead(301, { location: '/ok' });
      return res.end();
    }
    if (req.url === '/loop') {
      res.writeHead(302, { location: '/loop' });
      return res.end();
    }
    if (req.url === '/slow') return setTimeout(() => res.end('late'), 2000);
    if (req.url === '/hook' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        server.lastHook = JSON.parse(body);
        res.end('ok');
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  const port = await listen(server);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${port}`;
  const opts = { allowPrivate: true, timeoutMs: 1000 };

  const ok = await httpCheck(`${base}/ok`, opts);
  assert.equal(ok.ok, true);
  assert.equal(ok.code, 200);
  assert.ok(ok.ms >= 0);

  assert.equal((await httpCheck(`${base}/ok`, { ...opts, keyword: 'welcome' })).ok, true);
  const missing = await httpCheck(`${base}/ok`, { ...opts, keyword: 'checkout' });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Keyword "checkout" not found/);

  const err = await httpCheck(`${base}/error`, opts);
  assert.equal(err.ok, false);
  assert.equal(err.code, 503);
  assert.equal(err.error, 'HTTP 503');

  assert.equal((await httpCheck(`${base}/redirect`, opts)).ok, true);
  assert.match((await httpCheck(`${base}/loop`, opts)).error, /Too many redirects/);
  assert.match((await httpCheck(`${base}/slow`, { ...opts, timeoutMs: 200 })).error, /Timed out/);

  const blocked = await httpCheck(`${base}/ok`, { timeoutMs: 1000 });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /private network/);

  const refused = await httpCheck('http://127.0.0.1:1/', opts);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /refused/i);

  await postJson(`${base}/hook`, { hello: 'world' }, { allowPrivate: true });
  assert.deepEqual(server.lastHook, { hello: 'world' });
  await assert.rejects(postJson(`${base}/hook`, {}, {}), /private/);
});

test('ssl check reads certificate expiry and trust problems', async (t) => {
  let tmp;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-cert-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem'), '-days', '30', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  } catch {
    t.skip('openssl not available');
    return;
  }
  const server = https.createServer({ key: fs.readFileSync(path.join(tmp, 'key.pem')), cert: fs.readFileSync(path.join(tmp, 'cert.pem')) }, (req, res) => res.end('ok'));
  const port = await listen(server);
  t.after(() => server.close());
  const result = await sslCheck('localhost', { port, allowPrivate: true });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'DEPTH_ZERO_SELF_SIGNED_CERT');
  assert.match(result.error, /self-signed/);
  const days = (result.validTo - Date.now()) / 86400_000;
  assert.ok(days > 28 && days <= 30, `expected ~30 days, got ${days}`);

  const blocked = await sslCheck('127.0.0.1', { port });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /private/);

  const httpsCheck = await httpCheck(`https://localhost:${port}/`, { allowPrivate: true, timeoutMs: 2000 });
  assert.equal(httpsCheck.ok, false);
  assert.match(httpsCheck.error, /self-signed/);
});

test('domain checker uses the IANA bootstrap and caches results', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('iana.org')) {
      return new Response(JSON.stringify({ services: [[['com', 'net'], ['https://rdap.example-registry.test/']]] }), { status: 200 });
    }
    if (String(url).endsWith('/domain/missing.com')) return new Response('{}', { status: 404 });
    return new Response(
      JSON.stringify({ events: [{ eventAction: 'expiration', eventDate: '2027-01-02T00:00:00Z' }], entities: [] }),
      { status: 200 },
    );
  };
  const checker = createDomainChecker({ fetchImpl });
  const r = await checker.check('www.shop.example.com');
  assert.equal(r.ok, true);
  assert.equal(r.domain, 'example.com');
  assert.equal(r.expiresAt, Date.parse('2027-01-02T00:00:00Z'));
  assert.equal(calls.at(-1), 'https://rdap.example-registry.test/domain/example.com');
  const before = calls.length;
  await checker.check('example.com');
  assert.equal(calls.length, before, 'second lookup should be cached');

  const unsupported = await checker.check('example.zz');
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.unsupported, true);
  const missing = await checker.check('missing.com');
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not found/);
});
