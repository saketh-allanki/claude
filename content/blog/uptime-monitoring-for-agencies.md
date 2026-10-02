---
title: How to set up uptime monitoring for every client site in an afternoon
description: A practical playbook for web agencies and freelancers to monitor uptime, SSL certificates and domain renewals across all client websites.
date: 2026-10-01
---

Most agencies discover a client's site is down the same way: the client tells them. That is the worst possible way to find out. This playbook gets every site you are responsible for under proper monitoring in an afternoon, with alerts going to the right people and almost no ongoing effort.

## Step 1: Make the list

Open a spreadsheet and list every website and web service you are responsible for, including the ones nobody has touched in years. For each, note:

- The URL (and any important subdomains: shop, booking, portal, API)
- The client
- Who hosts it and who controls the domain
- Whether you have a maintenance agreement

Most agencies find 20–30% more sites than they expected.

## Step 2: Monitor three things, not one

Uptime checks alone miss two of the three most common causes of a dead website. For every site, monitor:

1. **Uptime** — an HTTP check every one to five minutes from outside the site's own hosting.
2. **SSL certificate expiry and validity** — checked daily, with warnings at 14, 7, 3 and 1 day before expiry.
3. **Domain expiry** — read from the registry, with warnings at 30, 14, 7 and 1 day.

A good tool does all three from a single URL.

## Step 3: Check that the right thing is working

A page can return “200 OK” and still be broken — a white screen, a database error message or a maintenance page. For important pages, add a **keyword check**: the monitor fails if a specific phrase (“Add to cart”, the company name in the footer) is missing.

## Step 4: Route alerts sensibly

- Send down alerts to a **shared channel** (Slack, Discord or a team inbox), not one person's email.
- Require **confirmation before alerting** — a re-check after a failure — so a single network blip does not wake anyone up.
- Make sure you also get **recovery** notifications with the total downtime; you will want it for the client conversation.

## Step 5: Group sites by client

Group each client's sites together. This gives each client a status page they can check themselves and makes monthly reporting trivial.

## Step 6: Tell the client — monthly

Set up an automated monthly report per client: uptime, response time, incidents and upcoming renewals, branded as your agency. This is what turns monitoring from a cost into a reason clients renew their care plan. See our guide to the [monthly client report](/blog/website-uptime-report-for-clients).

## Step 7: Decide what happens when an alert fires

Write down, in three lines, what happens when a site goes down: who looks first, how quickly the client is told, and when to escalate to the host. Agreeing this once saves arguments at 2 a.m.

## What it costs versus what it saves

Monitoring a few dozen sites costs less per month than an hour of agency time. A single prevented domain lapse or expired certificate — the kind of outage that makes a client question whether you are paying attention — is worth far more than that.
