import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import { stripComments } from '@/lib/testing/source-contract'

/**
 * OCT #67: panel page authorization cannot live only in the `(panel)` layout.
 *
 * On client-side navigation the App Router re-renders only the changed segment,
 * so the layout's `requireAdminPageSessionOrRedirect()` — the allow-list
 * re-check, which is the revocation authority — does not run. The edge gate then
 * has only the JWT claim, which a revoked admin keeps for as long as it keeps
 * refreshing. Every server page that reads data with the service role must
 * therefore check the row itself.
 *
 * The walker uses absolute paths and `basename()` on purpose: OCT #16 found that
 * a `path.join`-built `endsWith('/page.tsx')` matched **zero** files on Windows,
 * so a test like this one can pass without checking anything.
 */

const PANEL_DIR = join(process.cwd(), 'src/app/admin/(panel)')

function* walkPanelFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      yield* walkPanelFiles(fullPath)
      continue
    }
    const name = basename(fullPath)
    if (name === 'page.tsx' || name === 'layout.tsx') yield fullPath
  }
}

/** True when the file renders on the server **and** touches the database. */
function needsPageGate(source: string): boolean {
  const code = stripComments(source)
  if (/^\s*['"]use client['"]/.test(code)) return false
  return /getSupabaseAdmin|createServerSupabaseClient/.test(code)
}

/** True when the file re-checks the allow-list row for its own request. */
function isGated(source: string): boolean {
  return /requireAdminPageSessionOrRedirect\s*\(/.test(stripComments(source))
}

const panelPages = [...walkPanelFiles(PANEL_DIR)]
const dashboard = readFileSync(join(PANEL_DIR, 'page.tsx'), 'utf-8')
const panelLayout = readFileSync(join(PANEL_DIR, 'layout.tsx'), 'utf-8')

describe('admin page gate (OCT #67)', () => {
  it('walks the panel — the guard must not pass vacuously', () => {
    expect(panelPages.length).toBeGreaterThan(20)
    // At least one of them must be a server page that reads the database, or the
    // rule below would be checking nothing.
    expect(
      panelPages.filter((file) => needsPageGate(readFileSync(file, 'utf-8'))).length
    ).toBeGreaterThan(0)
  })

  it('every server page or layout that reads the database re-checks the allow-list', () => {
    const offenders = panelPages
      .filter((file) => needsPageGate(readFileSync(file, 'utf-8')))
      .filter((file) => !isGated(readFileSync(file, 'utf-8')))
      .map((file) => file.replace(process.cwd(), ''))

    expect(offenders).toEqual([])
  })

  it('gates the dashboard, which is the payload a partial navigation could reach', () => {
    expect(needsPageGate(dashboard)).toBe(true)
    expect(isGated(dashboard)).toBe(true)
  })

  it('gates the layout as well, so a full page load is covered twice over', () => {
    expect(isGated(panelLayout)).toBe(true)
  })
})

describe('admin page gate — the check bites (planted offences)', () => {
  it('flags an ungated server page that reads the database', () => {
    const planted = [
      "import { getSupabaseAdmin } from '@/lib/supabase/client'",
      'export default async function Page() {',
      '  const supabase = getSupabaseAdmin()',
      '  return null',
      '}',
    ].join('\n')

    expect(needsPageGate(planted)).toBe(true)
    expect(isGated(planted)).toBe(false)
  })

  it('flags an ungated server page that builds a request-bound client', () => {
    const planted = [
      "import { createServerSupabaseClient } from '@/lib/supabase/server'",
      'export default async function Page() {',
      '  const supabase = await createServerSupabaseClient()',
      '  return null',
      '}',
    ].join('\n')

    expect(needsPageGate(planted)).toBe(true)
    expect(isGated(planted)).toBe(false)
  })

  it('does not demand a gate from a client component or a static page', () => {
    expect(needsPageGate("'use client'\nimport { getSupabaseAdmin } from 'x'")).toBe(false)
    expect(needsPageGate('export default function Page() { return null }')).toBe(false)
  })

  it('ignores a gate that only appears in a comment', () => {
    const commented = [
      "import { getSupabaseAdmin } from '@/lib/supabase/client'",
      '// requireAdminPageSessionOrRedirect() belongs here',
      'export default async function Page() {',
      '  const supabase = getSupabaseAdmin()',
      '  return null',
      '}',
    ].join('\n')

    expect(needsPageGate(commented)).toBe(true)
    expect(isGated(commented)).toBe(false)
  })
})

