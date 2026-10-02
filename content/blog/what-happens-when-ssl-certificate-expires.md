---
title: What happens when an SSL certificate expires (and how to make sure it never does)
description: An expired SSL certificate turns a working website into a full-page browser warning. Here is exactly what visitors see, what breaks, and how to prevent it.
date: 2026-10-01
---

An SSL certificate (strictly speaking, a TLS certificate) is what lets a browser show the padlock and load a site over `https://`. Every certificate has a hard expiry date. The moment that date passes, the website does not get slower or slightly less secure — it effectively disappears behind a warning page.

## What visitors see

Every major browser treats an expired certificate as a serious security error:

- **Chrome and Edge** show “Your connection is not private” with the error `NET::ERR_CERT_DATE_INVALID`.
- **Firefox** shows “Warning: Potential Security Risk Ahead”.
- **Safari** shows “This Connection Is Not Private”.

The site's content is not displayed. Visitors can sometimes click through an “Advanced” link, but almost nobody does — and on sites using HSTS (which is common and recommended), browsers remove the option entirely.

## What else breaks

The warning page is only the visible part. An expired certificate also breaks:

- **Online checkouts and forms.** Payment providers and embedded widgets refuse insecure connections.
- **APIs and mobile apps** that call the domain. They fail with TLS errors, often silently.
- **Search visibility.** Crawlers that hit certificate errors cannot read the page, and a prolonged outage can affect rankings.
- **Email deliverability**, if the same certificate secures your mail server.
- **Trust.** Customers who see “your connection is not private” on a business website assume it has been hacked.

## Why it still happens in the age of auto-renewal

Free certificates from Let's Encrypt and most managed hosts renew automatically, so it is tempting to assume expiry is a solved problem. In practice, automatic renewal fails quietly for many ordinary reasons:

1. **DNS changes.** The domain was moved to a new DNS provider and the validation records no longer resolve.
2. **Server migrations.** The site moved to a new server, but the renewal job stayed on the old one.
3. **Firewalls and CDNs.** A new firewall rule or CDN setting blocks the validation request.
4. **Expired credentials.** The API key the renewal tool uses for DNS validation was rotated or expired.
5. **Paid certificates.** Someone has to remember to buy the renewal — and that someone has left the company.

None of these produce an error you will notice. The renewal simply does not happen, and you find out when a client calls.

## How to check when a certificate expires

You can check manually in a browser by clicking the padlock and viewing the certificate details, or use a free [SSL certificate checker](/tools/ssl-checker), which shows the expiry date, issuer and whether browsers trust the certificate chain.

From a terminal, this prints the expiry date:

```
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -enddate
```

## How to make sure it never happens

A one-time check only tells you about today. The reliable fix is to **monitor the certificate the server actually presents**, not the renewal job:

- Check every certificate at least daily.
- Alert well before expiry — 14 days gives time to fix a broken renewal calmly; 7, 3 and 1 day reminders catch anything that slipped.
- Alert immediately if a certificate becomes invalid for another reason, such as a hostname mismatch or an incomplete chain after a server change.
- Send alerts somewhere the whole team sees them, not one person's inbox.

If you look after websites for clients, certificate monitoring is one of the cheapest ways to avoid the most embarrassing kind of outage — the one that was entirely predictable.
