# Email Domain Authentication (SPF, DKIM, DMARC)

This document describes the DNS records required to authenticate emails sent via Resend.

## Overview

To ensure email deliverability and prevent spoofing, you must add SPF, DKIM, and DMARC records to your DNS provider.

## Required DNS Records

### SPF (Sender Policy Framework)

Add a TXT record to your DNS:

```
Name: @ (or your subdomain)
Type: TXT
Value: v=spf1 include:_spf.mx.forwardemail.net ~all
TTL: 3600
```

### DKIM (DomainKeys Identified Mail)

Resend provides DKIM records that must be added as CNAME records. After setting up your domain in Resend, you will receive records similar to:

```
Name: resend._domainkey
Type: CNAME
Value: resend.domainverify.forwardemail.net
TTL: 3600
```

(Additional records will be provided in your Resend dashboard)

### DMARC (Domain-based Message Authentication)

Add a TXT record for DMARC:

```
Name: _dmarc
Type: TXT
Value: v=DMARC1; p=quorum; rua=mailto:dmarc@yourdomain.com; fo=1
TTL: 3600
```

## Security Best Practices

### API Key Scoping

When creating Resend API keys:
- Use a **send-only** permission key for order confirmations
- Never use a full-privilege key in production
- Rotate keys periodically

### Configuration

In your `.env.local`:

```bash
# Resend configuration
RESEND_API_KEY=re_...          # Send-only scoped key
RESEND_FROM_EMAIL=hello@rubysrelics.com
RESEND_FROM_NAME="Ruby's Relics"
```

## Verification

After DNS propagation (typically 24-48 hours), verify in the Resend dashboard that your domain shows as "Verified".

You can also verify SPF/DKIM using tools like:
- https://www.mail-tester.com
- https://dnschecker.org
- https://mxtoolbox.com