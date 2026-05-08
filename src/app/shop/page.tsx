import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { ShopOrderPaths } from '@/components/shop/ShopOrderPaths'
import { getCategories } from '@/lib/supabase/queries/homepage'
import { getProductCountsByCategory } from '@/lib/supabase/queries/products'
import { brandTokens } from '@/theme/theme'

export const dynamic = 'force-dynamic'

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function ShopPage() {
  const [categories, productCounts] = await Promise.all([
    getCategories(),
    getProductCountsByCategory(),
  ])

  return (
    <>
      <Header currentPath="/shop" />
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Shop' }]} />

      <Box component="main" id="main-content">
        {/* ── Page header ───────────────────────────────────────────────── */}
        <Box
          sx={{
            background: `linear-gradient(180deg, ${alpha(brandTokens.bgSurface, 0.9)} 0%, ${brandTokens.bgVoid} 100%)`,
            borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
            pt: { xs: 5, md: 7 },
            pb: { xs: 4, md: 6 },
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography
              component="p"
              variant="overline"
              sx={{ color: brandTokens.forgeGold, mb: 1.5, display: 'block' }}
            >
              The Hoard Awaits
            </Typography>
            <Typography variant="h1" component="h1" gutterBottom>
              Shop the Hoard
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: alpha(brandTokens.parchment, 0.7), maxWidth: 600, mx: 'auto' }}
            >
              Every piece is made to order by one dragon with a laser. Choose from customizable
              products, grab something from the ready-made hoard, or bring us your wildest idea.
            </Typography>
          </Container>
        </Box>

        {/* ── 3-path selector ───────────────────────────────────────────── */}
        <Box
          sx={{
            py: { xs: 5, md: 7 },
            background: brandTokens.bgVoid,
          }}
        >
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              sx={{ textAlign: 'center', mb: { xs: 3, md: 5 } }}
            >
              How Would You Like to Order?
            </Typography>
            <ShopOrderPaths />
          </Container>
        </Box>

        {/* ── Category grid ─────────────────────────────────────────────── */}
        <Box
          id="categories"
          sx={{
            py: { xs: 5, md: 8 },
            background: `linear-gradient(180deg, ${brandTokens.bgVoid} 0%, ${alpha(brandTokens.bgSurface, 0.5)} 100%)`,
            borderTop: `1px solid ${alpha(brandTokens.parchment, 0.06)}`,
          }}
        >
          <Container maxWidth="lg">
            <Typography
              component="p"
              variant="overline"
              sx={{ color: brandTokens.forgeGold, mb: 1.5, display: 'block', textAlign: 'center' }}
            >
              Browse by Craft
            </Typography>
            <Typography variant="h2" component="h2" sx={{ textAlign: 'center', mb: { xs: 3, md: 5 } }}>
              Choose Your Category or Shop All
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, 1fr)',
                  sm: 'repeat(3, 1fr)',
                  lg: 'repeat(4, 1fr)',
                },
                gap: { xs: 2, md: 3 },
              }}
            >
              {categories.map((cat) => {
                const count = productCounts[cat.key] ?? 0
                return (
                  <CategoryCard
                    key={cat.key}
                    category={cat}
                    productCount={count}
                  />
                )
              })}
            </Box>

            <Box sx={{ mt: { xs: 3, md: 4 }, display: 'flex', justifyContent: 'center' }}>
              <Box
                component="a"
                href="/shop/all"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  px: { xs: 3, md: 4 },
                  py: { xs: 1.4, md: 1.6 },
                  borderRadius: 1.5,
                  background: `linear-gradient(135deg, ${alpha(brandTokens.forgeGold, 0.25)} 0%, ${alpha(brandTokens.forgeGold, 0.12)} 100%)`,
                  border: `1px solid ${alpha(brandTokens.forgeGold, 0.45)}`,
                  boxShadow: `0 10px 28px ${alpha(brandTokens.forgeGold, 0.15)}`,
                  color: brandTokens.forgeGold,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  fontSize: { xs: '0.85rem', md: '0.92rem' },
                  textTransform: 'uppercase',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 14px 34px ${alpha(brandTokens.forgeGold, 0.22)}`,
                    borderColor: alpha(brandTokens.forgeGold, 0.65),
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    transition: 'none',
                    '&:hover': { transform: 'none' },
                  },
                }}
              >
                Shop All Products
              </Box>
            </Box>

            <Typography
              variant="body2"
              sx={{
                mt: 1.25,
                textAlign: 'center',
                color: alpha(brandTokens.parchment, 0.52),
                fontSize: '0.8rem',
              }}
            >
              Prefer a full-catalog view? Shop everything at once.
            </Typography>
          </Container>
        </Box>

        {/* ── Trust strip ───────────────────────────────────────────────── */}
        <TrustStrip />
      </Box>

      <Footer />
    </>
  )
}

// ─── Category card (client interaction handled inline via Link) ────────────────

interface CategoryCardProps {
  category: {
    key: string
    display_name: string
    slug: string
    tagline?: string | null
    emoji?: string | null
    gradient?: string | null
    glow_color?: string | null
  }
  productCount: number
}

function CategoryCard({ category, productCount }: CategoryCardProps) {
  const gradient = category.gradient ?? 'linear-gradient(135deg, #1C1200, #2A1A00)'
  const glowColor = category.glow_color ?? brandTokens.forgeGold

  return (
    <Box
      component="a"
      href={`/shop/categories/${category.slug}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        background: gradient,
        border: `1px solid ${alpha(glowColor, 0.2)}`,
        borderRadius: 2,
        p: { xs: 2.5, md: 3 },
        textDecoration: 'none',
        color: 'inherit',
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
        minHeight: { xs: 140, md: 160 },
        '&:hover': {
          transform: 'translateY(-4px) scale(1.01)',
          boxShadow: `0 12px 40px ${alpha(glowColor, 0.22)}`,
          borderColor: alpha(glowColor, 0.45),
        },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&:hover': { transform: 'none' },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, lineHeight: 1 }}>
          {category.emoji ?? '✨'}
        </Typography>
        {productCount > 0 && (
          <Typography
            variant="caption"
            sx={{
              color: alpha(brandTokens.parchment, 0.45),
              fontSize: '0.65rem',
              letterSpacing: '0.06em',
            }}
          >
            {productCount} item{productCount !== 1 ? 's' : ''}
          </Typography>
        )}
      </Box>

      <Typography
        variant="h6"
        component="h3"
        sx={{ mb: 0.5, fontSize: { xs: '0.9rem', md: '1rem' } }}
      >
        {category.display_name}
      </Typography>

      {category.tagline && (
        <Typography
          variant="body2"
          sx={{
            color: alpha(brandTokens.parchment, 0.55),
            fontSize: '0.75rem',
            lineHeight: 1.5,
            mt: 'auto',
            pt: 0.5,
          }}
        >
          {category.tagline}
        </Typography>
      )}
    </Box>
  )
}

// ─── Trust strip ──────────────────────────────────────────────────────────────

const TRUST_ITEMS = [
  { emoji: '🐉', label: 'One-Dragon Studio', detail: 'Every piece made by hand' },
  { emoji: '⚡', label: 'Made to Order', detail: 'Nothing sits in a warehouse' },
  { emoji: '🛡️', label: 'Quality Check', detail: 'Reviewed before it ships' },
  { emoji: '📦', label: 'Safe Packaging', detail: 'Arrives intact or we fix it' },
]

function TrustStrip() {
  return (
    <Box
      sx={{
        py: { xs: 4, md: 5 },
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
        backgroundColor: alpha(brandTokens.bgSurface, 0.5),
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: { xs: 3, md: 4 },
          }}
        >
          {TRUST_ITEMS.map(({ emoji, label, detail }) => (
            <Box key={label} sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.75rem', mb: 0.75, display: 'block' }}>{emoji}</Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, color: brandTokens.parchment, mb: 0.25 }}
              >
                {label}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: alpha(brandTokens.parchment, 0.5), fontSize: '0.72rem', textTransform: 'none' }}
              >
                {detail}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  )
}
