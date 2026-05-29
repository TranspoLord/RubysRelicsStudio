'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemAvatar from '@mui/material/ListItemAvatar'
import Avatar from '@mui/material/Avatar'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface SearchResult {
  id: string
  title: string
  slug: string
  description?: string
  price: number
  thumbnail?: string
  category: string
  categoryKey?: string
  categorySlug?: string
}

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`)
        const data = await response.json()
        setResults(data.results || [])
      } catch (error) {
        console.error('Search error:', error)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300) // Debounce

    return () => clearTimeout(timer)
  }, [query])

  const handleSelectResult = (result: SearchResult) => {
    onClose()
    setQuery('')
    setResults([])
    if (result.categorySlug) {
      router.push(`/shop/categories/${result.categorySlug}/${result.slug}`)
      return
    }

    if (result.categoryKey) {
      router.push(`/shop/categories/${result.categoryKey}/${result.slug}`)
      return
    }

    router.push('/shop')
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ p: 2, borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.2)}` }}>
          <TextField
            fullWidth
            placeholder="Search products, materials, tags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            InputProps={{
              endAdornment: loading ? <CircularProgress size={20} /> : null,
            }}
          />
        </Box>

        {query.length < 2 ? (
          <Box sx={{ p: 2, textAlign: 'center', color: alpha(brandTokens.parchment, 0.65) }}>
            <Typography variant="body2">Type at least 2 characters to search</Typography>
          </Box>
        ) : results.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center', color: alpha(brandTokens.parchment, 0.65) }}>
            <Typography variant="body2">{loading ? 'Searching...' : 'No results found'}</Typography>
          </Box>
        ) : (
          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {results.map((result) => (
              <ListItemButton
                key={result.id}
                onClick={() => handleSelectResult(result)}
                sx={{
                  py: 1.5,
                  '&:hover': { backgroundColor: alpha(brandTokens.parchment, 0.05) },
                }}
              >
                <ListItemAvatar sx={{ mr: 1.5 }}>
                  {result.thumbnail ? (
                    <Avatar
                      src={result.thumbnail}
                      alt={result.title}
                      variant="rounded"
                      sx={{ width: 48, height: 48 }}
                    />
                  ) : (
                    <Avatar variant="rounded" sx={{ width: 48, height: 48, backgroundColor: alpha(brandTokens.parchment, 0.1) }} />
                  )}
                </ListItemAvatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.25 }}>
                    {result.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.65), display: 'block', mb: 0.5 }}>
                    {result.category}
                  </Typography>
                  {result.description && (
                    <Typography
                      variant="caption"
                      sx={{ color: alpha(brandTokens.parchment, 0.55), display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {result.description}
                    </Typography>
                  )}
                </Box>

                <Typography variant="subtitle2" sx={{ ml: 1, fontWeight: 600 }}>
                  ${result.price.toFixed(2)}
                </Typography>
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  )
}
