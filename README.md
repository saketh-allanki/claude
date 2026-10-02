# Sitewarden

**Uptime, SSL and domain-expiry monitoring for web agencies — with white-label monthly client reports.**

Sitewarden watches every website an agency or freelancer looks after: is it up, is its SSL certificate about to expire, is its domain about to lapse. When something breaks, it alerts the right people by email, Slack, Discord or webhook. On the 1st of every month it emails each client a report branded as the agency, showing what the agency did for them.

It is a complete, self-serve SaaS business. Sign-up, onboarding emails, billing, upgrades, cancellations, alerts, reports, backups and the owner's weekly business digest all run without anyone touching them.

| | |
|---|---|
| **Who pays** | Web agencies, freelancers and in-house teams responsible for many websites |
| **Plans** | Free (5 sites) · Pro $9/mo (30 sites) · Agency $39/mo (200 sites, white-label reports) |
| **Acquisition** | Free SEO tools, 11 guides (4 publish themselves on a schedule), "Powered by" links on free status pages and reports, embeddable status badges |
| **Running cost** | Roughly $10–40/month until you have hundreds of customers |
| **Owner time** | A one-time launch of about 2 hours, then about 15 minutes a week (see [docs/OWNER_GUIDE.md](docs/OWNER_GUIDE.md)) |

## Documents for the owner

- **[docs/OWNER_GUIDE.md](docs/OWNER_GUIDE.md)**: start here. A step-by-step launch checklist, the weekly routine and troubleshooting.
- **[docs/BUSINESS_PLAN.md](docs/BUSINESS_PLAN.md)**: the market, positioning, pricing, unit economics and growth plan.
- **[docs/MARKETING_KIT.md](docs/MARKETING_KIT.md)**: ready-to-post launch copy, cold emails, directories and SEO plan.
- **[docs/SUPPORT_PLAYBOOK.md](docs/SUPPORT_PLAYBOOK.md)**: canned replies for every common support question.

## Features

- **Monitoring:** HTTP(S) uptime checks every 1–60 minutes, keyword checks, redirect following, and confirmation re-checks before alerting (no false alarms from network blips).
- **SSL certificates:** daily checks of expiry, issuer and trust problems, with alerts 14/7/3/1 days before expiry and when a certificate becomes invalid.
- **Domains:** registry expiry dates read over RDAP, with alerts 30/14/7/1 days before expiry.
- **Alerts:** email (always on), Slack, Discord and generic JSON webhooks, plus a test button and an alert history.
- **Status pages:** a public page per client with 90-day uptime bars and incident history, plus an embeddable status badge (SVG).
- **Client reports (Agency):** monthly HTML emails with the agency's name, logo and colour: uptime, response times, incidents and upcoming renewals.
- **Billing:** Stripe Checkout with a free trial, the Stripe Customer Portal for upgrades, downgrades, cards, invoices and cancellation, and webhooks that keep plans in sync. Going over a plan limit pauses the newest sites and never deletes anything.
- **Growth on autopilot:** lifecycle emails (first-site nudge, upgrade nudge at the limit, Agency pitch to heavy Pro users, a two-week value recap), all with unsubscribe links. Free SSL, domain and "is it down?" tools work as SEO lead magnets, and guides publish themselves on their scheduled date.
- **Owner tools:** `/admin` dashboard (MRR, customers, signups, scheduler health, complimentary plans, backup downloads), a weekly digest email and daily database backups.
- **Security:** passwordless magic-link sign-in, CSRF tokens, Origin checks, strict CSP, SSRF protection (user URLs can never reach private networks or cloud metadata), rate limits and signed unsubscribe links.

## Tech

- **Node.js 22 with zero npm dependencies.** Nothing to update, no supply-chain risk, no `node_modules`.
- **SQLite** through Node's built-in `node:sqlite`, stored in a single file with daily snapshots.
- Server-rendered HTML that works without JavaScript and supports dark mode.
- One process runs the website and the monitoring scheduler, deployed as one small container.

```
src/
  index.js            entry point (npm start)
  app.js              wires everything together
  config.js           env vars and plan definitions
  db.js               schema and migrations
  checks/             http, ssl and domain (RDAP) checks
  services/           auth, billing, monitors, alerts, scheduler, reports, emails, admin
  routes/             site, auth, app, admin and webhook routes
  views/              HTML templates
  lib/                html escaping, markdown, SSRF guard, safe HTTP client, formatting
content/blog/         SEO guides in Markdown (future-dated files publish on their date)
public/               CSS, a small progressive-enhancement script and the favicon
scripts/              stripe-setup.js (one-time Stripe setup), demo.js (local demo with sample data)
test/                 node:test suites
```

## Commands

```bash
npm run demo          # run locally with sample data; open the sign-in link it prints
npm run dev           # run locally (reads .env if present; emails print to the console)
npm test              # run the test suite
npm start             # production start
npm run stripe:setup  # create Stripe products, prices, webhook and portal (one time)
```

Requires Node.js 22.13 or newer. Copy `.env.example` to `.env` for local configuration.

## Deploying

Fly.io is the recommended host (`fly.toml` is included). A `render.yaml` blueprint and a generic `Dockerfile` are also provided. The full walkthrough is in [docs/OWNER_GUIDE.md](docs/OWNER_GUIDE.md).

The app keeps its state in SQLite on a persistent volume and runs the scheduler in-process, so it runs as **one** instance. A single small VM handles thousands of monitored sites.
