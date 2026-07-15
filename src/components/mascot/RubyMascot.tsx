'use client'

import { useId } from 'react'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

export type MascotPlacement = 'homepage_welcome' | 'file_upload' | 'commission_flow' | 'checkout' | 'general'

interface RubyMascotProps {
  placement?: MascotPlacement
  size?: number
  mood?: 'happy' | 'thinking' | 'excited' | 'neutral' | 'working'
  message?: string
  animated?: boolean
  sx?: object
}

// Simple dragon head SVG placeholder
const DragonHeadSVG = ({ mood = 'neutral', size = 48 }: { mood?: string; size?: number }) => {
  const eyeOffset = mood === 'excited' ? -2 : mood === 'thinking' ? 1 : 0
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Ruby the dragon mascot"
    >
      {/* Dragon head shape */}
      <path
        d="M32 4C19 4 8 15 8 32C8 49 19 60 32 60C45 60 56 49 56 32C56 15 45 4 32 4Z"
        fill={brandTokens.rubyRed}
        stroke={brandTokens.forgeGold}
        strokeWidth={2}
      />
      {/* Eye */}
      <circle cx={24 + eyeOffset} cy={26} r={3} fill={brandTokens.bgVoid} />
      <circle cx={40 - eyeOffset} cy={26} r={3} fill={brandTokens.bgVoid} />
      {/* Horn */}
      <path d="M20 12L16 2" stroke={brandTokens.rubyRed} strokeWidth={3} strokeLinecap="round" />
      <path d="M44 12L48 2" stroke={brandTokens.rubyRed} strokeWidth={3} strokeLinecap="round" />
      {/* Mouth */}
      <path
        d={mood === 'happy' ? 'M22 42Q32 50 42 42' : 'M24 44H40'}
        stroke={brandTokens.bgVoid}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function RubyMascot({
  placement = 'general',
  size = 48,
  mood = 'neutral',
  message,
  animated = true,
  sx,
}: RubyMascotProps) {
  const uniqueId = useId()

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(animated && {
          animation: 'pulse 3s infinite',
          '@keyframes pulse': {
            '0%': { transform: 'scale(1)' },
            '50%': { transform: 'scale(1.05)' },
            '100%': { transform: 'scale(1)' },
          },
        }),
        ...sx,
      }}
    >
      {message ? (
        <Tooltip title={message} arrow>
          <span>
            <DragonHeadSVG mood={mood} size={size} />
          </span>
        </Tooltip>
      ) : (
        <DragonHeadSVG mood={mood} size={size} />
      )}
    </Box>
  )
}

// Hook to check if mascot is enabled
export function useMascotEnabled(): { enabled: boolean; placementSettings: Record<MascotPlacement, boolean> } {
  // This will be populated from storefront settings
  // For now, default to enabled for all placements
  return {
    enabled: true,
    placementSettings: {
      homepage_welcome: true,
      file_upload: true,
      commission_flow: true,
      checkout: true,
      general: true,
    },
  }
}