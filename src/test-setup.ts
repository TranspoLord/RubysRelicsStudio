/**
 * Vitest setup entry point (`vitest.config.ts` → `setupFiles`).
 *
 * The admin session/MFA seeds that used to be injected here
 * (`SESSION_SIGNING_KEY_SEED`, `SESSION_HASH_KEY_SEED`, `MFA_CODE_HASH_KEY_SEED`)
 * were removed with the custom session stack in docs/archive/SEPT_IMPLEMENTATION_PLAN §10.13.
 * Suites that need environment variables set them themselves; this file stays so
 * the config keeps a single, obvious place for shared test setup.
 */

export {}

