'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'

import { Analytics } from '@/lib/analytics/events'

type PathChoice = 'shop' | 'ready_made' | 'custom_order'
type ComplexityChoice = 'simple' | 'custom'
type TimingChoice = 'rush' | 'standard'

function pickPath(complexity: ComplexityChoice, timing: TimingChoice): PathChoice {
  if (complexity === 'custom') return 'custom_order'
  if (timing === 'rush') return 'ready_made'
  return 'shop'
}

export function StartHereChooser() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [complexity, setComplexity] = useState<ComplexityChoice | null>(null)
  const [timing, setTiming] = useState<TimingChoice | null>(null)

  const recommendation = useMemo(() => {
    if (!complexity || !timing) return null
    const path = pickPath(complexity, timing)

    if (path === 'custom_order') {
      return {
        path,
        href: '/custom-orders',
        title: 'Custom Order Request',
        description: 'Best for one-of-a-kind projects, unusual materials, or art that needs consultation first.',
      }
    }

    if (path === 'ready_made') {
      return {
        path,
        href: '/shop/ready-made',
        title: 'Ready-Made Hoard',
        description: 'Best when you need something quickly and want instant availability without design setup.',
      }
    }

    return {
      path,
      href: '/shop',
      title: 'Shop Custom Creations',
      description: 'Best for choosing a product template and applying your own text, options, or uploaded artwork.',
    }
  }, [complexity, timing])

  function resetFlow() {
    setComplexity(null)
    setTiming(null)
  }

  function completeFlow() {
    if (!recommendation) return

    Analytics.startHereCompleted(recommendation.path)
    Analytics.pathChosen(recommendation.path)

    setOpen(false)
    router.push(recommendation.href)
  }

  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)} endIcon={<ArrowForwardIcon />}>
        Not Sure? Start Here
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Find Your Best Order Path</DialogTitle>
        <DialogContent sx={{ pt: 1, display: 'grid', gap: 2 }}>
          <Box>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>1. How complex is your idea?</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label="Simple personalization"
                color={complexity === 'simple' ? 'primary' : 'default'}
                onClick={() => {
                  setComplexity('simple')
                  Analytics.startHereStepCompleted('complexity', 'simple')
                }}
                clickable
              />
              <Chip
                label="Custom/consult needed"
                color={complexity === 'custom' ? 'primary' : 'default'}
                onClick={() => {
                  setComplexity('custom')
                  Analytics.startHereStepCompleted('complexity', 'custom')
                }}
                clickable
              />
            </Stack>
          </Box>

          <Box>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>2. How fast do you need it?</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label="As fast as possible"
                color={timing === 'rush' ? 'primary' : 'default'}
                onClick={() => {
                  setTiming('rush')
                  Analytics.startHereStepCompleted('timing', 'rush')
                }}
                clickable
              />
              <Chip
                label="Standard timing is fine"
                color={timing === 'standard' ? 'primary' : 'default'}
                onClick={() => {
                  setTiming('standard')
                  Analytics.startHereStepCompleted('timing', 'standard')
                }}
                clickable
              />
            </Stack>
          </Box>

          {recommendation && (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.5 }}>
              <Typography sx={{ fontWeight: 700, mb: 0.4 }}>
                Recommended: {recommendation.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {recommendation.description}
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={resetFlow}>Reset</Button>
          <Button onClick={() => setOpen(false)}>Close</Button>
          <Button variant="contained" onClick={completeFlow} disabled={!recommendation}>
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
