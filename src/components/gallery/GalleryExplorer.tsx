'use client'

import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { DbGalleryItem } from '@/lib/supabase/queries/homepage'
import { brandTokens } from '@/theme/theme'

interface GalleryExplorerProps {
  items: DbGalleryItem[]
}

interface FilterOption {
  value: string
  label: string
}

function deriveTheme(item: DbGalleryItem): string {
  const text = `${item.title} ${item.caption ?? ''}`.toLowerCase()

  if (/wedding|anniversary|love|mr\.|mrs\.|family|home/.test(text)) return 'home-and-gifts'
  if (/halloween|christmas|holiday|ornament|seasonal|pumpkin/.test(text)) return 'seasonal'
  if (/logo|business|brand|menu|office|shop/.test(text)) return 'business'
  if (/dragon|rune|fantasy|myth|castle|arcane/.test(text)) return 'fantasy'
  return 'everyday'
}

function formatTheme(theme: string): string {
  switch (theme) {
    case 'home-and-gifts':
      return 'Home & Gifts'
    case 'seasonal':
      return 'Seasonal'
    case 'business':
      return 'Business'
    case 'fantasy':
      return 'Fantasy'
    default:
      return 'Everyday'
  }
}

export function GalleryExplorer({ items }: GalleryExplorerProps) {
  const [category, setCategory] = useState('all')
  const [material, setMaterial] = useState('all')
  const [theme, setTheme] = useState('all')

  const categoryOptions: FilterOption[] = useMemo(() => {
    const unique = Array.from(
      new Set(items.map((item) => item.category_display_name).filter(Boolean))
    ) as string[]

    return [
      { value: 'all', label: 'All Categories' },
      ...unique.map((value) => ({ value, label: value })),
    ]
  }, [items])

  const materialOptions: FilterOption[] = useMemo(() => {
    const unique = Array.from(
      new Set(items.map((item) => item.material_used).filter(Boolean))
    ) as string[]

    return [
      { value: 'all', label: 'All Materials' },
      ...unique.map((value) => ({ value, label: value })),
    ]
  }, [items])

  const themeOptions: FilterOption[] = useMemo(() => {
    const unique = Array.from(new Set(items.map((item) => deriveTheme(item))))
    return [
      { value: 'all', label: 'All Themes' },
      ...unique.map((value) => ({ value, label: formatTheme(value) })),
    ]
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const byCategory = category === 'all' || item.category_display_name === category
      const byMaterial = material === 'all' || item.material_used === material
      const byTheme = theme === 'all' || deriveTheme(item) === theme
      return byCategory && byMaterial && byTheme
    })
  }, [items, category, material, theme])

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 1,
          mb: { xs: 2.2, md: 2.8 },
        }}
      >
        <FilterGroup
          title="Category"
          options={categoryOptions}
          selected={category}
          onChange={setCategory}
        />
        <FilterGroup
          title="Material"
          options={materialOptions}
          selected={material}
          onChange={setMaterial}
        />
        <FilterGroup
          title="Theme"
          options={themeOptions}
          selected={theme}
          onChange={setTheme}
        />
      </Box>

      <Typography sx={{ color: alpha(brandTokens.parchment, 0.55), mb: 2, fontSize: '0.85rem' }}>
        {filtered.length} piece{filtered.length !== 1 ? 's' : ''} shown
      </Typography>

      {filtered.length === 0 ? (
        <Box
          sx={{
            p: { xs: 2.2, md: 3 },
            borderRadius: 2,
            border: `1px dashed ${alpha(brandTokens.parchment, 0.18)}`,
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: '2rem', mb: 1 }}>🧭</Typography>
          <Typography variant="h5" sx={{ mb: 0.7 }}>
            No Matches for That Filter Combo
          </Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), fontSize: '0.9rem' }}>
            Try resetting one filter to broaden your view of the gallery.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
            gap: { xs: 2, md: 2.6 },
          }}
        >
          {filtered.map((item) => {
            const themeLabel = formatTheme(deriveTheme(item))
            return (
              <Box
                key={item.id}
                sx={{
                  backgroundColor: alpha(brandTokens.bgSurface, 0.75),
                  border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    aspectRatio: '4/3',
                    background: item.gradient || `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {item.media_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.media_url}
                      alt={item.media_alt || item.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: '3rem', opacity: 0.65 }} aria-hidden="true">
                      {item.emoji || '✨'}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ p: { xs: 1.6, md: 1.9 } }}>
                  <Typography variant="h6" component="h3" sx={{ mb: 0.65, fontSize: '1rem' }}>
                    {item.title}
                  </Typography>

                  {item.caption && (
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.82rem', mb: 1.2 }}>
                      {item.caption}
                    </Typography>
                  )}

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                    {item.category_display_name && <Tag>{item.category_display_name}</Tag>}
                    {item.material_used && <Tag>{item.material_used}</Tag>}
                    <Tag>{themeLabel}</Tag>
                  </Box>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

function FilterGroup({
  title,
  options,
  selected,
  onChange,
}: {
  title: string
  options: FilterOption[]
  selected: string
  onChange: (value: string) => void
}) {
  return (
    <Box
      sx={{
        border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
        borderRadius: 1.2,
        backgroundColor: alpha(brandTokens.bgSurface, 0.55),
        p: 1,
      }}
    >
      <Typography sx={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: alpha(brandTokens.parchment, 0.55), mb: 0.8 }}>
        {title}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {options.map((opt) => {
          const active = selected === opt.value
          return (
            <Box
              key={opt.value}
              component="button"
              type="button"
              onClick={() => onChange(opt.value)}
              sx={{
                border: `1px solid ${alpha(brandTokens.parchment, active ? 0.35 : 0.15)}`,
                backgroundColor: active
                  ? alpha(brandTokens.forgeGold, 0.14)
                  : alpha(brandTokens.parchment, 0.04),
                color: active ? brandTokens.forgeGold : alpha(brandTokens.parchment, 0.75),
                borderRadius: 1,
                px: 0.8,
                py: 0.45,
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        px: 0.55,
        py: 0.26,
        borderRadius: 0.8,
        border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
        color: alpha(brandTokens.parchment, 0.63),
        fontSize: '0.66rem',
      }}
    >
      {children}
    </Box>
  )
}
