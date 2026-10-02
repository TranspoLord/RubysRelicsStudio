/**
 * Helpers for source-contract tests.
 *
 * This repo has no DOM render harness (vitest runs `environment: 'node'` — see
 * `OCT_IMPLEMENTATION_PLAN.md` → OCT-5), so component-level layout and
 * accessibility contracts are asserted against the source file, the same way
 * `src/lib/admin/auth-route-pattern.test.ts` guards its route pattern. These
 * helpers exist so every such test reads the file and strips comments the same
 * way — a guard like "this component must not hard-code white" has to look at
 * code, not at the comment explaining why the white was removed.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Reads a repo-relative file (e.g. `src/components/admin/AdminShell.tsx`). */
export function readSourceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
}

/**
 * Walks `src/` and yields every `.ts`/`.tsx` file that is **not** a test file.
 *
 * Shared by the source-scan contract tests (§8.3's contrast floor, §9.7/§9.10/
 * §9.11's panel contracts) so each one does not carry its own walker.
 */
export function listSourceFiles(): string[] {
  const files: string[] = []

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (/\.(tsx|ts)$/.test(full) && !full.endsWith('.test.ts')) {
        files.push(full)
      }
    }
  }

  walk(join(process.cwd(), 'src'))
  return files
}

/** Repo-relative, forward-slashed path — for readable failure messages. */
export function relativeSourcePath(absolutePath: string): string {
  return absolutePath.replace(process.cwd(), '').replace(/\\/g, '/')
}

/**
 * Removes whole-line line comments and block comments.
 *
 * Only whole-line line-comments are stripped: an inline marker can be part of a
 * string or URL (`https://…`), and this helper exists for assertions that must
 * not be satisfied or broken by prose.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}
