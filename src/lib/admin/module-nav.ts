/**
 * Active-module resolution for the admin panel rail (docs/archive/SEPT_IMPLEMENTATION_PLAN §9.6).
 *
 * Before this, `AdminShell` marked a module active with `pathname === mod.href`,
 * so the highlight **vanished** on every nested route — `/admin/catalog/products`
 * and `/admin/catalog/products/<id>/builder` showed no active module at all, which
 * is precisely where an operator needs the orientation cue most.
 *
 * The obvious fix (`pathname.startsWith(mod.href)`) is wrong in the other
 * direction: `/admin` is a module, so every panel route would light up
 * "Dashboard" *and* its own entry. The rule that holds in both cases is
 * **longest match**: the active module is the longest href the path is equal to
 * or nested under. That is a pure function on purpose, so the matrix is
 * unit-tested rather than re-derived inside the component.
 */

/**
 * Returns the label of the module that owns `pathname`, or `null`.
 *
 * Used by `AdminShell` for the header text and the document title (§9.10): the
 * bar read "Admin Dashboard" on all 23 routes and every route shared one
 * `<title>`, so tabs, bookmarks and history entries were indistinguishable.
 */
export function activeAdminModuleLabel(
  pathname: string,
  modules: ReadonlyArray<{ label: string; href: string }>
): string | null {
  const activeHref = resolveActiveAdminHref(
    pathname,
    modules.map((mod) => mod.href)
  )
  if (!activeHref) return null
  return modules.find((mod) => stripTrailingSlash(mod.href) === activeHref)?.label ?? null
}

/**
 * Returns the href of the module that owns `pathname`, or `null` when no module
 * matches. Callers compare with `===` per link and set `aria-current="page"`.
 *
 * - exact match wins over a nested parent (`/admin/orders` ≠ Dashboard)
 * - nested routes keep their parent's marker (`/admin/catalog/products/<id>`)
 * - a trailing slash is not significant (`/admin/orders/` === `/admin/orders`)
 * - `/` never absorbs the admin tree
 * - a nested route that no href matches falls to its nearest ancestor module
 *   (`/admin/not-authorized` → `/admin`), which is router semantics and harmless
 *   because only the panel shell renders the rail
 */
export function resolveActiveAdminHref(
  pathname: string,
  hrefs: readonly string[]
): string | null {
  if (!pathname) return null

  const normalized = stripTrailingSlash(pathname)
  let best: string | null = null

  for (const href of hrefs) {
    if (!href) continue
    const candidate = stripTrailingSlash(href)
    if (candidate === '/' && normalized !== '/') continue

    const owns =
      normalized === candidate ||
      (candidate !== '/' && normalized.startsWith(`${candidate}/`))
    if (!owns) continue

    if (best === null || candidate.length > best.length) {
      best = candidate
    }
  }

  return best
}

function stripTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith('/') ? value.replace(/\/+$/, '') : value
}
