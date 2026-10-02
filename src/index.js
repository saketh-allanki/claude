// Production entry point: `npm start`.
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const app = createApp({ config });
const port = await app.listen(config.port);
console.log(`${config.brandName} listening on port ${port} (${config.baseUrl})`);
if (config.email.provider === 'log') console.log('[mail] EMAIL_PROVIDER is "log": emails are printed here instead of being sent.');
if (!config.stripe.enabled) console.log('[billing] STRIPE_SECRET_KEY not set: paid plans are disabled.');
if (config.scheduler.enabled) app.scheduler.start();

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down…`);
    const force = setTimeout(() => process.exit(1), 15000);
    force.unref();
    await app.close();
    process.exit(0);
  });
}
