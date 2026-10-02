// Passwordless sign-in with emailed magic links, plus cookie sessions.
// No passwords means no password resets, no breached-password support tickets.
import { randomToken, sha256, hmac, safeEqual } from '../lib/crypto.js';
import { UserError } from '../lib/errors.js';
import { DAY } from '../lib/format.js';
import { loginEmail, welcomeEmail } from './emails.js';

const TOKEN_TTL = 20 * 60_000;
const SESSION_TTL = 30 * DAY;
export const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,253}\.[^@\s]{2,}$/;

export function createAuth(ctx) {
  const { db, config, mailer, accounts } = ctx;

  async function requestLogin(rawEmail, { pendingUrl = null, now = Date.now() } = {}) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) throw new UserError('Please enter a valid email address.');
    const token = randomToken();
    db.run(
      'INSERT INTO login_tokens (token_hash, email, pending_url, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      sha256(token),
      email,
      pendingUrl,
      now,
      now + TOKEN_TTL,
    );
    const link = `${config.baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
    const msg = loginEmail({ config, link });
    await mailer.send({ to: email, ...msg });
    return { email, token };
  }

  // Exchanges a magic-link token for a user, creating the account on first sign-in.
  function consumeLogin(token, now = Date.now()) {
    return db.tx(() => {
      const row = db.get('SELECT * FROM login_tokens WHERE token_hash = ?', sha256(String(token || '')));
      if (!row || row.used_at || row.expires_at < now) return null;
      db.run('UPDATE login_tokens SET used_at = ? WHERE token_hash = ?', now, row.token_hash);
      let user = accounts.findByEmail(row.email);
      const isNew = !user;
      if (!user) user = accounts.createUser(row.email, now);
      db.run('UPDATE users SET last_login_at = ? WHERE id = ?', now, user.id);
      return { user: accounts.findUser(user.id), isNew, pendingUrl: row.pending_url };
    });
  }

  async function sendWelcome(user, monitorUrl) {
    if (!accounts.markEvent(user.id, 'email:welcome')) return;
    const msg = welcomeEmail({ config, user, monitorUrl });
    await mailer.trySend({ to: user.email, subject: msg.subject, html: msg.html, text: msg.text, replyTo: config.supportEmail });
  }

  function createSession(userId, now = Date.now()) {
    const id = randomToken();
    const csrf = randomToken(18);
    db.run('INSERT INTO sessions (id_hash, user_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', sha256(id), userId, csrf, now, now + SESSION_TTL);
    return { id, csrf };
  }

  function getSession(id, now = Date.now()) {
    if (!id) return null;
    const session = db.get('SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?', sha256(id), now);
    if (!session) return null;
    const user = accounts.findUser(session.user_id);
    if (!user) return null;
    return { user, csrf: session.csrf, idHash: session.id_hash };
  }

  function destroySession(id) {
    if (id) db.run('DELETE FROM sessions WHERE id_hash = ?', sha256(id));
  }

  const sessionCookie = (value, maxAgeSec) =>
    `sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${config.secureCookies ? '; Secure' : ''}`;

  // Signed links let people unsubscribe from marketing emails without signing in.
  const unsubscribeSig = (userId) => hmac(config.sessionSecret, `unsubscribe:${userId}`).slice(0, 32);
  const unsubscribeUrl = (user) => `${config.baseUrl}/unsubscribe?u=${user.id}&s=${unsubscribeSig(user.id)}`;
  const verifyUnsubscribe = (userId, sig) => safeEqual(unsubscribeSig(userId), sig);

  return {
    requestLogin,
    consumeLogin,
    sendWelcome,
    createSession,
    getSession,
    destroySession,
    sessionCookie,
    unsubscribeUrl,
    verifyUnsubscribe,
    SESSION_TTL,
  };
}
