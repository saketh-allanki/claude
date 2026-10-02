// Production entry point: `npm start`.
import path from 'node:path';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { dropPrivileges } from './lib/privileges.js';

const config = loadConfig();
if (dropPrivileges(process.env.RUN_AS_USER, [path.dirname(path.resolve(config.databasePath)), config.backupDir])) {
  console.log(`Running as user ${process.env.RUN_AS_USER}`);
}
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
