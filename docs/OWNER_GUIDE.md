# Owner's guide

This guide gets Sitewarden live and earning, then keeps your involvement to about 15 minutes a week.

- [What you own](#what-you-own)
- [What runs itself and what needs you](#what-runs-itself-and-what-needs-you)
- [Launch checklist (about 2 hours, once)](#launch-checklist)
- [Your weekly 15 minutes](#your-weekly-15-minutes)
- [Monthly and quarterly](#monthly-and-quarterly)
- [Running costs](#running-costs)
- [Changing things](#changing-things)
- [Troubleshooting](#troubleshooting)
- [Legal and admin](#legal-and-admin)

---

## What you own

A complete software-as-a-service business:

- **The product.** Website monitoring for agencies and freelancers. It watches uptime, SSL certificates and domain expiry, sends alerts, runs status pages and sends white-label monthly client reports.
- **The storefront.** The landing page, an agency page, pricing, three free SEO tools, eleven guides (four publish themselves over the next two months), terms and privacy pages.
- **The cash register.** Stripe subscriptions with free trials, self-service upgrades, downgrades and cancellations, and automatic retries for failed payments.
- **The sales team.** Automatic emails that nudge sign-ups to add a site, to upgrade at the limit and to try Agency, plus "Powered by" links on every free status page and report.
- **The back office.** An admin dashboard, a weekly business email to you, daily database backups and a health check.

---

## What runs itself and what needs you

| Runs itself | Needs you |
|---|---|
| Sign-ups and onboarding | The one-time launch below |
| Billing, trials, failed-payment retries, cancellations | Replying to support emails (canned replies in [SUPPORT_PLAYBOOK.md](SUPPORT_PLAYBOOK.md)) |
| Checks, alerts, status pages | Reading the weekly digest email |
| Monthly client reports | Early marketing: about 2–4 hours a week for the first 2–3 months is what gets the first customers |
| Lifecycle and upgrade emails | Occasionally: new guides, price changes, updates |
| Publishing scheduled guides | |
| Daily backups and data cleanup | |

> **An honest note:** the product, billing and operations run by themselves. Getting the *first* 20–50 customers does not. Spend 2–4 hours a week on the [marketing kit](MARKETING_KIT.md) for the first few months. After that, search traffic, word of mouth and "Powered by" links do most of the work, and the 15-minute weekly routine is enough.

---

## Launch checklist

Work through these steps in order. Each one lists what you need and roughly how long it takes.

### Step 0: Choose the name and domain (15 min)

"Sitewarden" is the working name. Before you commit to it:

1. Check that the `.com` (or a good alternative such as `.io` or `.app`) is available at your registrar. Cloudflare Registrar and Namecheap are good, inexpensive options.
2. Search the USPTO trademark database (or your country's equivalent) and do a web search for software products with the same name.
3. If it's taken, other names that fit: **Lapsewatch, Renewly, Wardenly, SiteSentinel, Uplook, Watchpost, Keepalive.io**. Change `BRAND_NAME` (step 4) and the name updates everywhere in the app, emails and guides.

Buy the domain and turn on auto-renew. (You would be embarrassed to let *this* one lapse.)

### Step 1: Create the accounts (20 min)

| Service | What it's for | Notes |
|---|---|---|
| [Fly.io](https://fly.io) | Hosting the app | Add a payment card; a small app costs a few dollars a month |
| [Resend](https://resend.com) | Sending email | The free tier is enough to start |
| [Stripe](https://stripe.com) | Taking payments | Complete account activation (business details and bank account) |
| A support mailbox | Customer emails | e.g. `support@yourdomain.com`. Google Workspace, Zoho Mail or your registrar's email forwarding all work |
| [Google Search Console](https://search.google.com/search-console) | SEO | Free |
| [Plausible](https://plausible.io) (optional) | Privacy-friendly visitor stats | Paid, optional |

### Step 2: Set up email sending (15 min)

1. In Resend, go to **Domains** and add your domain. A subdomain such as `mail.yourdomain.com` keeps things tidy.
2. Add the DNS records Resend shows you at your registrar or DNS provider, then wait for them to verify.
3. Go to **API Keys** and create a key with "Sending access". Keep it for step 4.
4. Your from-address will be something like `Sitewarden <alerts@mail.yourdomain.com>`.

### Step 3: Deploy to Fly.io (20 min)

Install the Fly command-line tool and sign in:

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

From the project folder:

```bash
# 1. Edit fly.toml: change `app = "sitewarden"` to a unique name, and pick the region closest to your customers.
fly launch --copy-config --no-deploy        # answer "no" to databases and other add-ons
fly volumes create data --size 1            # persistent storage for the database (same region as the app)
```

> **Important:** the app must run as **exactly one machine** because the database lives on one volume. After deploying, run `fly scale count 1` if Fly created two.

### Step 4: Set your configuration (10 min)

Generate a session secret with `openssl rand -hex 32`, then:

```bash
fly secrets set \
  BASE_URL=https://yourdomain.com \
  SESSION_SECRET=paste-the-random-string \
  ADMIN_EMAILS=you@yourdomain.com \
  SUPPORT_EMAIL=support@yourdomain.com \
  EMAIL_PROVIDER=resend \
  EMAIL_API_KEY=re_xxx \
  "EMAIL_FROM=Sitewarden <alerts@mail.yourdomain.com>" \
  "COMPANY_NAME=Your Company LLC" \
  "COMPANY_ADDRESS=123 Example St, City, ST 00000, USA"

fly deploy
fly scale count 1
```

`BASE_URL` must be **exactly** the address customers use, including `https://` and with or without `www`. Visitors on any other hostname are redirected to it.

Every setting is documented in [.env.example](../.env.example).

### Step 5: Connect your domain (10 min)

```bash
fly certs add yourdomain.com
fly ips list
```

At your DNS provider, create an `A` record pointing to the IPv4 address and an `AAAA` record pointing to the IPv6 address shown by `fly ips list`. If you use Cloudflare, set these records to "DNS only" (grey cloud). Then run `fly certs show yourdomain.com` until the certificate is issued. Open `https://yourdomain.com` and you should see the landing page.

### Step 6: Connect Stripe (20 min). Test mode first, then live

1. In the Stripe Dashboard, switch to **Test mode** and copy the test secret key (`sk_test_…`).
2. On your computer, in the project folder, run:

   ```bash
   STRIPE_SECRET_KEY=sk_test_xxx BASE_URL=https://yourdomain.com npm run stripe:setup
   ```

   It creates the Pro and Agency products (monthly and yearly prices), the webhook endpoint and the customer portal, then prints a block of `STRIPE_…=` values.
3. Set them all: `fly secrets set STRIPE_SECRET_KEY=sk_test_xxx STRIPE_WEBHOOK_SECRET=whsec_xxx STRIPE_PRICE_PRO_MONTHLY=price_xxx …`
4. **Test a purchase:** sign up on your site, go to Billing, choose Agency and pay with card `4242 4242 4242 4242` (any future expiry date, any CVC). You should land back on Billing with the Agency plan active. Then try **Manage billing → Cancel** to make sure cancellation works too.
5. When everything works, switch Stripe to **live mode**, run the setup script again with the live key (`sk_live_…`), and replace the secrets with the live values.
6. In Stripe **Settings → Billing → Subscriptions and emails** (exact names vary), turn on:
   - Smart Retries for failed payments
   - Emails to customers about failed payments and expiring cards
   - Trial-ending reminder emails
   - Payment receipts (**Settings → Customer emails**)
7. Optional: to have Stripe add sales tax or VAT automatically, set up **Stripe Tax** in the dashboard, then `fly secrets set STRIPE_AUTOMATIC_TAX=1`.

### Step 7: Smoke test (10 min)

- [ ] Sign up with a different email and add a site. Within a minute it shows **Up** with SSL and domain dates.
- [ ] On **Alerts**, click "Send test" on your email channel. The email arrives (check spam the first time and mark it "not spam").
- [ ] Add a site that doesn't exist (e.g. `https://this-does-not-exist-12345.com`). You get a DOWN alert within about a minute.
- [ ] Create a status page, add a site to it and open the public link.
- [ ] Open `https://yourdomain.com/admin`. You see the business dashboard.
- [ ] Look at `fly logs` and check there are no errors.

### Step 8: Tell Google you exist (5 min)

In Google Search Console, add your domain, verify it with the DNS record it gives you, then go to **Sitemaps** and submit `https://yourdomain.com/sitemap.xml`.

### Step 9: Launch

Follow the "Launch week" plan in [MARKETING_KIT.md](MARKETING_KIT.md). Everything is pre-written; you mostly copy, paste and personalise.

---

## Your weekly 15 minutes

Every Monday you receive **"Sitewarden weekly: $X MRR, N new signups"** by email.

1. **Read the digest (2 min).** If it lists anything under "Worth a look", deal with that first. If not, you're done with this step.
2. **Answer support email (10 min).** Use the canned replies in [SUPPORT_PLAYBOOK.md](SUPPORT_PLAYBOOK.md). Most weeks will have none or one or two.
3. **Optional: one growth action (3 min+).** Reply to a forum thread, send three cold emails or ask a happy customer for a review.

If the digest says *"The monitoring scheduler has not run for over 10 minutes"*, run `fly logs` and then `fly machine restart`. That's the only operational alert you should ever see.

## Monthly and quarterly

**Monthly (about 20 min)**
- Check your Fly.io and Resend bills and usage.
- Look at cancellation reasons in Stripe (**Billing → Subscriptions → Canceled**). Two people giving the same reason means it's worth fixing.
- Add or schedule a new guide. You can ask Claude Code: *"Write two new SEO guides for content/blog, dated two weeks apart, about [topic], in the same style as the existing ones."* Future-dated guides publish themselves on their date.

**Quarterly (about 20 min)**
- Download a backup from `/admin` and keep a copy somewhere safe, such as cloud storage.
- Review pricing (see below).
- Deploy updates: `git pull && fly deploy`.

---

## Running costs

Approximate. Check each provider's current pricing.

| Item | Monthly cost |
|---|---|
| Fly.io (shared-cpu-1x, 512 MB, 1 GB volume) | About $4–7 |
| Resend | Free up to their free-tier limit, then about $20 |
| Domain | About $1 (billed yearly) |
| Stripe | About 2.9% + 30¢ per successful card charge (US); varies by country |
| Plausible (optional) | About $9 |
| **Total** | **About $10–40 a month** |

**Break-even** is around 2–5 paying customers. A single machine handles thousands of monitored sites. If you pass roughly 5,000 active sites, scale the VM up in the Fly dashboard.

---

## Changing things

| I want to… | Do this |
|---|---|
| Rename the brand | `fly secrets set BRAND_NAME=NewName "EMAIL_FROM=NewName <alerts@…>"` |
| Change prices | Set `PRICE_PRO_MONTHLY` / `PRICE_AGENCY_MONTHLY`, re-run `npm run stripe:setup` with the live key, set the new `STRIPE_PRICE_…` values. Existing customers keep their old price. |
| Give someone a free plan | `/admin`, then the "Comp plan" column |
| Change the trial length | `fly secrets set TRIAL_DAYS=7` (0 turns trials off) |
| Change plan limits | `FREE_MONITORS`, `PRO_MONITORS`, `AGENCY_MONITORS` |
| Add a guide | Add a Markdown file to `content/blog/` (copy an existing one), then `fly deploy` |
| Add a feature | Ask Claude Code in this repository. The code is small, commented and fully tested (`npm test`). |
| Try the app locally | `npm run demo`, then open the sign-in link it prints |

**When to raise prices:** once you have about 30 paying customers and fewer than 3% cancel each month, raise prices for *new* customers by 20–30%. Agency at $49–59 is reasonable for what it does.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Sign-in emails don't arrive | Check the Resend dashboard logs and that your domain is verified. `fly logs` shows `[mail] failed` errors. |
| "Cross-site request blocked" on forms | `BASE_URL` doesn't match the address in the browser. Fix `BASE_URL`. |
| Paid plan didn't activate | In Stripe, go to **Developers → Webhooks** and check your endpoint's recent deliveries. Failed deliveries are retried by Stripe automatically. Confirm `STRIPE_WEBHOOK_SECRET` matches the endpoint. |
| A customer says alerts are false | See "False alert" in the support playbook. Usually their firewall or bot protection is blocking our checker. |
| Site down after deploy | `fly logs`. If the machine won't start, `fly releases` shows versions; redeploy the previous image with `fly deploy --image <previous image>`. |
| Need to restore a backup | Run `fly ssh console -C "sh -c 'cp /data/backups/backup-YYYY-MM-DD.db /data/restore.db && mv /data/restore.db /data/sitewarden.db && rm -f /data/sitewarden.db-wal /data/sitewarden.db-shm'"`, then `fly machine restart` straight away. |

---

## Legal and admin

Not legal advice. Check with a professional where you live.

- **Business entity:** consider an LLC or your local equivalent before taking payments, and open a business bank account for Stripe payouts.
- **Terms and privacy:** sensible templates are at `/terms` and `/privacy`, filled in from your `COMPANY_*` settings. Have a lawyer review them once you have revenue.
- **Sales tax and VAT:** depending on where your customers are, you may need to collect tax. Stripe Tax can calculate and collect it (`STRIPE_AUTOMATIC_TAX=1`) and shows where you have obligations.
- **Email law:** marketing emails include an unsubscribe link and your `COMPANY_ADDRESS`, as CAN-SPAM requires. Make sure the address is set.
- **Data processors (GDPR):** Fly.io, Resend and Stripe each offer a data processing agreement (DPA) to accept in their dashboards.
- **Selling the business later:** small profitable SaaS companies are regularly bought and sold on marketplaces such as Acquire.com. Clean books, low churn and documented operations (this guide) all raise the price.
