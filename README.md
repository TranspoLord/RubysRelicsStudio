# Ruby's Relics Studio

E-commerce storefront + admin panel for Ruby's Relics Studio.

## Stack

- **Next.js** (App Router) · React · TypeScript
- **Supabase** (Postgres + Storage + RLS)
- **Square** (payments) · **Shippo** (shipping) · **Resend** (email)
- **MUI** (UI)

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run type-check` — TypeScript check
- `npm run test` — Vitest suite
- `npm run audit` — dependency audit gate (`--audit-level=high`)

## Environment

Copy `.env.example` and fill in the Supabase, Square, Shippo, and Resend keys.
Admin auth requires `ADMIN_LOGIN_KEY` plus the dedicated high-entropy seeds
`SESSION_SIGNING_KEY_SEED`, `SESSION_HASH_KEY_SEED`, and `MFA_CODE_HASH_KEY_SEED`.

## Documentation

- `docs/Database.md` — canonical schema reference
- `SECURITY_AUDIT.md` — current security audit
- `SEPT_IMPLEMENTATION_PLAN.md` — remaining / unimplemented work
- `docs/archive/` — historical planning and audit docs

