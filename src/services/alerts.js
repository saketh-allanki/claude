// Delivers monitor events (down, recovered, SSL/domain expiring) to every channel a user has set up.
import { alertEmail, describeEvent } from './emails.js';
import { postJson } from '../lib/safehttp.js';

export function createAlerter({ db, config, mailer, accounts, logger = console }) {
  const allowPrivate = config.allowPrivateTargets;

  function chatText(monitor, event) {
    const copy = describeEvent(monitor, event);
    return `${copy.emoji} ${copy.text}\n${config.baseUrl}/app/monitors/${monitor.id}`;
  }

  async function deliver(channel, monitor, event) {
    switch (channel.type) {
      case 'email': {
        const msg = alertEmail({ config, monitor, event });
        await mailer.send({ to: channel.target, ...msg });
        return;
      }
      case 'slack':
        await postJson(channel.target, { text: chatText(monitor, event) }, { allowPrivate, timeoutMs: 10000 });
        return;
      case 'discord':
        await postJson(channel.target, { content: chatText(monitor, event).slice(0, 1900) }, { allowPrivate, timeoutMs: 10000 });
        return;
      case 'webhook':
        await postJson(
          channel.target,
          {
            event: event.kind,
            message: describeEvent(monitor, event).text,
            at: new Date(event.at || Date.now()).toISOString(),
            monitor: { id: monitor.id, name: monitor.name, url: monitor.url },
            details: {
              error: event.error ?? null,
              downtimeSeconds: event.downtimeMs != null ? Math.round(event.downtimeMs / 1000) : null,
              daysLeft: event.daysLeft ?? null,
              expiresAt: event.expiresAt ? new Date(event.expiresAt).toISOString() : null,
            },
          },
          { allowPrivate, timeoutMs: 10000, userAgent: `${config.brandName}-Webhook/1.0` },
        );
        return;
      default:
        throw new Error(`Unknown channel type ${channel.type}`);
    }
  }

  async function notify(monitor, event) {
    const user = accounts.findUser(monitor.user_id);
    if (!user) return;
    const plan = accounts.planOf(user);
    const at = event.at || Date.now();
    db.run(
      'INSERT INTO alert_log (user_id, monitor_id, kind, message, at) VALUES (?, ?, ?, ?, ?)',
      user.id,
      monitor.id,
      event.kind,
      describeEvent(monitor, event).text,
      at,
    );
    const channels = [
      { type: 'email', target: user.email },
      ...db.all('SELECT * FROM channels WHERE user_id = ?', user.id).filter((c) => plan.channels.includes(c.type)),
    ];
    const seen = new Set();
    await Promise.all(
      channels.map(async (channel) => {
        const key = `${channel.type}:${channel.target.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        try {
          await deliver(channel, monitor, { ...event, at });
        } catch (err) {
          logger.error(`[alert] ${channel.type} delivery failed for monitor ${monitor.id}: ${err.message}`);
        }
      }),
    );
  }

  async function sendTest(channel, user) {
    const fake = { id: 0, user_id: user.id, name: 'Test alert', url: `${config.baseUrl}` };
    await deliver(channel, fake, { kind: 'test', at: Date.now() });
  }

  return { notify, sendTest, deliver };
}
