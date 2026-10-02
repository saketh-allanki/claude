---
title: "SSL certificate errors explained: what each one means and how to fix it"
description: Plain-English explanations of the most common SSL/TLS certificate errors — expired, self-signed, name mismatch, incomplete chain — and how to fix each.
date: 2026-11-23
---

Certificate errors all look alike to visitors — a scary full-page warning — but each has a different cause and fix. Here are the ones you will meet most often.

## Certificate has expired

**What it means:** The certificate's validity period has ended. Browser codes include `NET::ERR_CERT_DATE_INVALID` and `SEC_ERROR_EXPIRED_CERTIFICATE`.

**How to fix it:** Renew the certificate and install it. If renewal was supposed to be automatic, find out why it failed — DNS changes, firewall rules and expired API credentials are the usual suspects — or it will happen again.

## Certificate is not valid for this name

**What it means:** The certificate was issued for a different hostname. Common after adding a new subdomain, or when `example.com` is covered but `www.example.com` is not. Chrome shows `NET::ERR_CERT_COMMON_NAME_INVALID`.

**How to fix it:** Reissue the certificate to include every hostname visitors use, or redirect the uncovered hostname to one that is covered.

## Self-signed certificate

**What it means:** The certificate was not issued by a trusted certificate authority — often a default certificate left behind by a server or control panel.

**How to fix it:** Install a certificate from a trusted CA. Free automated certificates are available from Let's Encrypt and through most hosts.

## Incomplete certificate chain

**What it means:** The server sends its own certificate but not the intermediate certificate that links it to a trusted root. Some browsers fill in the gap from cache, so the site appears to work for you but fails for others — and for many apps and APIs.

**How to fix it:** Install the full chain (often a file called `fullchain.pem` or a “CA bundle”) on the server.

## Certificate not yet valid

**What it means:** The certificate's start date is in the future — usually a misconfigured clock on the visitor's device or, rarely, a certificate installed too early.

**How to fix it:** Check the server and device clocks. If many visitors report it, check the certificate's start date.

## Revoked certificate

**What it means:** The issuing authority has revoked the certificate, typically because its private key may have been exposed or it was mis-issued.

**How to fix it:** Issue and install a new certificate with a new private key.

## Catch them before visitors do

Every one of these errors can appear after a server change, a migration or a failed renewal — usually without any warning to the site owner. Monitoring the certificate each site actually presents, daily, means you find out from an alert rather than from a customer.
