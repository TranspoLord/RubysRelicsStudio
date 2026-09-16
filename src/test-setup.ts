// Central test environment defaults for cryptographic secrets that must be
// present at module-load time.
if (!process.env.SESSION_SIGNING_KEY_SEED) {
  process.env.SESSION_SIGNING_KEY_SEED = '0'.repeat(64)
}
if (!process.env.SESSION_HASH_KEY_SEED) {
  process.env.SESSION_HASH_KEY_SEED = '1'.repeat(64)
}
if (!process.env.MFA_CODE_HASH_KEY_SEED) {
  process.env.MFA_CODE_HASH_KEY_SEED = '2'.repeat(64)
}
