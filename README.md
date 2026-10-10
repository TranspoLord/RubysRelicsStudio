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
- `npm run admin:grant -- <google-email> --confirm-user-id <uuid>` — add a Google account to the admin allow-list
- `npm run admin:revoke -- <google-email>` — remove it (deactivates the row and clears the claim)

## Environment

Copy `.env.example` and fill in the Supabase, Square, Shippo, and Resend keys.
Set `NEXT_PUBLIC_SITE_URL` to the origin you actually sign in on — Google returns
the session to that host, so a mismatch sends you somewhere else. The admin panel
authenticates through Supabase Auth (Google) against the allow-list below;
`ADMIN_LOGIN_KEY`, `ADMIN_MFA_EMAIL` and the `*_SEED` variables are **inert** and
are removed by `docs/archive/SEPT_IMPLEMENTATION_PLAN.md` §10.13.

### Admin access

Admin access is an allow-list (`exp_admin_users`) keyed by Supabase
`auth.users.id`. Add an account with
`npm run admin:grant -- <google-email> --confirm-user-id <uuid>`; that account must have signed in with
Google at least once first, because Google sign-in is what creates the
`auth.users` row. The command prints the account it resolved and refuses to write
until you echo its `user_id` back with `--confirm-user-id`, because the lookup is
by email — it also refuses an unconfirmed address and any account with no Google
identity (OCT #11). The row is the revocation authority; the matching
`app_metadata.role = 'admin'` claim written by the same command is what the Edge
gate reads. Remove access with `npm run admin:revoke -- <google-email>`.

> The former `ADMIN_LOGIN_KEY` + emailed-MFA flow is retired; its endpoints and
> tables are deleted by `docs/archive/SEPT_IMPLEMENTATION_PLAN.md` §10.8–§10.12.
>
> A token carries the roles it was issued with, so an account granted access
> after its last sign-in must use **Refresh access** on the login page (or sign
> out and back in) before the panel will open.

## Documentation

- `docs/Database.md` — canonical schema reference
- `docs/GOOGLE_AUTH_SUPABASE.md` — Google OAuth via Supabase Auth (setup, flow, env vars)
- `OCT_IMPLEMENTATION_PLAN.md` — **the living plan for open work**: issues, the batch plan (§5), the remediation cross-reference (§4) and the Product Design Studio epic (§6)
- `POTENTIAL_FUTURE.md` — design notes for unbuilt work (bulk product import, DB backup, PBR materials)
- `UI_AUDIT.md` — how the storefront UI audit is run (method + evidence locations)
- `docs/archive/` — historical planning and audit docs (e.g. `SEPT_IMPLEMENTATION_PLAN.md`, `REMEDIATION_PLAN_2026-10-06.md`, `SECURITY_AUDIT.md`)

