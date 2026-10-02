// Domain expiry check using RDAP (the modern, JSON successor to WHOIS).
// The IANA bootstrap file tells us which registry server is authoritative for each TLD.
const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const BOOTSTRAP_TTL = 24 * 3600_000;
const RESULT_TTL = 12 * 3600_000;

// Common multi-label public suffixes so that www.shop.co.uk resolves to shop.co.uk.
const MULTI_LABEL_SUFFIXES = new Set(
  `co.uk org.uk me.uk ltd.uk plc.uk net.uk ac.uk gov.uk sch.uk
  com.au net.au org.au edu.au gov.au asn.au id.au
  co.nz net.nz org.nz govt.nz ac.nz
  co.za org.za web.za net.za
  com.br net.br org.br gov.br
  co.in net.in org.in firm.in gen.in ind.in
  co.jp ne.jp or.jp ac.jp go.jp
  com.mx org.mx gob.mx
  com.ar com.co com.pe com.ve com.ec com.uy com.py com.bo
  com.cn net.cn org.cn com.hk com.tw com.sg com.my com.ph com.pk com.bd com.vn
  co.kr or.kr co.id co.th in.th
  com.tr com.eg com.sa com.ng com.gh co.ke co.tz co.ug
  co.il org.il ac.il
  com.ua com.pl net.pl org.pl com.es com.pt com.gr com.cy com.mt`.split(/\s+/),
);

export function registrableDomain(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '');
  const labels = host.split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return MULTI_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

export function parseRdap(data) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const expiration = events.find((e) => /expiration/i.test(e.eventAction || ''));
  const registration = events.find((e) => /^registration$/i.test(e.eventAction || ''));
  let registrar = null;
  for (const entity of data?.entities || []) {
    if (!(entity.roles || []).includes('registrar')) continue;
    const fn = (entity.vcardArray?.[1] || []).find((field) => field[0] === 'fn');
    registrar = fn?.[3] || entity.handle || null;
    break;
  }
  return {
    expiresAt: expiration ? Date.parse(expiration.eventDate) || null : null,
    registeredAt: registration ? Date.parse(registration.eventDate) || null : null,
    registrar,
  };
}

export function createDomainChecker({ fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  let bootstrap = null;
  let bootstrapAt = 0;
  const cache = new Map();

  async function getJson(url) {
    const res = await fetchImpl(url, {
      headers: { accept: 'application/rdap+json, application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) {
      const err = new Error('Domain not found in registry');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (!res.ok) throw new Error(`Registry responded with HTTP ${res.status}`);
    return res.json();
  }

  async function serverFor(tld) {
    if (!bootstrap || Date.now() - bootstrapAt > BOOTSTRAP_TTL) {
      bootstrap = await getJson(BOOTSTRAP_URL);
      bootstrapAt = Date.now();
    }
    for (const [tlds, urls] of bootstrap.services || []) {
      if (tlds.includes(tld)) return urls.find((u) => u.startsWith('https://')) || urls[0];
    }
    return null;
  }

  async function check(hostname) {
    const domain = registrableDomain(hostname);
    const cached = cache.get(domain);
    if (cached && Date.now() - cached.at < cached.ttl) return cached.result;
    let result;
    try {
      const tld = domain.split('.').pop();
      const server = await serverFor(tld);
      if (!server) {
        result = { domain, ok: false, unsupported: true, error: `Expiry lookups are not available for .${tld} domains` };
      } else {
        const base = server.endsWith('/') ? server : `${server}/`;
        const parsed = parseRdap(await getJson(`${base}domain/${encodeURIComponent(domain)}`));
        result = parsed.expiresAt
          ? { domain, ok: true, ...parsed }
          : { domain, ok: false, unsupported: true, ...parsed, error: 'Registry does not publish an expiry date' };
      }
    } catch (err) {
      result = { domain, ok: false, error: err.code === 'NOT_FOUND' ? err.message : `Lookup failed: ${err.message}` };
    }
    // Transient failures are retried sooner than successful lookups.
    const ttl = result.ok || result.unsupported ? RESULT_TTL : 3600_000;
    cache.set(domain, { at: Date.now(), ttl, result });
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
    return result;
  }

  return { check, registrableDomain };
}
