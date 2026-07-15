'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Box, Typography, Paper, Chip } from '@mui/material'
import { brandTokens } from '@/theme/theme'
import { alpha } from '@mui/material/styles'
import { RubyMascot } from '@/components/mascot/RubyMascot'

interface CommissionQueueItem {
  order_id: string
  item_id: string
  product_title: string
  variant_label: string
  display_name: string
  status: string
  nfc_target_data: string | null
  leave_unlocked: boolean
  production_estimate_band: string
  order_created_at: string
  paid_at: string | null
}

// Status color mapping
const statusColors: Record<string, string> = {
  awaiting_payment: brandTokens.forgeGold,
  paid: '#4CAF50',
  in_production: '#2196F3',
  ready_to_ship: '#FF9800',
  shipped: '#9C27B0',
  delivered: '#4CAF50',
}

export function CommissionQueueTracker() {
  const [queue, setQueue] = useState<CommissionQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadQueue()
    
    // Subscribe to real-time updates on the view
    const channel = supabase
      .channel('commission-queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exp_commission_queue',
        },
        () => loadQueue()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadQueue = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('exp_commission_queue')
        .select('*')
        .order('order_created_at', { ascending: true })

      if (error) throw error
      setQueue(data ?? [])
    } catch (err: any) {
      setError(err.message ?? 'Failed to load commission queue')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.7) }}>
          Loading production queue...
        </Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <RubyMascot placement="commission_flow" mood="thinking" />
        <Typography variant="h4" sx={{ color: brandTokens.parchment }}>
          Production Queue ({queue.length} active)
        </Typography>
      </Box>

      {queue.length === 0 ? (
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            backgroundColor: alpha(brandTokens.bgSurface, 0.5),
            border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
          }}
        >
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>
            No active commissions in the queue.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {queue.map((item) => (
            <Paper
              key={item.item_id}
              sx={{
                p: 2.5,
                backgroundColor: alpha(brandTokens.bgSurface, 0.5),
                border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="h6" sx={{ color: brandTokens.parchment }}>
                    {item.display_name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.6), mt: 0.5 }}>
                    {item.product_title}
                    {item.variant_label && ` · ${item.variant_label}`}
                  </Typography>
                  {item.nfc_target_data && (
                    <Typography
                      variant="caption"
                      sx={{ color: alpha(brandTokens.parchment, 0.5), display: 'block', mt: 1 }}
                    >
                      NFC: {item.nfc_target_data}
                      {item.leave_unlocked && ' (unlocked)'}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label={item.status.replace(/_/g, ' ')}
                  size="small"
                  sx={{
                    backgroundColor: alpha(statusColors[item.status] ?? brandTokens.forgeGold, 0.2),
                    color: statusColors[item.status] ?? brandTokens.parchment,
                    textTransform: 'capitalize',
                  }}
                />
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  )
}