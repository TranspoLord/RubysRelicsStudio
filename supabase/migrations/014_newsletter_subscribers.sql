-- Migration 014: Newsletter subscribers
-- Stores newsletter consent for both guests and logged-in customers.

CREATE TABLE IF NOT EXISTS exp_newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES exp_customers(id) ON DELETE SET NULL,
  source TEXT,
  subscribed BOOLEAN NOT NULL DEFAULT TRUE,
  subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  consent_ip TEXT,
  consent_user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON exp_newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_customer_id ON exp_newsletter_subscribers(customer_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_subscribed ON exp_newsletter_subscribers(subscribed);

ALTER TABLE exp_newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Lock down direct access for public roles; server-side service role handles writes.
REVOKE ALL ON TABLE exp_newsletter_subscribers FROM anon, authenticated;
GRANT ALL ON TABLE exp_newsletter_subscribers TO service_role;
