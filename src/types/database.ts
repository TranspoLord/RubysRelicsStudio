// ─────────────────────────────────────────────────────────────────────────────
// Supabase database type definitions
//
// This file is the single source of truth for the strongly typed Supabase
// clients (`createBrowserClient<Database>` / `createServerClient<Database>`).
//
// It is GENERATED from the live Postgres schema — never hand-edit it.
// Regenerate after every schema change:
//
//   npm run db:types
//   (supabase gen types typescript --linked --schema public)
//
// The generation command needs an authenticated CLI session (`npx supabase
// login`) and a linked project (`npx supabase link`).
//
// The scaffold below declares the `public` schema with empty `Tables` /
// `Views` / `Functions` maps, which is exactly what the generator emits for an
// empty schema. Until the real types are generated, a typed client can be used
// for `supabase.auth.*` calls only — any `supabase.from('<table>')` call fails
// to compile on purpose, so queries can never silently drift out of sync with
// the generated schema.
// ─────────────────────────────────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
