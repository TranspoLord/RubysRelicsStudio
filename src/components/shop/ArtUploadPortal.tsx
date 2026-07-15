'use client'

import { useState, useCallback } from 'react'
import { Box, Typography, Button, Alert, LinearProgress } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'
import { RubyMascot } from '@/components/mascot/RubyMascot'
import { supabase } from '@/lib/supabase/client'

interface ArtUploadPortalProps {
  orderId?: string
  onUploadComplete?: (url: string) => void
  maxSizeMB?: number
  acceptedTypes?: string[]
}

export function ArtUploadPortal({
  orderId,
  onUploadComplete,
  maxSizeMB = 20,
  acceptedTypes = ['image/svg+xml', 'image/png', 'image/jpeg'],
}: ArtUploadPortalProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      setError(null)

      const file = e.dataTransfer.files[0]
      if (!file) return

      await uploadFile(file)
    },
    [orderId]
  )

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    await uploadFile(file)
  }

  const uploadFile = async (file: File) => {
    // Validate file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File exceeds ${maxSizeMB}MB limit`)
      return
    }

    // Validate file type
    if (!acceptedTypes.some((type) => file.type === type || file.type.includes('svg'))) {
      setError('Invalid file type. Accepted: SVG, PNG, JPG')
      return
    }

    setUploading(true)
    setError(null)

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${orderId ?? 'anonymous'}/${crypto.randomUUID()}.${fileExt}`

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('customer-artwork')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('customer-artwork')
        .getPublicUrl(fileName)

      const publicUrl = urlData.publicUrl
      setUploadedUrl(publicUrl)

      // Store in order items if orderId provided
      if (orderId) {
        await supabase
          .from('exp_order_items')
          .update({ source_file_url: publicUrl })
          .eq('order_id', orderId)
      }

      onUploadComplete?.(publicUrl)
    } catch (err: any) {
      setError(err.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <RubyMascot placement="file_upload" mood="neutral" />
        <Typography variant="h6" sx={{ color: brandTokens.parchment }}>
          Artwork Upload
        </Typography>
      </Box>

      <Box
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          border: `2px dashed ${isDragging ? brandTokens.forgeGold : alpha(brandTokens.parchment, 0.3)}`,
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          backgroundColor: isDragging
            ? alpha(brandTokens.forgeGold, 0.05)
            : alpha(brandTokens.bgSurface, 0.3),
          transition: 'border-color 0.2s, background-color 0.2s',
          cursor: 'pointer',
        }}
      >
        <input
          type="file"
          id="art-upload-input"
          hidden
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          disabled={uploading}
        />
        <label htmlFor="art-upload-input">
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Typography variant="body1" sx={{ color: brandTokens.parchment }}>
              {uploadedUrl ? 'Replace artwork' : 'Drop artwork here or click to upload'}
            </Typography>
            <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.5) }}>
              SVG, PNG, JPG up to {maxSizeMB}MB
            </Typography>
            <Button
              variant="outlined"
              component="span"
              disabled={uploading}
              sx={{
                mt: 1,
                borderColor: alpha(brandTokens.parchment, 0.3),
                color: brandTokens.parchment,
              }}
            >
              Choose File
            </Button>
          </Box>
        </label>
      </Box>

      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress
            sx={{
              backgroundColor: alpha(brandTokens.parchment, 0.1),
              '& .MuiLinearProgress-bar': { backgroundColor: brandTokens.forgeGold },
            }}
          />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {uploadedUrl && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Upload complete! Your artwork has been received.
        </Alert>
      )}
    </Box>
  )
}