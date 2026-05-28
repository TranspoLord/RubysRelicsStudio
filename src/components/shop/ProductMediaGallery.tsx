'use client'

import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface ProductMediaItem {
  id: string
  url: string
  alt: string
  emoji: string | null
  gradient: string | null
  is_featured: boolean
}

interface ProductMediaGalleryProps {
  productTitle: string
  media: ProductMediaItem[]
  fallbackGradient: string
  fallbackEmoji: string
}

export function ProductMediaGallery({
  productTitle,
  media,
  fallbackGradient,
  fallbackEmoji,
}: ProductMediaGalleryProps) {
  const initialIndex = useMemo(() => {
    const featuredIndex = media.findIndex((item) => item.is_featured)
    return featuredIndex >= 0 ? featuredIndex : 0
  }, [media])

  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [zoomOpen, setZoomOpen] = useState(false)

  const active = media[activeIndex] ?? null
  const hasImage = Boolean(active?.url)
  const cardGradient = active?.gradient ?? fallbackGradient
  const imageAlt = active?.alt?.trim() || productTitle

  return (
    <>
      <Box
        sx={{
          aspectRatio: '4/3',
          background: cardGradient,
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 1.4,
          border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
          cursor: hasImage ? 'zoom-in' : 'default',
        }}
        onClick={() => {
          if (hasImage) setZoomOpen(true)
        }}
        role={hasImage ? 'button' : undefined}
        tabIndex={hasImage ? 0 : -1}
        onKeyDown={(event) => {
          if (!hasImage) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setZoomOpen(true)
          }
        }}
        aria-label={hasImage ? `Open enlarged image for ${productTitle}` : undefined}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.url}
            alt={imageAlt}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Typography aria-hidden="true" sx={{ fontSize: '6rem', opacity: 0.5, userSelect: 'none' }}>
            {active?.emoji ?? fallbackEmoji}
          </Typography>
        )}
      </Box>

      {media.length > 1 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
            gap: 1,
          }}
        >
          {media.map((item, index) => {
            const selected = index === activeIndex
            const thumbHasImage = Boolean(item.url)
            const thumbGradient = item.gradient ?? fallbackGradient

            return (
              <Box
                key={item.id}
                component="button"
                type="button"
                onClick={() => setActiveIndex(index)}
                sx={{
                  width: '100%',
                  height: 72,
                  p: 0,
                  borderRadius: 1,
                  background: thumbGradient,
                  overflow: 'hidden',
                  border: `2px solid ${selected ? brandTokens.forgeGold : alpha(brandTokens.parchment, 0.15)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                aria-label={`Select image ${index + 1} for ${productTitle}`}
              >
                {thumbHasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.alt || `${productTitle} thumbnail ${index + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Typography aria-hidden="true" sx={{ fontSize: '1.35rem' }}>
                    {item.emoji ?? fallbackEmoji}
                  </Typography>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      <Dialog
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        maxWidth="lg"
        fullWidth
        aria-labelledby="product-image-zoom-title"
      >
        <Box sx={{ position: 'relative', backgroundColor: brandTokens.bgVoid }}>
          <IconButton
            onClick={() => setZoomOpen(false)}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              zIndex: 2,
              color: brandTokens.parchment,
              background: alpha(brandTokens.bgSurface, 0.7),
            }}
            aria-label="Close enlarged image"
          >
            <CloseIcon />
          </IconButton>

          <Box
            sx={{
              minHeight: { xs: 280, md: 520 },
              maxHeight: '80vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: { xs: 1, md: 2 },
              background: cardGradient,
            }}
          >
            {hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.url}
                alt={imageAlt}
                style={{ maxWidth: '100%', maxHeight: '76vh', objectFit: 'contain' }}
              />
            ) : (
              <Typography aria-hidden="true" sx={{ fontSize: '8rem', opacity: 0.7 }}>
                {active?.emoji ?? fallbackEmoji}
              </Typography>
            )}
          </Box>

          <Box sx={{ px: 2, py: 1.25, borderTop: `1px solid ${alpha(brandTokens.parchment, 0.12)}` }}>
            <Typography id="product-image-zoom-title" sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.75) }}>
              {imageAlt}
            </Typography>
          </Box>
        </Box>
      </Dialog>
    </>
  )
}
