'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Grid from '@mui/material/Grid2'
import Card from '@mui/material/Card'
import CardMedia from '@mui/material/CardMedia'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface WishlistItem {
  id: string
  product: {
    id: string
    title: string
    slug: string
    price: number
    thumbnail?: string
    category: string
    categoryKey?: string
  }
  addedAt: string
}

interface WishlistClientProps {
  initialItems: WishlistItem[]
}

export function WishlistClient({ initialItems }: WishlistClientProps) {
  const router = useRouter()
  const [items, setItems] = useState<WishlistItem[]>(initialItems)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const handleRemove = async (wishlistId: string, productId: string) => {
    setRemovingId(wishlistId)

    try {
      const response = await fetch(`/api/wishlist?productId=${productId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setItems((prev) => prev.filter((item) => item.id !== wishlistId))
      }
    } catch (error) {
      console.error('Failed to remove from wishlist:', error)
    } finally {
      setRemovingId(null)
    }
  }

  const handleViewProduct = (item: WishlistItem) => {
    router.push(`/shop/categories/${item.product.categoryKey}/${item.product.slug}`)
  }

  return (
    <Grid container spacing={2.2}>
      {items.map((item) => (
        <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <Card
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: alpha(brandTokens.parchment, 0.02),
              border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
              transition: 'all 0.3s ease',
              '&:hover': {
                borderColor: brandTokens.rubyRed,
                boxShadow: `0 4px 12px ${alpha(brandTokens.rubyRed, 0.1)}`,
              },
            }}
          >
            {item.product.thumbnail ? (
              <CardMedia
                component="img"
                height={200}
                image={item.product.thumbnail}
                alt={item.product.title}
                sx={{ objectFit: 'cover' }}
              />
            ) : (
              <Box
                sx={{
                  height: 200,
                  backgroundColor: alpha(brandTokens.parchment, 0.08),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.4) }}>
                  No image
                </Typography>
              </Box>
            )}

            <CardContent sx={{ flex: 1, pb: 1 }}>
              <Chip
                label={item.product.category}
                size="small"
                variant="outlined"
                sx={{ mb: 1 }}
              />
              <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
                {item.product.title}
              </Typography>
              <Typography variant="body2" sx={{ color: brandTokens.rubyRed, fontWeight: 600 }}>
                ${item.product.price.toFixed(2)}
              </Typography>
            </CardContent>

            <CardActions sx={{ pt: 0, display: 'flex', gap: 0.5 }}>
              <Button
                size="small"
                fullWidth
                variant="outlined"
                onClick={() => handleViewProduct(item)}
              >
                View Product
              </Button>
              <IconButton
                size="small"
                onClick={() => handleRemove(item.id, item.product.id)}
                disabled={removingId === item.id}
                title="Remove from wishlist"
              >
                {removingId === item.id ? <CircularProgress size={20} /> : <DeleteOutlineIcon fontSize="small" />}
              </IconButton>
            </CardActions>
          </Card>
        </Grid>
      ))}
    </Grid>
  )
}
