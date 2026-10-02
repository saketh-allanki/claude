---
title: How to check a domain's expiration date (and what happens if it lapses)
description: Three ways to find out when a domain expires, what happens after the expiry date, and how to make sure a client's domain never lapses.
date: 2026-10-01
---

A lapsed domain is one of the most damaging things that can happen to a business online. The website goes offline, email stops arriving, and if nobody notices in time, the name can be registered by someone else. The fix is simple — know the expiry date and make sure it renews — but in practice domains slip through the cracks all the time.

## Three ways to check the expiration date

### 1. Use a domain expiry checker

The quickest option is a [free domain expiry checker](/tools/domain-expiry-checker). Enter the domain and it reads the expiration date and registrar directly from the registry.

### 2. Query RDAP or WHOIS yourself

RDAP (Registration Data Access Protocol) is the modern, structured replacement for WHOIS, and it is now the authoritative source of registration data for generic top-level domains like .com, .net and .org. You can query it from a terminal:

```
curl -s https://rdap.verisign.com/com/v1/domain/example.com
```

Look for the event with `"eventAction": "expiration"`. Each top-level domain has its own RDAP server; IANA publishes the list in a bootstrap file.

### 3. Check the registrar account

The registrar's dashboard shows the expiry date and, more importantly, whether **auto-renew** is switched on and which payment card it will charge. This is the step most often skipped.

## What actually happens after a domain expires

The details vary by registrar and extension, but the typical sequence for a generic domain is:

1. **Expiry day.** The registration period ends. Most registrars attempt an automatic renewal if it is enabled.
2. **Grace period.** For a few weeks the original owner can usually renew at the normal price. During this time the registrar commonly replaces the website with a parking page — so the site is already down.
3. **Redemption period.** If still unrenewed, the domain enters a redemption period (often around 30 days), where it can be recovered only for a substantial fee.
4. **Deletion and release.** The domain is deleted and becomes available to anyone — including people who specialise in registering expired names with existing traffic.

Country-code domains (.uk, .de, .au and others) follow their own registry rules, which may be shorter.

## Why domains lapse

It is rarely because someone decided not to renew. The usual causes are:

- The card on the registrar account expired or was replaced.
- Renewal reminders went to a former employee's email address or to the agency that built the site years ago.
- The domain was registered in a personal account and forgotten.
- Auto-renew was never switched on after a transfer.

## How to make sure a domain never lapses

- **Turn on auto-renew** and check the payment method on file once a year.
- **Keep registrar contact details current** — reminders only help if they reach someone.
- **Renew for multiple years** for important domains.
- **Monitor the expiry date independently.** A monitoring tool that reads the registry date and warns you 30, 14, 7 and 1 day before expiry catches every failure above, including the ones where the registrar's own reminders never arrive.

If you manage websites for clients, add every client domain to monitoring on day one. It takes seconds, and the first time it catches a lapsing domain it will have paid for itself many times over.
