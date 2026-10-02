---
title: WordPress site down? A calm 10-step checklist
description: A step-by-step checklist for diagnosing a WordPress website that is down or broken, from DNS and SSL to plugins, memory and hosting.
date: 2026-11-09
---

When a WordPress site goes down, the temptation is to start changing things at random. Work through this checklist in order instead — it goes from the quickest, most common causes to the slower ones.

## 1. Is it down for everyone?

Check from outside your own network with a [website down checker](/tools/website-down-checker) or your phone on mobile data. If it loads elsewhere, the problem is local: DNS cache, browser extensions or your office network.

## 2. Read the exact error

- **“This site can't be reached” / DNS error** → go to step 3.
- **“Your connection is not private”** → go to step 4.
- **502, 503 or 504 error** → the server or PHP is struggling; go to step 7.
- **“Error establishing a database connection”** → go to step 8.
- **White screen or “There has been a critical error”** → go to step 5.

## 3. Check DNS and the domain

Has the domain expired? Use a [domain expiry checker](/tools/domain-expiry-checker). Were nameservers or DNS records changed recently? An expired domain or a broken DNS change takes the whole site — and often email — offline.

## 4. Check the SSL certificate

An expired or mismatched certificate shows a browser warning instead of the site. Check it with an [SSL checker](/tools/ssl-checker) and renew or reissue it through your host.

## 5. Disable plugins

Most WordPress crashes are caused by a plugin update. If you cannot reach the dashboard, rename the `wp-content/plugins` folder over SFTP or your host's file manager to disable all plugins at once. If the site returns, rename it back and disable plugins one by one.

## 6. Switch to a default theme

If plugins are not the cause, temporarily switch to a default theme by renaming the active theme's folder.

## 7. Check server resources

502/503 errors and slow pages often mean the server has run out of memory or PHP workers, frequently because of a traffic spike or bot crawling. Check the hosting dashboard and error logs.

## 8. Check the database

“Error establishing a database connection” means WordPress cannot reach MySQL. Check that the database server is running and that the credentials in `wp-config.php` have not changed.

## 9. Look at recent changes

What changed in the last 24 hours? An update, a new plugin, a hosting migration, a DNS change? Roll back the most recent change first.

## 10. Contact the host with specifics

If you are stuck, contact the host with the exact error, the time it started and what you have ruled out. Monitoring history makes this faster: a precise start time and error message cuts the back-and-forth dramatically.

## Next time, know first

Most of this checklist is only stressful because the client found the problem first. Monitoring that checks every minute, confirms failures before alerting and also watches SSL and domain expiry means you start this checklist minutes after the problem begins — usually before anyone else has noticed.
