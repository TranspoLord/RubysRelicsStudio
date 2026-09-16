# Shippo Integration Setup

This document describes how to configure Shippo shipping for Ruby's Relics Studio.

## Environment Variables

Add the following environment variables to your `.env.local` file:

```bash
# Required: Your Shippo API token (get from https://app.goshippo.com/api-keys)
SHIPPO_API_TOKEN=your_live_token_here
SHIPPO_TEST_MODE=false  # Set to 'true' for test mode

# Optional: Webhook verification secret (for production security)
SHIPPO_WEBHOOK_SECRET=your_webhook_secret_here

# Optional: Default shipping origin address
SHIPPO_FROM_STREET=123 Main St
SHIPPO_FROM_CITY=Anytown
SHIPPO_FROM_STATE=CA
SHIPPO_FROM_ZIP=90210

# Required for webhook URL generation
APP_URL=https://yourdomain.com
```

## Setup Process

### 1. Get Shippo API Token

1. Sign up at [Shippo](https://goshippo.com)
2. Navigate to Settings > API Keys
3. Copy your Live Token (or Test Token if SHIPPO_TEST_MODE=true)
4. Add to `.env.local` as `SHIPPO_API_TOKEN`

### 2. Configure Webhooks

1. In Shippo Dashboard, go to Settings > Webhooks
2. Add webhook endpoint: `https://yourdomain.com/api/shippo/webhook`
3. Copy the webhook signing secret to `.env.local` as `SHIPPO_WEBHOOK_SECRET`
4. Enable the following webhook events:
   - `track_updated` - For tracking status changes
   - `track_created` - For new tracking registrations

### 3. Enable Shipping in Admin

1. Navigate to Admin > Shipping in your storefront
2. Check "Enable Shippo Shipping Calculations"
3. Select which carriers to enable (USPS, UPS, FedEx)
4. Save settings

## Features

### Shipping Rate Calculation
- Customers enter their shipping address
- Rates are calculated based on package weight (from product catalog)
- Only North American shipping (US, Canada, Mexico) is supported
- Default package dimensions: 8 × 6 × 2 inches

### Address Validation
- Addresses are validated through Shippo before rate calculation
- Invalid addresses show an error message to the customer

### Tracking Updates
- Webhook automatically updates order status when packages are delivered
- Tracking events are logged in the order history
- Customers receive email notification when order is delivered (if guest order tracking enabled)

### Admin Features
- Configure carriers via the Shipping settings page
- View webhook URL for configuration
- See test mode indicator when enabled

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shippo/rates` | POST | Calculate shipping rates |
| `/api/shippo/validate-address` | POST | Validate a shipping address |
| `/api/shippo/webhook` | POST | Handle tracking updates from Shippo |
| `/api/admin/shipping` | GET/PATCH | Manage shipping settings |

## Troubleshooting

- **No shipping rates returned**: Ensure SHIPPO_API_TOKEN is set and valid
- **Webhook not working**: Verify SHIPPO_WEBHOOK_SECRET matches dashboard configuration
- **Wrong origin address**: Set SHIPPO_FROM_STREET, SHIPPO_FROM_CITY, SHIPPO_FROM_STATE, SHIPPO_FROM_ZIP