import test from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, escapeHtml, safeUrl } from '../src/lib/html.js';
import { renderMarkdown, parseFrontMatter } from '../src/lib/markdown.js';
import { isPrivateAddress } from '../src/lib/netguard.js';
import { formatDuration, formatPercent, previousMonthRange, daysUntil, DAY } from '../src/lib/format.js';
import { formEncode, signStripePayload, verifyStripeSignature } from '../src/services/billing.js';
import { expiryBucket } from '../src/services/scheduler.js';
import { registrableDomain, parseRdap } from '../src/checks/domain.js';
import { normalizeUrl, slugify } from '../src/services/monitors.js';
import { SSL_THRESHOLDS, DOMAIN_THRESHOLDS } from '../src/config.js';
import { chartWindowHours, responseChart } from '../src/views/components.js';

test('html escapes interpolations but not raw()', () => {
  const name = '<script>alert("x")</script>';
  assert.equal(String(html`<p>${name}</p>`), '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>');
  assert.equal(String(html`<p>${raw('<b>ok</b>')}</p>`), '<p><b>ok</b></p>');
  assert.equal(String(html`${['a', html`<i>b</i>`]}`), 'a<i>b</i>');
  assert.equal(String(html`${null}${false}${undefined}`), '');
  assert.equal(escapeHtml("'"), '&#39;');
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
});

test('markdown renders common elements safely', () => {
  const { meta, body } = parseFrontMatter('---\ntitle: "Hello"\ndate: 2026-01-01\n---\n# Hi\n');
  assert.equal(meta.title, 'Hello');
  assert.equal(body, '# Hi\n');
  const { html: out, toc } = renderMarkdown(
    '## Section one\n\nSome **bold** and *em* and `code` and [link](https://x.com).\n\n- a\n- b\n\n1. one\n2. two\n\n> quote\n\n```\n<tag>\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<script>bad()</script>\n\n[x](javascript:alert(1))',
  );
  assert.match(out, /<h2 id="section-one">Section one<\/h2>/);
  assert.match(out, /<strong>bold<\/strong>/);
  assert.match(out, /<em>em<\/em>/);
  assert.match(out, /<code>code<\/code>/);
  assert.match(out, /<a href="https:\/\/x.com" rel="noopener">link<\/a>/);
  assert.match(out, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(out, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(out, /<blockquote>/);
  assert.match(out, /&lt;tag&gt;/);
  assert.match(out, /<td>1<\/td><td>2<\/td>/);
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /<a href="#">x<\/a>/);
  assert.deepEqual(toc, [{ id: 'section-one', text: 'Section one' }]);
});

test('private and reserved addresses are detected', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', 'not-an-ip']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('format helpers', () => {
  assert.equal(formatDuration(45_000), '45s');
  assert.equal(formatDuration(5 * 60_000), '5m');
  assert.equal(formatDuration(2 * 3600_000 + 14 * 60_000), '2h 14m');
  assert.equal(formatDuration(3 * DAY + 2 * 3600_000), '3d 2h');
  assert.equal(formatPercent(99.987), '99.99%');
  assert.equal(formatPercent(100), '100%');
  assert.equal(formatPercent(null), '—');
  const { start, end } = previousMonthRange(Date.UTC(2026, 2, 15));
  assert.equal(new Date(start).toISOString(), '2026-02-01T00:00:00.000Z');
  assert.equal(new Date(end).toISOString(), '2026-03-01T00:00:00.000Z');
  const jan = previousMonthRange(Date.UTC(2026, 0, 3));
  assert.equal(new Date(jan.start).toISOString(), '2025-12-01T00:00:00.000Z');
  assert.equal(daysUntil(Date.now() + 10.5 * DAY), 10);
});

test('stripe form encoding handles nested objects and arrays', () => {
  const pairs = formEncode({ mode: 'subscription', line_items: [{ price: 'p_1', quantity: 1 }], subscription_data: { metadata: { user_id: '7' }, trial_period_days: undefined }, expand: ['a', 'b'] });
  assert.deepEqual(pairs, [
    ['mode', 'subscription'],
    ['line_items[0][price]', 'p_1'],
    ['line_items[0][quantity]', '1'],
    ['subscription_data[metadata][user_id]', '7'],
    ['expand[0]', 'a'],
    ['expand[1]', 'b'],
  ]);
});

test('stripe webhook signatures are verified', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'x' });
  const header = signStripePayload(payload, 'whsec_test');
  assert.equal(verifyStripeSignature(payload, header, 'whsec_test').id, 'evt_1');
  assert.throws(() => verifyStripeSignature(payload, header, 'whsec_other'), /mismatch/);
  assert.throws(() => verifyStripeSignature(payload + ' ', header, 'whsec_test'), /mismatch/);
  const old = signStripePayload(payload, 'whsec_test', Math.floor(Date.now() / 1000) - 3600);
  assert.throws(() => verifyStripeSignature(payload, old, 'whsec_test'), /tolerance/);
  assert.throws(() => verifyStripeSignature(payload, '', 'whsec_test'), /Missing/);
});

test('expiry buckets pick the most urgent threshold crossed', () => {
  assert.equal(expiryBucket(60, SSL_THRESHOLDS), null);
  assert.equal(expiryBucket(14, SSL_THRESHOLDS), 14);
  assert.equal(expiryBucket(10, SSL_THRESHOLDS), 14);
  assert.equal(expiryBucket(7, SSL_THRESHOLDS), 7);
  assert.equal(expiryBucket(2, SSL_THRESHOLDS), 3);
  assert.equal(expiryBucket(0, SSL_THRESHOLDS), 1);
  assert.equal(expiryBucket(-1, SSL_THRESHOLDS), 0);
  assert.equal(expiryBucket(25, DOMAIN_THRESHOLDS), 30);
});

test('registrable domain and RDAP parsing', () => {
  assert.equal(registrableDomain('www.example.com'), 'example.com');
  assert.equal(registrableDomain('shop.example.co.uk'), 'example.co.uk');
  assert.equal(registrableDomain('a.b.c.example.com.au'), 'example.com.au');
  assert.equal(registrableDomain('Example.ORG.'), 'example.org');
  const parsed = parseRdap({
    events: [
      { eventAction: 'registration', eventDate: '2010-05-01T00:00:00Z' },
      { eventAction: 'expiration', eventDate: '2027-05-01T00:00:00Z' },
    ],
    entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'Example Registrar, Inc.']]] }],
  });
  assert.equal(parsed.expiresAt, Date.parse('2027-05-01T00:00:00Z'));
  assert.equal(parsed.registeredAt, Date.parse('2010-05-01T00:00:00Z'));
  assert.equal(parsed.registrar, 'Example Registrar, Inc.');
});

test('URLs are normalised and unsafe targets rejected', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeUrl(' http://Example.com/path#frag '), 'http://example.com/path');
  assert.throws(() => normalizeUrl(''), /enter a website/);
  assert.throws(() => normalizeUrl('ftp://example.com'), /http/);
  assert.throws(() => normalizeUrl('http://localhost:3000'), /public website/);
  assert.throws(() => normalizeUrl('http://127.0.0.1'), /Private/);
  assert.throws(() => normalizeUrl('http://169.254.169.254/latest'), /Private/);
  assert.throws(() => normalizeUrl('http://[::1]/'), /Private/);
  assert.throws(() => normalizeUrl('https://user:pass@example.com'), /credentials/);
  assert.throws(() => normalizeUrl('http://printer.local'), /public website/);
  assert.equal(normalizeUrl('http://localhost:3000', { allowPrivate: true }), 'http://localhost:3000/');
  assert.equal(slugify('Bright Smile Dental!'), 'bright-smile-dental');
});

test('response chart window shrinks for new sites and labels ticks sensibly', () => {
  const now = Date.now();
  assert.equal(chartWindowHours(now - 5 * 60_000, now), 1);
  assert.equal(chartWindowHours(now - 2 * 3600_000, now), 3);
  assert.equal(chartWindowHours(now - 10 * 3600_000, now), 12);
  assert.equal(chartWindowHours(now - 30 * 3600_000, now), 24);
  const points = [{ at: now - 120_000, ok: 1, ms: 120 }, { at: now - 60_000, ok: 0, ms: null }];
  const hour = String(responseChart(points, { hours: 1, now }));
  for (const label of ['1h ago', '45m ago', '30m ago', '15m ago', 'now']) assert.ok(hour.includes(`>${label}<`), label);
  const day = String(responseChart(points, { hours: 24, now }));
  for (const label of ['24h ago', '18h ago', '12h ago', '6h ago']) assert.ok(day.includes(`>${label}<`), label);
  assert.match(String(responseChart([], { hours: 1, now })), /No checks in the last hour yet/);
});
