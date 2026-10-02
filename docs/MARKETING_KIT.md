# Marketing kit

Everything here is pre-written. Replace `Sitewarden` and `yourdomain.com` if you renamed the brand. Personalise before posting: communities reward a real person talking about something they built, and punish copy-paste.

**The single most effective tactic is at the end of this file:** the [expiry-finder cold email](#the-expiry-finder-cold-email-highest-converting). Read it first if you only have an hour.

---

## Launch week plan

| Day | Action | Time |
|---|---|---|
| Mon | Submit to directories (list below). Post on LinkedIn and X. | 1 h |
| Tue | Post on Indie Hackers ("I built…" post below). | 30 min |
| Wed | Product Hunt launch (schedule for 12:01 a.m. Pacific). Reply to every comment that day. | 2 h spread out |
| Thu | Show HN post. Reply to comments for the first few hours. | 1 h |
| Fri | Send 20 expiry-finder cold emails. | 1.5 h |
| Sat | r/webdev "Showoff Saturday" post (check the subreddit's current rules first). | 30 min |
| Sun | Rest. Read the weekly digest on Monday. | |

Then for the next 8–12 weeks: **20 cold emails a week plus one helpful community answer a week**. That's about 2–3 hours a week.

---

## Positioning cheat sheet

- **One-liner:** Uptime, SSL and domain monitoring for agencies, with white-label monthly client reports.
- **Tagline:** Know before your clients do.
- **The problem:** websites die in three boring ways (downtime, expired SSL, lapsed domain), and agencies usually find out from the client.
- **The twist:** the monthly branded report makes the agency look great and protects its retainer.
- **Proof points:** free for 5 sites, no install, works with any website, set up in 30 seconds, white-label on Agency.

---

## Directory submissions (one afternoon)

Submit with the same short description and a few screenshots (`npm run demo`, then screenshot the dashboard, a site page and a status page).

- Product Hunt (separate launch day, below)
- BetaList
- SaaSHub
- AlternativeTo (list it as an alternative to well-known uptime monitors)
- G2 and Capterra (free vendor listings; ask your first happy customers for reviews)
- Indie Hackers products
- Uneed, Fazier and other indie launch boards
- Webflow, WordPress and Shopify agency communities' tool lists, where they exist

**Short description (≈160 characters):**
> Monitor uptime, SSL certificates and domain expiry for every client site — and send clients a branded monthly report. Free for 5 sites.

**Long description:**
> Sitewarden watches every website you look after for the three things that quietly take sites offline: downtime, expiring SSL certificates and lapsing domains. When something breaks you hear about it first — by email, Slack, Discord or webhook — with every failure re-checked before alerting so there are no false alarms. On the Agency plan, each client gets a monthly report under your brand showing uptime, response times, incidents and upcoming renewals, plus a live status page. No plugins, no code: paste a URL and you're done. Free for 5 sites.

---

## Product Hunt

**Name:** Sitewarden
**Tagline (60 chars max):** Uptime, SSL & domain monitoring with white-label reports
**Topics:** Developer Tools, SaaS, Web Design, Productivity

**Description:**
> Know before your clients do. Sitewarden monitors uptime, SSL certificates and domain expiry for every site you manage, and emails each client a branded monthly report that proves the value of your care plan. Free for 5 sites, set up in 30 seconds.

**Maker's first comment:**
> Hi Product Hunt 👋
>
> I built Sitewarden after seeing how agencies actually find out a client's site is broken: the client calls. Usually it's not even a crash — it's an SSL certificate whose auto-renewal silently failed, or a domain that lapsed because the card on the registrar account expired.
>
> So Sitewarden watches all three from a single URL: uptime (every minute, re-checked before alerting), SSL expiry and validity, and domain expiry straight from the registry.
>
> The part agencies seem to love: on the 1st of each month every client gets a short report **under your brand** — uptime, response times, incidents handled, renewals coming up. It turns "nothing happened" into "here's what we did for you".
>
> It's free for 5 sites, and I'd love your feedback — especially on what your clients would want to see in a report.

---

## Show HN

**Title:** Show HN: Sitewarden – uptime, SSL and domain-expiry monitoring with client reports

**Text:**
> I built a small monitoring service aimed at people who look after many websites for other people (agencies, freelancers).
>
> Each URL gets three checks: HTTP uptime (with a confirmation re-check before alerting), the TLS certificate the server actually presents (expiry plus trust and hostname errors), and domain expiry via RDAP, using the IANA bootstrap file to find each TLD's registry server.
>
> Some implementation notes that might interest HN: it's a single Node.js process with zero npm dependencies, using the built-in node:sqlite module. The checker resolves DNS itself and refuses private and reserved ranges, to avoid SSRF through user-supplied URLs (including redirects and webhooks). Server-rendered HTML, works without JS.
>
> Free for 5 sites, and there are free tools (SSL checker, domain expiry checker) that don't need an account. Feedback very welcome, especially on RDAP coverage for ccTLDs.

---

## Indie Hackers

**Title:** I built a monitoring tool that helps agencies keep their retainers

> **The problem:** agencies sell "care plans", but when they do the job well nothing visible happens — and clients start asking what they're paying for.
>
> **What I built:** Sitewarden monitors uptime, SSL certificates and domain expiry for every client site, and every month sends each client a report branded as the agency.
>
> **Business model:** Free (5 sites) → Pro $9/mo → Agency $39/mo. Fully self-serve: Stripe Checkout with a 14-day trial, the customer portal for changes, automated lifecycle emails.
>
> **Stack:** Node.js with zero dependencies, SQLite, one small VM. Running costs are under $20/month.
>
> **Acquisition plan:** free SEO tools (SSL checker, domain expiry checker), guides, "Powered by" on free status pages, and cold emails that lead with something genuinely useful (more on that if people are interested).
>
> Happy to share numbers as it grows. What would you want to see in a client-facing website report?

---

## LinkedIn / X posts

**Post 1 (launch):**
> Most website "outages" I've seen at agencies weren't crashes.
>
> They were:
> → an SSL certificate whose auto-renewal silently broke
> → a domain that lapsed because the card on file expired
> → a plugin update that left a white screen returning "200 OK"
>
> And the agency found out when the client called.
>
> I built Sitewarden to catch all of these, and to send each client a monthly report under the agency's brand, so "nothing went wrong" finally looks like the work it is.
>
> Free for 5 sites: yourdomain.com

**Post 2 (education, a week later):**
> Heads-up for anyone managing websites: maximum SSL certificate lifetimes are shrinking in stages, towards 47 days by 2029.
>
> More renewals = more chances for renewal to fail silently.
>
> Three things to do now:
> 1. List every certificate you're responsible for
> 2. Automate renewal wherever possible
> 3. Monitor the certificate the server actually presents, not the renewal job
>
> Full guide: yourdomain.com/blog/ssl-certificate-lifetimes-are-shrinking

**Post 3 (tool):**
> Free tool: paste any domain and see exactly when its SSL certificate and domain registration expire.
>
> No sign-up. Takes 2 seconds. Try your own sites; you might be surprised.
> yourdomain.com/tools

---

## Community answers (ongoing, about 20 min a week)

Search Reddit, agency Facebook groups, Slack communities and forums for questions like:
- "how do you monitor client websites"
- "what uptime monitor do you use"
- "SSL certificate expired client site"
- "how to show clients value of maintenance plan"

Answer the question properly first. Mention Sitewarden only where it genuinely fits, and say you built it. Two genuinely helpful answers beat ten promotional ones.

---

## The expiry-finder cold email (highest converting)

**The idea:** agencies credit themselves in their clients' website footers ("Website by X"). Run those client sites through your own free tools, and you'll often find an SSL certificate or domain expiring soon. An email that says *"Your client's certificate expires in 9 days"* is genuinely useful, gets opened and builds instant trust.

**Where to find agencies:**
- Google "web design agency" + city. Each agency site lists its portfolio.
- Agency directories: Clutch, DesignRush, Sortlist.
- Platform partner directories: Webflow Experts, Shopify Partners, WordPress agency lists.
- Footer credits ("Website by…") on local business websites.

**Process (about 4 minutes per agency):**
1. Open the agency's portfolio and pick 5–10 client sites.
2. Check each with `/tools/ssl-checker` and `/tools/domain-expiry-checker`.
3. If something expires within about 30 days (or is broken), send email A. Otherwise send email B.

**Email A (they have an expiring site):**

> **Subject:** [Client name]'s SSL certificate expires in 9 days
>
> Hi [first name],
>
> I was looking at some of the sites in your portfolio and noticed the SSL certificate on [clientsite.com] expires on [date]. If auto-renewal isn't working, visitors will start seeing a "connection not private" warning that day.
>
> Might be already handled, but thought you'd want to know.
>
> (I built a tool that watches uptime, SSL and domain expiry for agencies and sends clients a monthly report under the agency's brand. That's how I spotted it. Free for 5 sites if it's useful: yourdomain.com)
>
> [Your name]

**Email B (nothing urgent found):**

> **Subject:** Quick question about [Agency]'s care plans
>
> Hi [first name],
>
> Do you offer clients a maintenance or care plan?
>
> I built Sitewarden for agencies like yours: it watches every client site for downtime, SSL expiry and domain expiry, and on the 1st of every month emails each client a short report with **your** logo — uptime, incidents fixed, renewals coming up. It makes the work behind a care plan visible.
>
> I checked a few of your client sites and they all look healthy right now. If you'd like, I'll set up a free account with them already added so you can see what the reports look like.
>
> [Your name]
> P.S. Free for 5 sites, no card: yourdomain.com

**Follow-up (5 days later, reply in the same thread):**

> Hi [first name], just floating this back up. Happy to send a sample client report for one of your sites, no strings attached. Would that be useful?

**Rules:**
- Send from your own mailbox, personally, at most 20–30 a day. Never use a bulk tool on a fresh domain.
- Include your name and business address, and stop immediately if anyone asks. That's both the law in many places (for example CAN-SPAM) and good manners. Rules for unsolicited B2B email differ by country (stricter in parts of the EU, the UK and Canada); check yours.
- Track replies in a simple spreadsheet: agency, date, A or B, reply, signed up.

---

## Asking for reviews and referrals

Send this when a customer has been paying for about 2 months, or replies with something positive:

> Hi [name], really glad Sitewarden is working well for you. Would you be up for leaving a two-line review on [G2 / Capterra link]? It makes a huge difference for a small product. And if you know another agency that would find it useful, I'd be grateful for an intro. Thank you!

---

## SEO plan

**Already built:** 3 free tools, 7 guides at launch, 4 more scheduled every two weeks.

**Keyword clusters to keep adding guides for:**
1. *SSL:* ssl certificate expired, check ssl expiry, ssl certificate monitoring, ssl errors (name mismatch, chain incomplete), 47-day certificates
2. *Domains:* check domain expiration, domain expired what happens, domain grace period, domain renewal reminder
3. *Uptime:* website uptime monitoring, is my website down, uptime percentage, website down checklist (WordPress, Shopify, Webflow)
4. *Agency operations:* website care plan pricing, website maintenance report template, client reporting for web agencies, how to sell maintenance plans
5. *Comparisons (later, carefully and factually):* "[competitor] alternative for agencies"

**Guide ideas for Claude Code to write next** (ask for 2–4 at a time, dated two weeks apart):
- What happens when a Shopify store's custom domain expires
- How to monitor 100+ client websites without a full-time ops person
- Website maintenance checklist for agencies (monthly)
- Let's Encrypt renewal failures: the 7 most common causes
- How to explain uptime to non-technical clients
- What to include in a website care plan contract
- Webflow site down? A diagnostic checklist
- DNS changes that silently break websites
- The real cost of website downtime for a small business
- How to hand over a website to a client without losing the retainer

**Monthly:** check Google Search Console for queries where you get impressions but few clicks, and write a guide that answers each one directly.

---

## Partnerships (after the first 20 customers)

- **Care-plan educators and agency coaches** have audiences of exactly your customers. Offer them a generous recurring referral share.
- **Hosting resellers and WordPress maintenance providers** could bundle Sitewarden reports with their own service.
- **Agency tool newsletters** often run inexpensive sponsorships with a very targeted audience.
