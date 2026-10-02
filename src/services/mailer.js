// Email delivery via Resend or Postmark HTTP APIs. In development the "log" provider
// prints emails to the console and keeps them in memory (used by tests too).
export function createMailer(config, { fetchImpl = globalThis.fetch, logger = console } = {}) {
  const { provider, apiKey, from } = config.email;
  const outbox = [];

  async function send({ to, subject, html, text, replyTo, headers = {} }) {
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
    if (!recipients.length) return null;
    const message = { from, to: recipients, subject, html, text, replyTo, headers };

    if (provider === 'log') {
      outbox.push(message);
      if (outbox.length > 500) outbox.shift();
      if (config.env !== 'test') {
        logger.log(`\n[mail] To: ${recipients.join(', ')}\n[mail] Subject: ${subject}\n${text || ''}\n`);
      }
      return { id: `log-${outbox.length}` };
    }

    let url;
    let init;
    if (provider === 'resend') {
      url = 'https://api.resend.com/emails';
      init = {
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: recipients, subject, html, text, reply_to: replyTo, headers }),
      };
    } else if (provider === 'postmark') {
      url = 'https://api.postmarkapp.com/email';
      init = {
        headers: { 'x-postmark-server-token': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          From: from,
          To: recipients.join(','),
          Subject: subject,
          HtmlBody: html,
          TextBody: text,
          ReplyTo: replyTo,
          MessageStream: 'outbound',
          Headers: Object.entries(headers).map(([Name, Value]) => ({ Name, Value })),
        }),
      };
    } else {
      throw new Error(`Unknown EMAIL_PROVIDER "${provider}" (use resend, postmark or log)`);
    }

    const res = await fetchImpl(url, { method: 'POST', ...init, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Email provider error ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json().catch(() => ({}));
  }

  // Never let an email failure break the request or the scheduler.
  async function trySend(message) {
    try {
      return await send(message);
    } catch (err) {
      logger.error(`[mail] failed to send "${message.subject}": ${err.message}`);
      return null;
    }
  }

  return { send, trySend, outbox };
}
