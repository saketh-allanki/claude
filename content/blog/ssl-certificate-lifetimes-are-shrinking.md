---
title: SSL certificate lifetimes are shrinking — what agencies should do now
description: Maximum certificate lifetimes are being cut in stages towards 47 days. More renewals means more chances for renewal to fail. Here is how to prepare.
date: 2026-10-01
---

For years, a publicly trusted SSL/TLS certificate could be valid for up to 398 days. That is changing. The CA/Browser Forum — the body of certificate authorities and browser makers that sets the rules — has approved a phased reduction of maximum certificate lifetimes, ending at 47 days.

## The timeline

The reductions are phased in over several years:

| From | Maximum certificate lifetime |
|---|---|
| March 2026 | 200 days |
| March 2027 | 100 days |
| March 2029 | 47 days |

The time a certificate authority may reuse previous domain validation is being shortened on a similar schedule. In practice this means certificates must be renewed — and domain ownership re-validated — much more often than before.

## Why this matters for anyone who looks after websites

If you only use automatically renewed certificates on modern hosting, the change may pass unnoticed. But most agencies and freelancers manage a mix of setups built over many years:

- Sites with **paid certificates** installed manually once a year.
- **Load balancers, CDNs and appliances** with certificates uploaded by hand.
- Renewal automation that depends on **DNS API credentials** or firewall rules nobody has looked at in years.
- Client-owned servers where you do not control the renewal process at all.

Every one of these needs to renew several times a year instead of once. Each renewal is a chance for something to go wrong — and with shorter lifetimes, the window between a silent failure and an outage gets shorter too.

## What to do now

### 1. Inventory every certificate you are responsible for

List every client site, subdomain and service. For each one, note who issues the certificate, how it renews and who is responsible. Most agencies discover a few surprises.

### 2. Automate wherever possible

Move manual certificates to automated renewal using ACME (the protocol Let's Encrypt and many commercial CAs support). Most hosts, CDNs and control panels now offer this.

### 3. Monitor the certificate, not the automation

Automation fails silently. The only reliable signal is the certificate the server actually presents to visitors. Monitor every site daily and alert well before expiry — at least two weeks out while lifetimes are long, and keep a short ladder of reminders (7, 3 and 1 day) for anything that slips.

### 4. Make expiry visible to clients

Shorter lifetimes are a good reason to talk to clients about maintenance. A monthly report listing upcoming certificate and domain renewals shows the work you do to keep their site running — and turns a technical change into a reason to value a care plan.

## The bottom line

Shorter certificates are better for security: compromised or mis-issued certificates stay valid for less time. But they shift the burden onto renewal processes that were designed to run once a year. The agencies that handle this smoothly will be the ones that automate renewal and independently monitor the result.
