import { describe, expect, it } from 'vitest'

import { listSourceFiles, readSourceFile, relativeSourcePath, stripComments } from '@/lib/testing/source-contract'
/**
 * §9.7 / §9.10 / §9.11 defect guards for the panel.
 *
 * The audit measured these in a live DOM (unnamed `MuiSwitch-input`s, a
 * name-less search field, a header that always read "Admin Dashboard", routes
 * with no `h1`) — none of which a node-environment test can render. As with the
 * Batch 2 contract tests, these assert the *source* contract instead: the
 * heading-level and naming checks are written so that re-introducing the defect
 * fails. See OCT_IMPLEMENTATION_PLAN.md → OCT-19 for why the pixel/DOM harness
 * is unavailable in this environment.
 */
const SHELL = readSourceFile('src/components/admin/AdminShell.tsx')
const SHELL_CODE = stripComments(SHELL)
const HOMEPAGE_CODE = stripComments(readSourceFile('src/app/admin/(panel)/homepage/page.tsx'))

describe('AdminShell names its controls and identifies the page (§9.7, §9.10)', () => {
  it('names the global search input, which was placeholder-only', () => {
    expect(SHELL_CODE).toMatch(
      /placeholder="Global quick search[^"]*"[\s\S]{0,300}inputProps=\{\{ 'aria-label':/
    )
  })

  it('derives the header label from the active module instead of a constant', () => {
    expect(SHELL_CODE).toContain("{activeModuleLabel ?? 'Admin Dashboard'}")
    // A bare "Admin Dashboard" in JSX would mean the constant came back.
    expect(SHELL_CODE).not.toMatch(/>\s*Admin Dashboard\s*</)
  })

  it('sets a per-route document title', () => {
    expect(SHELL_CODE).toMatch(/document\.title = `\$\{activeModuleLabel \?\? 'Admin'\}/)
  })

  it('resolves the label once, from the same helper as the rail marker', () => {
    // One source of truth: the label must not re-derive its own match.
    expect(SHELL_CODE.match(/activeAdminModuleLabel\(/g) ?? []).toHaveLength(1)
    const modules = [
      { label: 'Orders', href: '/admin/orders' },
      { label: 'Catalog', href: '/admin/catalog' },
    ]
    expect(activeAdminModuleLabel('/admin/orders', modules)).toBe('Orders')
    expect(activeAdminModuleLabel('/admin/catalog/products/1', modules)).toBe('Catalog')
  })
})

describe('homepage editor names its switches and icon buttons (§9.7)', () => {
  it('gives the visibility switch an input-level name (17 controls from one map)', () => {
    // inputProps targets the <input>; a bare aria-label lands on the root span.
    expect(HOMEPAGE_CODE).toMatch(/inputProps=\{\{ 'aria-label': `\$\{meta\.title\}/)
  })

  it('leaves no IconButton in the file without an accessible name', () => {
    const lines = HOMEPAGE_CODE.split('\n')
    const offenders = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes('<IconButton'))
      .filter(({ index }) => !/aria-label=/.test(lines.slice(index, index + 5).join('\n')))
      .map(({ index }) => index + 1)

    expect(offenders).toEqual([])
  })
})
describe('panel pages have a top-level heading (§9.11)', () => {
  const withTitleText: Array<{ file: string; title: string }> = [
    { file: 'src/app/admin/(panel)/schedule/page.tsx', title: 'Production Queue' },
    { file: 'src/app/admin/(panel)/abandoned-carts/page.tsx', title: 'Abandoned Cart Recovery' },
    { file: 'src/app/admin/(panel)/shipping/debug/page.tsx', title: 'Shipping Debug Tool' },
  ]

  const withDynamicTitle = [
    'src/app/admin/(panel)/catalog/products/[id]/page.tsx',
    'src/app/admin/(panel)/catalog/products/[id]/pricing/page.tsx',
  ]

  for (const { file, title } of withTitleText) {
    it(`${file.split('/').slice(-2)[0]} declares an h1 on its title`, () => {
      const code = stripComments(readSourceFile(file))
      // The h1 must be the element carrying the page's own title text.
      expect(code).toMatch(new RegExp(`AdminPageHeading[\\s\\S]{0,240}${title}`))
    })
  }

  for (const file of withDynamicTitle) {
    it(`${file.split('/').slice(-2)[0]} declares an h1`, () => {
      expect(stripComments(readSourceFile(file))).toContain('<AdminPageHeading')
    })
  }

  it('the shared heading component itself renders the h1', () => {
    // OCT-21: `component="h1"` now lives in AdminPageHeading, so this is the
    // single place the "page title is an h1" guarantee has to hold.
    const source = stripComments(readSourceFile('src/components/admin/AdminPageHeading.tsx'))
    expect(source).toMatch(/variant="h4"\s+component="h1"/)
  })

  it('no longer jumps from h1 straight to h6', () => {
    const files = [
      'src/app/admin/(panel)/homepage/page.tsx',
      ...withDynamicTitle,
      'src/app/admin/(panel)/shipping/debug/page.tsx',
    ]

    for (const file of files) {
      // `variant="h6"` with no `component` renders an h6 — a skip under an h1.
      expect(stripComments(readSourceFile(file)), `${file} still renders a bare h6`).not.toMatch(
        /variant="h6"(?!\s+component)/
      )
    }
  })
})

describe('no Typography omits the heading component (§8.7)', () => {
  it('every subtitle1/subtitle2 declares component, so it is not an h6', () => {
    // MUI maps subtitle1|2 to <h6> unless `component` is set, which emitted a
    // price as an h6 beneath the card's h3. Enforced across src/ so the 13 fixed
    // sites cannot regress.
    const offenders: string[] = []

    for (const file of listSourceFiles()) {
      const lines = readSourceFile(relativeSourcePath(file).slice(1)).split(/\r?\n/)
      lines.forEach((line, index) => {
        if (/variant="subtitle[12]"(?!\s*component)/.test(line)) {
          offenders.push(`${relativeSourcePath(file)}:${index + 1}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })

  it('the scan itself works — it finds a planted omission', () => {
    const planted = '<Typography variant="subtitle1" sx={{ mb: 1 }}>'
    expect(/variant="subtitle[12]"(?!\s*component)/.test(planted)).toBe(true)
    expect(/variant="subtitle[12]"(?!\s*component)/.test('<Typography variant="subtitle1" component="span">')).toBe(
      false
    )
  })
})

describe('no panel Select is nameless (§9.7 / OCT-20)', () => {
  // OCT-20: the audit found 16 `<Select>` elements in the panel with no
  // accessible name (no aria-label, no FormControl/InputLabel labelId). This
  // walks every admin page and fails if any Select's opening tag lacks a
  // naming attribute.
  const NAME_ATTR = /aria-label|aria-labelledby|labelId=/

  function unnamedSelectLines(): string[] {
    const offenders: string[] = []

    for (const file of listSourceFiles()) {
      const rel = relativeSourcePath(file)
      if (!rel.startsWith('/src/app/admin/')) continue
      const lines = readSourceFile(rel.slice(1)).split(/\r?\n/)

      for (let i = 0; i < lines.length; i++) {
        if (!/<Select\b/.test(lines[i])) continue
        let opening = ''
        for (let j = i; j < Math.min(i + 8, lines.length); j++) {
          opening += lines[j] + '\n'
          if (j > i && /<\/?Select\b/.test(lines[j])) break
        }
        if (!NAME_ATTR.test(opening)) offenders.push(`${rel}:${i + 1}`)
      }
    }

    return offenders
  }

  it('names every Select', () => {
    expect(unnamedSelectLines()).toEqual([])
  })

  it('the scan itself works — it finds a planted nameless Select', () => {
    expect(NAME_ATTR.test('<Select size="small" value={x}>\n  <MenuItem>a</MenuItem>\n</Select>')).toBe(false)
    expect(NAME_ATTR.test('<Select aria-label="Discount type" value={x}>')).toBe(true)
    expect(NAME_ATTR.test('<Select labelId="discount-type-label" value={x}>')).toBe(true)
  })
})

describe('the module rail collapses into a Drawer on phones (§9.9)', () => {
  it('hides the stacked 12-module rail below md, so content is not pushed ~906px down', () => {
    expect(SHELL_CODE).toContain("display: { xs: 'none', md: 'block' }")
  })

  it('offers the same module list in a mobile Drawer from a single source of truth', () => {
    expect(SHELL_CODE).toContain('<Drawer')
    expect(SHELL_CODE.match(/const moduleNavItems =/g)).toHaveLength(1)
    expect(SHELL_CODE.match(/\{moduleNavItems\}/g)).toHaveLength(2)
  })

  it('names the mobile trigger with the current module', () => {
    expect(SHELL_CODE).toMatch(/Open modules menu/)
    expect(SHELL_CODE).toMatch(/setMobileNavOpen\(true\)/)
  })
})


import { activeAdminModuleLabel } from '@/lib/admin/module-nav'