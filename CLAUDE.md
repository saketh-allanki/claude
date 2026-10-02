# Notes for Claude Code

Sitewarden is a self-serve SaaS: uptime, SSL and domain-expiry monitoring for web agencies, with white-label monthly client reports. The owner wants minimal involvement, so prefer changes that remove manual work. Owner-facing docs live in `docs/`.

## Ground rules

- **Zero npm dependencies.** Use Node 22 built-ins (`node:sqlite`, `node:test`, `fetch`, `http`, `tls`). Don't add packages without a very strong reason.
- **Run `npm test` before every commit.** Add or update tests in `test/` for behaviour changes.
- **Single instance.** SQLite on one volume plus an in-process scheduler. Don't introduce anything that assumes several replicas.
- **Security invariants:** every user-supplied URL goes through `normalizeUrl` (src/services/monitors.js) and the SSRF-safe client (`src/lib/safehttp.js`, `src/lib/netguard.js`). Every interpolation in templates goes through the `html` tag (auto-escaped). Every authenticated POST form includes `csrfField(req)`.
- **Schema changes:** append a new SQL string to `MIGRATIONS` in `src/db.js`. Never edit an existing migration.
- **Plans and limits** live in `src/config.js` (`buildPlans`). Plan enforcement is in `src/services/accounts.js` (`enforceLimits`).
- **Never fabricate testimonials, customer counts or competitor facts** in marketing pages or guides. Example data must be clearly labelled as an illustration and use `.example` domains.

## Map

- `src/app.js`: builds the context object (`ctx`) shared by all services and routes.
- `src/http/server.js`: router, sessions, CSRF/Origin checks, security headers, static files, flash messages, canonical-host redirect.
- `src/services/scheduler.js`: check dispatch, state transitions (`applyHttpResult`, `applySslResult`, `applyDomainResult`), hourly and daily jobs (pruning, lifecycle emails, reports, weekly digest, backups).
- `src/services/emails.js`: every email template. `src/services/reports.js`: monthly client reports.
- `src/services/billing.js`: Stripe REST client, checkout, portal and webhooks (pinned API version `2024-06-20`).
- `src/views/*`: server-rendered HTML. `public/styles.css` uses CSS custom properties with a dark-mode override.
- `content/blog/*.md`: guides with front matter (`title`, `description`, `date`). Future dates publish automatically. `{{brand}}` is replaced with the brand name.

## Useful commands

```bash
npm test
npm run demo        # sample data + printed sign-in link, no real checks
npm run dev         # reads .env, emails print to console
```

## Writing new guides

Match the existing tone: practical, specific, no hype, no invented statistics. 500–900 words, `##` sections, a link to a relevant free tool (`/tools/...`) where natural, and a closing section that leads naturally (not salesily) to monitoring. Date new guides two weeks apart, after the latest existing date.
