-- Migration 041: Replace IP-based MFA code lookup with challenge token
--
-- Problem: IP addresses from x-forwarded-for can change between the send-mfa
-- and verify-mfa requests on Vercel serverless (different edge nodes, cold starts),
-- causing "invalid code" errors even when the code is correct.
--
-- Solution: Each MFA send generates a unique challenge token (crypto random UUID)
-- stored in an httpOnly cookie. Verification reads the cookie and looks up the code
-- by challenge_token instead of IP.

ALTER TABLE admin_mfa_codes ADD COLUMN IF NOT EXISTS challenge_token TEXT;

-- Make ip nullable since we no longer require it for primary lookup
ALTER TABLE admin_mfa_codes ALTER COLUMN ip DROP NOT NULL;

-- Add a column for device fingerprint (optional client-side fingerprint hash)
ALTER TABLE admin_mfa_codes ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

-- Index for fast challenge-token lookups during verification
CREATE INDEX IF NOT EXISTS idx_admin_mfa_codes_challenge_token ON admin_mfa_codes (challenge_token);

-- Drop the old IP index since we no longer look up by IP
DROP INDEX IF EXISTS idx_admin_mfa_codes_ip;