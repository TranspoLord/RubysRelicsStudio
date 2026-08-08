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
import type Konva from 'konva'

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
  uploadToken?: string
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
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Refs for Transformer attachment
  const transformerRef = useRef<Konva.Transformer>(null)
  const shapeRefs = useRef<Record<string, Konva.Image | Konva.Text>>({})

  // Load mockup image
  useEffect(() => {
    if (!mockupUrl) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = mockupUrl
    img.onload = () => setMockupImg(img)
  }, [mockupUrl])

  // Load element images
  useEffect(() => {
    elements.forEach(el => {
      if (el.type === 'image' && el.src && !elementImages[el.id]) {
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
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
      setUploadError(null)
    }
  }, [open])

  // Attach Transformer to the selected shape whenever selection changes
  useEffect(() => {
    if (!transformerRef.current || !selectedId) {
      transformerRef.current?.nodes([])
      return
    }
    const selectedNode = shapeRefs.current[selectedId]
    if (selectedNode) {
      transformerRef.current.nodes([selectedNode])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [selectedId, elements])

  const handleAddImage = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp,image/gif,application/pdf'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      setUploadError(null)
      const formData = new FormData()
      formData.set('file', file)
      const res = await fetch('/api/admin/homepage/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json() as { url?: string; uploadToken?: string; error?: string }
      if (!res.ok || !data.url) {
        setUploadError(data.error ?? 'Failed to upload image.')
        return
      }
      const newElement: DesignerElement = {
        id: `img_${Date.now()}`,
        type: 'image',
        src: data.url,
        uploadToken: data.uploadToken,
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

  // Store refs to Konva nodes so Transformer can attach
  const setShapeRef = useCallback((id: string) => (node: Konva.Image | Konva.Text | null) => {
    if (node) {
      shapeRefs.current[id] = node
    } else {
      delete shapeRefs.current[id]
    }
  }, [])

  const handleTransformEnd = useCallback((id: string, attrs: Partial<DesignerElement>) => {
    // When a Konva transform ends, read the new absolute properties
    const node = shapeRefs.current[id]
    if (!node) return
    const updates: Partial<DesignerElement> = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      ...(node.getClassName() === 'Image' ? {
        width: node.width() * node.scaleX(),
        height: node.height() * node.scaleY(),
      } : {}),
      ...attrs,
    }
    // Reset scale since we baked it into width/height
    if (node.getClassName() === 'Image') {
      node.scaleX(1)
      node.scaleY(1)
    }
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el))
  }, [])

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

              {uploadError && (
                <Typography variant="caption" sx={{ color: '#CF4040', mt: 0.5 }}>
                  {uploadError}
                </Typography>
              )}

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
                  <KonvaImage
                    image={mockupImg}
                    x={0}
                    y={0}
                    width={500}
                    height={500}
                    listening={false}
                  />
                )}
              </Layer>
              <Layer>
                {[...elements]
                  .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                  .map((element) => {
                    if (element.type === 'image') {
                      const img = elementImages[element.id]
                      return img ? (
                        <KonvaImage
                          key={element.id}
                          ref={setShapeRef(element.id)}
                          image={img}
                          x={element.x}
                          y={element.y}
                          width={element.width}
                          height={element.height}
                          rotation={element.rotation}
                          zIndex={element.zIndex}
                          draggable
                          onClick={() => setSelectedId(element.id)}
                          onTap={() => setSelectedId(element.id)}
                          onDragEnd={(e) => handleUpdateElement(element.id, { x: e.target.x(), y: e.target.y() })}
                          onTransformEnd={() => handleTransformEnd(element.id, {})}
                        />
                      ) : null
                    }
                    if (element.type === 'text') {
                      return (
                        <KonvaText
                          key={element.id}
                          ref={setShapeRef(element.id)}
                          text={element.text}
                          x={element.x}
                          y={element.y}
                          fontSize={element.fontSize}
                          fill={element.fill}
                          fontFamily={element.fontFamily}
                          rotation={element.rotation}
                          zIndex={element.zIndex}
                          draggable
                          onClick={() => setSelectedId(element.id)}
                          onTap={() => setSelectedId(element.id)}
                          onDragEnd={(e) => handleUpdateElement(element.id, { x: e.target.x(), y: e.target.y() })}
                          onTransformEnd={() => handleTransformEnd(element.id, {})}
                        />
                      )
                    }
                    return null
                  })}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  enabledAnchors={['tl', 'tr', 'bl', 'br', 'top-center', 'bottom-center', 'middle-left', 'middle-right']}
                  boundBoxFunc={(oldBox, newBox) => {
                    // Prevent the shape from becoming too small
                    if (newBox.width < 10 || newBox.height < 10) return oldBox
                    return newBox
                  }}
                />
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