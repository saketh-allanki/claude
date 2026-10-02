# Business plan

## The idea in one paragraph

Web agencies and freelancers each look after dozens of client websites. Those sites fail in three predictable ways: they go **down**, their **SSL certificate expires** (and browsers show a full-page warning), or their **domain lapses**. Most agencies find out when the client calls, which is the worst way. Sitewarden watches all three for every site, alerts the agency first, and emails each client a monthly report under the agency's own brand. That report proves the agency's value and protects its maintenance retainer. The agency pays a monthly subscription. Everything is self-serve.

## Why this business suits a hands-off owner

| Property | Why it matters |
|---|---|
| **Recurring revenue** | Monitoring is needed every month, forever. Customers who set it up rarely remove it. |
| **No fulfilment work** | Checks, alerts and reports are fully automated. Nothing is made by hand. |
| **Low support load** | Paste a URL and it works. No integrations, no installs, no passwords to reset (magic-link sign-in). |
| **Low, predictable costs** | One small server handles thousands of sites. Cost per customer is close to zero. |
| **Built-in virality** | Free status pages and reports carry a "Powered by" link that every client of every user sees. |
| **Organic acquisition** | People actively search for "SSL checker", "domain expiry checker" and "is my website down". The free tools catch that traffic and turn it into sign-ups. |
| **Timely tailwind** | Maximum SSL certificate lifetimes are being cut in stages, from 398 days to 47 days by 2029. More renewals means more silent failures, and more need for monitoring. |
| **Sellable asset** | A small, profitable, documented SaaS with recurring revenue is a liquid asset on acquisition marketplaces. |

## Customer

**Primary: small web agencies and freelancers (1–20 people)** who build and maintain websites for local businesses, especially WordPress, Webflow and Shopify shops. They:
- manage 10–200 client sites,
- sell or want to sell "care plans" (monthly maintenance retainers),
- dread the "your website is down" call,
- struggle to show clients the value of a retainer in quiet months.

**Secondary:** in-house marketing and IT teams with many microsites, hosting resellers, and indie developers with several projects.

## Positioning

> *"Know before your clients do."* Uptime, SSL and domain monitoring with white-label client reports, built for people who look after websites for others.

Generic uptime monitors are numerous and often free for a handful of sites. Sitewarden does not compete on "uptime checks". It competes on the **agency job to be done**: one URL covers all three failure modes, and the monthly branded report turns monitoring into a retention tool for the agency's own business. That's why the Agency plan is the hero product.

## Competition

There are many uptime-monitoring products, from free tools to observability suites for engineering teams. Most fall into three groups:

1. **Free or cheap uptime checkers:** good at "is it up?", usually weaker on SSL and domain expiry, rarely white-label client reporting.
2. **Developer observability platforms:** powerful, priced and designed for engineering teams, and overkill for an agency with 40 brochure sites.
3. **Agency-focused site management tools:** often tied to one CMS (usually WordPress plugins) and broader, more expensive suites.

**Our edge:** works with any website (no plugin), covers all three failure modes from one URL, white-label reports and status pages, simple per-account pricing (not per site), and an instant self-serve setup.

Check competitors' current features and prices before making comparison claims in marketing.

## Pricing

| Plan | Price | For | Key limits |
|---|---|---|---|
| Free | $0 | Trying it out, own sites | 5 sites, 5-minute checks, email alerts, 1 status page with "Powered by" |
| Pro | $9/mo or $90/yr | Freelancers | 30 sites, 1-minute checks, Slack/Discord/webhooks, 5 status pages |
| **Agency** | **$39/mo or $390/yr** | **Agencies with clients** | 200 sites, white-label, unlimited pages, monthly client reports |

Why it's set up this way:
- **The free plan is generous enough to get used**, but agencies quickly hit 5 sites, and the free plan has no client reports.
- **Agency is anchored against the agency's own revenue.** One client on a modest care plan pays for the Agency plan several times over. The report is what justifies that care plan.
- **Per-account pricing, not per-site.** Easy to understand, and growth inside an account doesn't feel like a tax.
- **Yearly prices give two months free.** That improves cash flow and reduces churn.
- **A 14-day trial on paid plans, card required.** Fewer but much more committed trials, and automatic conversion.

Room to grow: once there are about 30 paying customers with low churn, raise Agency to $49–59 for new customers. Possible add-ons later: extra check regions, SMS alerts, more sites, custom domains for status pages.

## Unit economics (estimates)

| | Pro | Agency |
|---|---|---|
| Monthly price | $9.00 | $39.00 |
| Stripe fees (≈2.9% + $0.30) | ≈ $0.56 | ≈ $1.43 |
| Infrastructure and email per customer | < $0.25 | < $0.50 |
| **Contribution margin** | **≈ $8.20 (≈ 91%)** | **≈ $37.10 (≈ 95%)** |

Fixed costs are about $10–40 a month (see [OWNER_GUIDE.md](OWNER_GUIDE.md#running-costs)), so the business breaks even with roughly 2–5 paying customers.

## Revenue scenarios (illustrative assumptions, not forecasts)

These depend almost entirely on how much early marketing happens. They assume launch-week activity plus 2–4 hours a week of the marketing kit for the first 3 months, then mostly organic growth.

| After 12 months | Conservative | Base | Optimistic |
|---|---|---|---|
| Free users | 300 | 900 | 2,500 |
| Pro customers | 15 | 40 | 100 |
| Agency customers | 8 | 25 | 70 |
| **MRR** | **≈ $450** | **≈ $1,335** | **≈ $3,630** |
| Annual run rate | ≈ $5.4k | ≈ $16k | ≈ $43.6k |

Benchmarks to watch:
- Visitor → free sign-up: 2–5%
- Free → paid within 60 days: 3–8%
- Monthly paid churn: under 4% is healthy for small-business SaaS

## Growth engine

1. **SEO (compounding).** The free tools target high-intent searches (SSL checker, domain expiry checker, is it down). The guides target agency problems (client reports, care-plan pricing, certificate lifetime changes). New guides can be scheduled months ahead.
2. **Product virality.** "Powered by" links on free and Pro status pages and on non-white-label reports, plus embeddable status badges.
3. **Lifecycle email.** Automatic first-site nudge, limit-reached upgrade, Agency pitch to heavy Pro users and a 14-day value recap.
4. **Community and outreach (early).** Agency communities, launch platforms and targeted cold email. All copy is in [MARKETING_KIT.md](MARKETING_KIT.md).
5. **Partnerships (later).** WordPress care-plan educators, hosting resellers and agency tool directories. An affiliate program (for example a 20–30% recurring commission) can be added once there's traction.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Crowded uptime market | Positioned on the agency job (reports, white-label, SSL and domain), not on raw uptime. |
| False alerts damage trust | Confirmation re-checks before alerting, clear error messages, recovery notifications. |
| Checks run from a single region | Re-checks reduce false positives. A second-region checker is a natural premium add-on later. |
| Some registries don't publish expiry dates over RDAP | Shown clearly as "unavailable" rather than guessed. Uptime and SSL still work. |
| A single server is a single point of failure | Fly health checks restart it automatically, daily backups run, and the scheduler-stalled warning appears in the weekly digest. |
| Owner time drifts upward | Self-serve billing, canned support replies, no per-customer setup. Every manual task has been removed or documented. |
| Payment or tax compliance | Stripe handles cards, receipts, dunning and (optionally) tax calculation. |

## Milestones

| Milestone | Target |
|---|---|
| Launch, first 50 free users | Month 1 |
| First 10 paying customers | Months 2–3 |
| $1,000 MRR | Months 9–15 (base case) |
| Price increase for new customers | At about 30 paying customers |
| Add-ons (second check region, SMS, more sites) | When customers ask twice |
| Consider an affiliate program or sale | $3k+ MRR |
