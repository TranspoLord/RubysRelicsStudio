'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'

/**
 * OCT #28 / #23: the one confirmation dialog for irreversible admin actions.
 *
 * "Send Quote" creates a Square payment link and emails a customer, and
 * "Cancel Order" / "Mark Refunded" cannot be undone — all three used to be a
 * single click. Focus starts on Cancel so an accidental Enter cannot confirm.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  busy?: boolean
  confirmDisabled?: boolean
  children?: ReactNode
  onConfirm: () => void
  onClose: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      aria-labelledby="confirm-dialog-title"
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        {body ? <Typography sx={{ mb: children ? 1.5 : 0 }}>{body}</Typography> : null}
        {children}
      </DialogContent>
      <DialogActions>
        <Button ref={cancelRef} onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
          variant="contained"
          color={tone === 'danger' ? 'error' : 'primary'}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
