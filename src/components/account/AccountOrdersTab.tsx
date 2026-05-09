'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface Order {
  id: string
  status: string
  order_total: number
  created_at: string
  guest_tracking_token: string | null
}

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting Payment',
  paid: 'Payment Received',
  in_production: 'In Production',
  ready_to_ship: 'Ready to Ship',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  awaiting_payment: 'warning',
  paid: 'info',
  in_production: 'primary',
  ready_to_ship: 'success',
  shipped: 'success',
  delivered: 'success',
  cancelled: 'error',
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}

export default function AccountOrdersTab({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <Box sx={{ display: 'grid', gap: 1.5, maxWidth: 600 }}>
        <Typography variant="h6">Order History</Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          You don't have any orders yet. Start shopping and your orders will appear here!
        </Typography>
        <Button variant="contained" href="/shop" sx={{ alignSelf: 'start' }}>
          Browse Shop
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 2.2 }}>
      <Typography variant="h6">Order History</Typography>

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: alpha(brandTokens.parchment, 0.05) }}>
              <TableCell>Order ID</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                  {order.id.slice(0, 8)}
                </TableCell>
                <TableCell>{formatDate(order.created_at)}</TableCell>
                <TableCell>
                  <Chip
                    label={STATUS_LABELS[order.status] || order.status}
                    color={STATUS_COLORS[order.status] || 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">{formatPrice(order.order_total)}</TableCell>
                <TableCell align="center">
                  <Button
                    variant="text"
                    size="small"
                    href={`/orders/${order.id}?access=${order.guest_tracking_token}`}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
