import { describe, expect, it } from 'vitest'

import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * §9.3 and §9.6 are layout contracts that the audit measured in the live DOM:
 * "Skip to main content" had no target on any of the 23 panel routes (no `main`,
 * no `#main-content`), the 12 module links sat in an unnamed `aside` with no
 * `aria-current`, and the active marker vanished on nested catalog routes.
 *
 * There is no render harness in this repo (vitest runs `environment: 'node'`;
 * see OCT_IMPLEMENTATION_PLAN.md → OCT-5), so these are asserted against the
 * source — the same technique `src/lib/admin/auth-route-pattern.test.ts` uses for
 * its route pattern. They fail if the attributes are removed or reworded.
 */
const SHELL_SOURCE = readSourceFile('src/components/admin/AdminShell.tsx')
const SHELL_CODE = stripComments(SHELL_SOURCE)

describe('AdminShell landmark contract (§9.3, §9.6)', () => {
  it('gives the skip link a target: one <main id="main-content"> content column', () => {
    // Same tag, so the id cannot drift onto an unrelated element.
    expect(SHELL_SOURCE).toMatch(/component="main"[\s\S]{0,200}id="main-content"/)
  })

  it('labels the module rail as a nav instead of an anonymous aside', () => {
    expect(SHELL_SOURCE).toMatch(/component="nav"[\s\S]{0,200}aria-label="Admin modules"/)
    expect(SHELL_SOURCE).not.toContain('component="aside"')
  })

  it('announces the current module and resolves nested routes by longest match', () => {
    expect(SHELL_CODE).toContain("aria-current={active ? 'page' : undefined}")
    expect(SHELL_SOURCE).toContain("from '@/lib/admin/module-nav'")
    expect(SHELL_CODE).toContain('resolveActiveAdminHref')
    // The pre-fix comparison, which lost the marker on /admin/catalog/products/*.
    expect(SHELL_CODE).not.toMatch(/const active = pathname === mod\.href/)
  })
})
