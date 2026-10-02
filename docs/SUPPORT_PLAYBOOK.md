# Support playbook

Ready-made answers to every question you're likely to get. Copy, adjust the bracketed parts, send. Most weeks should need none or one or two replies.

**Principles:** reply within one working day. Be friendly and short. Fix the cause, not just the ticket: if two people ask the same thing, improve the product or the FAQ (Claude Code can make the change for you).

---

### "I didn't get the sign-in email"

> Hi [name], sorry about that! Sign-in links usually arrive within a minute. Could you check your spam or promotions folder for an email from [EMAIL_FROM]? If your company filters external email, adding our address to your allowlist fixes it. You can request a new link any time at yourdomain.com/login. Each link works once and lasts 20 minutes.

*If it keeps happening:* check the Resend dashboard for that address (bounced? marked as spam?).

### "You say my site is down, but it's up" (false alert)

> Hi [name], thanks for flagging this. Every failure is re-checked before we alert, so this usually means something between our checker and the site blocked the request. Most often that's a firewall, Cloudflare's bot protection or a security plugin.
>
> The error we saw was: "[error from the site page]".
>
> To fix it, allow requests with the user agent **SitewardenBot** in your firewall or security plugin (in Cloudflare: Security → WAF → custom rule, user agent contains "SitewardenBot" → Skip). If you use a keyword check, also make sure the keyword appears exactly on the page (it isn't case-sensitive).

*If they need an IP allowlist instead:* Fly.io can allocate a static outbound IP (see Fly's docs on egress IPs). Do this once demand justifies it.

### "Domain expiry says unavailable"

> Hi [name], we read domain expiry dates directly from the official registry using RDAP. A few country-code registries don't publish expiry dates this way, so we show "unavailable" rather than guess. Uptime and SSL monitoring work as normal for that site. Your registrar's dashboard will show the date, and turning on auto-renew there is the best protection.

### "How do I connect Slack / Discord?"

> Hi [name], go to **Alerts → Add a channel** and choose Slack or Discord.
> • **Slack:** create an "Incoming Webhook" for your workspace (Slack → Apps → Incoming Webhooks), pick a channel and paste the webhook URL.
> • **Discord:** in the channel, go to Settings → Integrations → Webhooks → New Webhook → Copy URL, and paste it in.
> Then click "Send test" to make sure it arrives. (Slack, Discord and webhook alerts are included in Pro and Agency.)

### "How do I set up client reports?"

> Hi [name], on the Agency plan:
> 1. **Settings → Branding:** add your agency name, logo URL and colour.
> 2. **Status pages → New status page:** one per client, with the client's email in "Monthly report recipients".
> 3. Tick the client's sites on that page.
> Reports go out automatically on the 1st of each month. Use "Email me a sample report" to see exactly what your client will receive. You'll also get a copy of every report.

### "My client didn't receive the report"

> Hi [name], reports are sent on the 1st of each month from about 07:00 UTC, to the recipients listed on the client's status page. Could you ask your client to check spam and add [EMAIL_FROM] to their contacts? You can check the recipients and send yourself a sample from the status page settings. Note the first report goes out on the 1st of the month after the page was created.

### "How do I cancel / downgrade?"

> Hi [name], you can do it yourself in a few seconds: **Billing → Manage billing & invoices → Cancel plan**. Your plan stays active until the end of the period you've paid for, and your account then moves to the free plan. Nothing is deleted. If you're above the free limit, the newest sites are paused and resume if you upgrade again.
>
> If you have a moment, I'd love to know what we could have done better.

### "Can I get a refund?"

Suggested policy: refund the most recent charge if they ask within 14 days of it and barely used the product. Be generous; it's cheaper than a chargeback and good for reputation.

> Hi [name], of course. I've refunded your last payment of $[amount]; it should appear on your statement within 5–10 days. Your account stays on the free plan, so your sites and history are still there if you need them.

*How:* Stripe Dashboard → Payments → find the payment → Refund. Then cancel the subscription if they want that too (Customers → Subscription → Cancel).

### "I need an invoice / VAT receipt"

> Hi [name], you can download every invoice from **Billing → Manage billing & invoices**. To add your company name, address or VAT number to future invoices, update them on the same page.

### "Please change my email address"

Confirm the request came **from the current address**, then use `/admin` → "Change a customer's sign-in email".

> Hi [name], done. You can now sign in with [new email]. To change the address on invoices too, update it under **Billing → Manage billing & invoices**.

### "Please delete my account / data" (GDPR request)

> Hi [name], you can delete your account and all its data immediately from **Settings → Delete account**. This also cancels any subscription. If you'd prefer, reply to confirm and I'll do it for you. Backups containing your data are automatically removed within 7 days.

*To do it for them:* confirm the request came from the account's own email address, then use `/admin` → "Delete a customer's account".

### "Can you monitor [ping / ports / cron jobs / API with auth]?"

> Hi [name], thanks for the suggestion. Today Sitewarden checks websites over HTTP(S), plus their SSL certificate and domain. I've noted [feature] on the roadmap. If more customers ask, it moves up the list. Is there a workaround that would help in the meantime, such as a keyword check on a status endpoint?

*Keep a simple tally of feature requests. Build what's requested repeatedly by paying customers.*

### "Can my status page use my own domain?"

> Hi [name], not yet. Status pages live at yourdomain.com/status/your-page. Many customers link to it from their footer or embed the status badge. I've noted custom domains as a request.

### "Where do checks come from?"

> Hi [name], checks come from our monitoring server, and every failure is confirmed with a second check before anyone is alerted. Our checker identifies itself with the user agent "SitewardenBot".

### Something is genuinely broken (a bug)

> Hi [name], thank you for reporting this, and sorry for the trouble. I can reproduce it and I'm fixing it now. I'll let you know as soon as it's resolved.

Then open the project with Claude Code: *"Customer reports: [paste]. Reproduce with a test, fix it, run npm test, and deploy."*
