import Typography from '@mui/material/Typography'

/**
 * OCT-21 — the panel's page title.
 *
 * Before this, each admin page declared its own `<Typography variant="h4|h5|h3"
 * component="h1">`, so the *same* role rendered at 30 / 24 / 20 px depending on
 * which page you were on. This component pins one size (MUI `h4` = 24 px) and
 * the standard bottom margin, so the result is one visible change instead of a
 * per-page drift. `color` is optional for the two pages that tint their title
 * gold (Abandoned Carts, Schedule).
 */
export interface AdminPageHeadingProps {
  children: React.ReactNode
  color?: string
}

export function AdminPageHeading({ children, color }: AdminPageHeadingProps) {
  return (
    <Typography variant="h4" component="h1" sx={{ mb: 0.5, color }}>
      {children}
    </Typography>
  )
}