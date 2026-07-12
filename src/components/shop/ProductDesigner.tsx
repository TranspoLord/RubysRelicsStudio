'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import TextFormatIcon from '@mui/icons-material/TextFormat'
import DeleteIcon from '@mui/icons-material/Delete'
import { Stage, Layer, Image as KonvaImage, Text as KonvaText, Transformer } from 'react-konva'

import { brandTokens } from '@/theme/theme'
import type { DbProductOption } from '@/lib/supabase/queries/products'

// Inches to pixels conversion (96 DPI standard)
const INCH_TO_PX = 96

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DesignerElement {
  id: string
  type: 'image' | 'text'
  x: number
  y: number
  width?: number
  height?: number
  rotation?: number
  // Image-specific
  src?: string
  // Text-specific
  text?: string
  fontSize?: number
  fill?: string
  fontFamily?: string
  // Constraints from option
  optionId?: string
  zIndex?: number
}

export interface ProductDesignerProps {
  open: boolean
  onClose: () => void
  mockupUrl: string
  options: DbProductOption[]
  onSave: (elements: DesignerElement[]) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductDesigner({ open, onClose, mockupUrl, options, onSave }: ProductDesignerProps) {
  const [elements, setElements] = useState<DesignerElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mockupImg, setMockupImg] = useState<HTMLImageElement | null>(null)
  const [elementImages, setElementImages] = useState<Record<string, HTMLImageElement>>({})

  // Load mockup image
  useEffect(() => {
    if (!mockupUrl) return
    const img = new window.Image()
    img.src = mockupUrl
    img.onload = () => setMockupImg(img)
  }, [mockupUrl])

  // Load element images
  useEffect(() => {
    elements.forEach(el => {
      if (el.type === 'image' && el.src && !elementImages[el.id]) {
        const img = new window.Image()
        img.src = el.src
        img.onload = () => setElementImages(prev => ({ ...prev, [el.id]: img }))
      }
    })
  }, [elements, elementImages])

  // Reset on close - intentional cleanup when modal closes
  useEffect(() => {
    if (!open) {
      setElements([])
      setSelectedId(null)
      setElementImages({})
    }
  }, [open])

  const handleAddImage = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      const formData = new FormData()
      formData.set('file', file)
      const res = await fetch('/api/admin/homepage/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        const newElement: DesignerElement = {
          id: `img_${Date.now()}`,
          type: 'image',
          src: data.url,
          x: 100,
          y: 100,
          width: Math.min(2 * INCH_TO_PX, 300),
          height: Math.min(2 * INCH_TO_PX, 300),
          rotation: 0,
          zIndex: elements.length,
        }
        setElements(prev => [...prev, newElement])
        setSelectedId(newElement.id)
      }
    }
    input.click()
  }, [elements.length])

  const handleAddText = useCallback(() => {
    const newElement: DesignerElement = {
      id: `text_${Date.now()}`,
      type: 'text',
      text: 'Your text here',
      x: 100,
      y: 100,
      fontSize: 24,
      fill: '#000000',
      fontFamily: 'sans-serif',
      rotation: 0,
      zIndex: elements.length,
    }
    setElements(prev => [...prev, newElement])
    setSelectedId(newElement.id)
  }, [elements.length])

  const handleUpdateElement = useCallback((id: string, updates: Partial<DesignerElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el))
  }, [])

  const handleDeleteElement = useCallback(() => {
    setElements(prev => prev.filter(el => el.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  const handleSave = useCallback(() => {
    onSave(elements)
    onClose()
  }, [elements, onClose, onSave])

  const selectedElement = elements.find(e => e.id === selectedId)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Customize Your Design</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          {/* Designer Toolbar */}
          <Box sx={{ width: { xs: '100%', md: 220 }, flexShrink: 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Add Elements</Typography>
            <Stack spacing={1}>
              <Button
                variant="outlined"
                startIcon={<AddPhotoAlternateIcon />}
                onClick={handleAddImage}
                fullWidth
              >
                Add Image
              </Button>
              <Button
                variant="outlined"
                startIcon={<TextFormatIcon />}
                onClick={handleAddText}
                fullWidth
              >
                Add Text
              </Button>

              {selectedElement && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Selected Element</Typography>
                  
                  {selectedElement.type === 'text' && (
                    <Stack spacing={1}>
                      <TextField
                        label="Text"
                        value={selectedElement.text}
                        onChange={(e) => handleUpdateElement(selectedElement.id, { text: e.target.value })}
                        size="small"
                        fullWidth
                      />
                      <TextField
                        label="Font size"
                        type="number"
                        value={selectedElement.fontSize}
                        onChange={(e) => handleUpdateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                        size="small"
                        fullWidth
                      />
                    </Stack>
                  )}

                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={handleDeleteElement}
                    fullWidth
                    sx={{ mt: 1 }}
                  >
                    Delete Element
                  </Button>
                </Box>
              )}
            </Stack>
          </Box>

          {/* Canvas Area */}
          <Box sx={{ flex: 1, backgroundColor: brandTokens.bgVoid, borderRadius: 2, p: 2 }}>
            <Stage width={500} height={500}>
              <Layer>
                {mockupImg && (
                  <KonvaImage image={mockupImg} x={0} y={0} width={500} height={500} />
                )}
              </Layer>
              <Layer>
                {elements.map((element) => {
                  if (element.type === 'image') {
                    const img = elementImages[element.id]
                    return img ? (
                      <KonvaImage
                        key={element.id}
                        image={img}
                        x={element.x}
                        y={element.y}
                        width={element.width}
                        height={element.height}
                        rotation={element.rotation}
                        draggable
                        onClick={() => setSelectedId(element.id)}
                        onDragEnd={(e) => handleUpdateElement(element.id, { x: e.target.x(), y: e.target.y() })}
                      />
                    ) : null
                  }
                  if (element.type === 'text') {
                    return (
                      <KonvaText
                        key={element.id}
                        text={element.text}
                        x={element.x}
                        y={element.y}
                        fontSize={element.fontSize}
                        fill={element.fill}
                        fontFamily={element.fontFamily}
                        rotation={element.rotation}
                        draggable
                        onClick={() => setSelectedId(element.id)}
                        onDragEnd={(e) => handleUpdateElement(element.id, { x: e.target.x(), y: e.target.y() })}
                      />
                    )
                  }
                  return null
                })}
                {selectedElement && (
                  <Transformer
                    rotateEnabled
                    enabledAnchors={['tl', 'tr', 'bl', 'br', 'top-center', 'bottom-center', 'middle-left', 'middle-right']}
                  />
                )}
              </Layer>
            </Stage>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save Design</Button>
      </DialogActions>
    </Dialog>
  )
}