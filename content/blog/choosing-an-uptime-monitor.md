---
title: Choosing an uptime monitor: a 10-point checklist
description: What actually matters when choosing a website monitoring tool — from false-alarm handling to SSL and domain checks and client reporting.
date: 2026-10-01
---

There are dozens of uptime monitoring tools, and most demos look the same: a green dashboard and a big “99.99%”. The differences show up later — at 3 a.m. with a false alarm, or the day a client's domain quietly expires. Use this checklist to compare tools on what actually matters.

## 1. Does it confirm failures before alerting?

Networks blip. A tool that alerts on a single failed request will wake you up for nothing, and you will learn to ignore it. Look for automatic re-checks before an alert is sent, and a recovery message with total downtime.

## 2. How often does it check?

Every 5 minutes is fine for a brochure site. For shops, booking systems and anything that makes money, one-minute checks mean you hear about problems up to four minutes sooner.

## 3. Does it monitor SSL certificates?

Expired certificates replace a site with a browser warning. Your tool should read the actual certificate daily, warn well before expiry, and alert on other certificate problems such as hostname mismatches.

## 4. Does it monitor domain expiry?

Lapsed domains take down the website and email together. The tool should read the expiry date from the registry (via RDAP) and warn at least 30 days ahead.

## 5. Can it detect a broken page that still returns “200 OK”?

Keyword checks catch white screens, database errors and accidental maintenance pages that a simple status-code check misses.

## 6. Do alerts reach the right people?

Email is the minimum. Slack, Discord and generic webhooks let alerts land in the channels your team already watches.

## 7. Is there a status page?

A public, automatically updated status page saves you from “is it down?” messages and shows clients their site is being watched.

## 8. Can you report to clients without extra work?

If you manage sites for clients, look for automated monthly reports — ideally white-labelled with your brand. Reports are what make monitoring visible to the people paying for it.

## 9. Is the pricing predictable?

Check how pricing scales with the number of sites, check frequency and features you will actually need. A tool that is cheap for five sites and expensive for fifty is a tax on growing your business.

## 10. Is it simple?

The best monitoring tool is the one you set up completely. If adding a site takes more than a few seconds or needs code, some sites will never be added.

## A quick scoring method

Score each tool 0–2 on every point above. Anything below 14 out of 20 will probably frustrate you within a few months. And whichever you choose, start by adding every site you are responsible for — partial monitoring gives a false sense of security.
