'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { getBrowserSupabaseClient } from '@/lib/supabase/browser'
import { brandTokens } from '@/theme/theme'

/**
 * §10.16 — mandatory second factor, TOTP with a manual secret key (no QR).
 * Decides what to show from the factor state: already `aal2` → back to `/admin`;
 * no factor → enrol (show the secret as text, confirm a code); factor present →
 * challenge (just the code).
 */
export function AdminMfaView() {
  const router = useRouter()
  const [mode, setMode] = useState<'loading' | 'enroll' | 'challenge'>('loading')
  const [factorId, setFactorId] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const supabase = getBrowserSupabaseClient()

    async function bootstrap() {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel === 'aal2') {
        router.replace('/admin')
        return
      }

      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp ?? []

      if (totp.length === 0) {
        const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
        if (enrollError || !data) {
          if (!cancelled) setError(enrollError?.message ?? 'Could not start enrolment.')
          return
        }
        if (!cancelled) {
          setFactorId(data.id)
          setSecret(data.totp.secret)
          setMode('enroll')
        }
      } else if (!cancelled) {
        setFactorId(totp[0].id)
        setMode('challenge')
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [router])

  async function verify(codeToVerify: string) {
    if (!factorId || !/^\d{6}$/.test(codeToVerify)) return
    setBusy(true)
    setError('')
    const supabase = getBrowserSupabaseClient()

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError || !challenge) {
      setError(challengeError?.message ?? 'Could not start the challenge.')
      setBusy(false)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: codeToVerify,
    })
    if (verifyError) {
      setError(verifyError.message)
      setBusy(false)
      return
    }

    router.replace('/admin')
    router.refresh()
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" sx={{ mb: 0.75 }}>
        Two-factor authentication
      </Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), mb: 3 }}>
        {mode === 'enroll'
          ? 'Mandatory for admin access. Add this account to an authenticator app, then confirm the code.'
          : 'Enter the 6-digit code from your authenticator to continue.'}
      </Typography>

      {mode === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {mode === 'enroll' && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box>
            <Typography variant="overline" sx={{ color: brandTokens.forgeGold, display: 'block', mb: 0.5 }}>
              Secret key (type it into your authenticator)
            </Typography>
            <Box
              sx={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.9rem',
                letterSpacing: '0.05em',
                wordBreak: 'break-all',
                p: 1.5,
                borderRadius: 1,
                border: `1px dashed ${alpha(brandTokens.forgeGold, 0.4)}`,
                background: alpha(brandTokens.bgVoid, 0.6),
                color: brandTokens.parchment,
                userSelect: 'all',
              }}
            >
              {secret}
            </Box>
            <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.62), mt: 0.75 }}>
              Any TOTP app works (Google Authenticator, 1Password, Authy…). The key is shown as text on
              purpose — no QR code.
            </Typography>
          </Box>
          <VerificationField code={code} setCode={setCode} busy={busy} onVerify={verify} />
        </Box>
      )}

      {mode === 'challenge' && (
        <VerificationField code={code} setCode={setCode} busy={busy} onVerify={verify} />
      )}

      {error && <Typography sx={{ color: brandTokens.rubyRedText, mt: 2 }}>{error}</Typography>}
    </Box>
  )
}

function VerificationField({
  code,
  setCode,
  busy,
  onVerify,
}: {
  code: string
  setCode: (value: string) => void
  busy: boolean
  onVerify: (code: string) => void
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
      <TextField
        autoFocus
        size="small"
        label="6-digit code"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputProps={{ inputMode: 'numeric', maxLength: 6, 'aria-label': '6-digit code' }}
        sx={{ width: 160 }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void onVerify(code)
        }}
      />
      <Button variant="contained" color="primary" disabled={busy || !/^\d{6}$/.test(code)} onClick={() => void onVerify(code)}>
        {busy ? 'Verifying…' : 'Verify'}
      </Button>
    </Box>
  )
}