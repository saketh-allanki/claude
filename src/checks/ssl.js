// SSL check: read the certificate a server presents and report its expiry and validity.
import tls from 'node:tls';
import net from 'node:net';
import { safeLookup, assertPublicHost } from '../lib/netguard.js';
import { friendlyError } from '../lib/safehttp.js';

function issuerName(issuer = {}) {
  return issuer.O || issuer.CN || 'Unknown issuer';
}

export function sslCheck(hostname, { port = 443, timeoutMs = 10000, allowPrivate = false } = {}) {
  return new Promise((resolve) => {
    try {
      assertPublicHost(hostname, allowPrivate);
    } catch (err) {
      resolve({ ok: false, error: friendlyError(err) });
      return;
    }
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const socket = tls.connect({
      host: hostname,
      port,
      servername: net.isIP(hostname) ? undefined : hostname,
      rejectUnauthorized: false,
      lookup: safeLookup(allowPrivate),
      ALPNProtocols: ['http/1.1'],
    });
    const timer = setTimeout(() => finish({ ok: false, error: 'Timed out while connecting' }), timeoutMs);
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) {
        finish({ ok: false, error: 'Server did not present a certificate' });
        return;
      }
      const validTo = Date.parse(cert.valid_to);
      const validFrom = Date.parse(cert.valid_from);
      const authError = socket.authorized ? null : socket.authorizationError;
      const errorCode = authError ? String(authError.code || authError) : null;
      finish({
        ok: !authError,
        validTo,
        validFrom,
        issuer: issuerName(cert.issuer),
        subject: cert.subject?.CN || hostname,
        altNames: cert.subjectaltname || '',
        errorCode,
        error: errorCode ? friendlyError({ code: errorCode, message: errorCode }) : null,
      });
    });
    socket.once('error', (err) => finish({ ok: false, error: friendlyError(err) }));
  });
}
