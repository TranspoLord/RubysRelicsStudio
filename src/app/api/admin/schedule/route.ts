import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// /api/admin/schedule
//
// GET    — list schedule blocks (optionally filtered by date range or order)
// POST   — create a new block
// PATCH  — update an existing block
// DELETE — remove a block (only if not locked)
// ---------------------------------------------------------------------------

type Stage = 'design' | 'setup' | 'production' | 'finishing' | 'packing'
const STAGES: Stage[] = ['design', 'setup', 'production', 'finishing', 'packing']

function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && STAGES.includes(value as Stage)
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asNullableString(value: unknown, maxLen: number): string | null {
  const s = asString(value, maxLen)
  return s.length > 0 ? s : null
}

function asIso(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function asPositiveNumber(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request)
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = new URL(request.url)
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const orderId = searchParams.get('orderId')
  const stageParam = searchParams.get('stage')
  const limitParam = searchParams.get('limit') ?? '200'
  const limit = Math.min(500, Math.max(1, Number.parseInt(limitParam, 10) || 200))

  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('exp_machine_schedule_blocks')
    .select(`
      id,
      order_id,
      order_item_id,
      custom_request_id,
      stage,
      start_at,
      end_at,
      estimated_hours,
      is_locked,
      note,
      created_by,
      created_at,
      updated_at,
      exp_orders ( id, status ),
      exp_custom_requests ( id, status, customer_email )
    `)
    .order('start_at', { ascending: true })
    .limit(limit)

  if (fromParam) {
    const from = asIso(fromParam)
    if (from) query = query.gte('start_at', from)
  }

  if (toParam) {
    const to = asIso(toParam)
    if (to) query = query.lte('end_at', to)
  }

  if (orderId) {
    query = query.eq('order_id', orderId)
  }

  if (stageParam && isStage(stageParam)) {
    query = query.eq('stage', stageParam)
  }

  const { data, error } = await query

  if (error) {
    console.error('[admin:schedule:get]', error.message)
    return NextResponse.json({ error: 'Failed to load schedule.' }, { status: 500 })
  }

  return NextResponse.json({ blocks: data ?? [] }, { status: 200 })
}

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request)
  if (authResult instanceof NextResponse) return authResult

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!isStage(body.stage)) {
    return NextResponse.json({ error: `stage must be one of: ${STAGES.join(', ')}.` }, { status: 400 })
  }

  const startAt = asIso(body.startAt)
  const endAt = asIso(body.endAt)

  if (!startAt || !endAt) {
    return NextResponse.json({ error: 'startAt and endAt must be valid ISO timestamps.' }, { status: 400 })
  }

  if (new Date(endAt) <= new Date(startAt)) {
    return NextResponse.json({ error: 'endAt must be after startAt.' }, { status: 400 })
  }

  const estimatedHours = asPositiveNumber(body.estimatedHours)
  if (estimatedHours === null) {
    return NextResponse.json({ error: 'estimatedHours must be a positive number.' }, { status: 400 })
  }

  const orderId = asNullableString(body.orderId, 64)
  const orderItemId = asNullableString(body.orderItemId, 64)
  const customRequestId = asNullableString(body.customRequestId, 64)
  const note = asNullableString(body.note, 2000)

  if (!orderId && !customRequestId) {
    return NextResponse.json({ error: 'Either orderId or customRequestId is required.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: inserted, error } = await supabase
    .from('exp_machine_schedule_blocks')
    .insert({
      order_id: orderId,
      order_item_id: orderItemId,
      custom_request_id: customRequestId,
      stage: body.stage,
      start_at: startAt,
      end_at: endAt,
      estimated_hours: estimatedHours,
      is_locked: false,
      note,
      created_by: 'admin',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[admin:schedule:post]', error.message)
    return NextResponse.json({ error: 'Failed to create schedule block.' }, { status: 500 })
  }

  await writeAdminAuditLog({
    action: 'schedule_block_created',
    entityType: 'exp_machine_schedule_blocks',
    entityId: inserted.id,
    route: '/api/admin/schedule',
    request,
    status: 'success',
    details: {
      stage: body.stage,
      order_id: orderId,
      custom_request_id: customRequestId,
      start_at: startAt,
      end_at: endAt,
    },
  })

  return NextResponse.json({ id: inserted.id }, { status: 201 })
}

export async function PATCH(request: Request) {
  const authResult = await requireAdminApiSession(request)
  if (authResult instanceof NextResponse) return authResult

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const id = asNullableString(body.id, 64)
  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: existing, error: fetchError } = await supabase
    .from('exp_machine_schedule_blocks')
    .select('id, is_locked')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Schedule block not found.' }, { status: 404 })
  }

  if (existing.is_locked && body.is_locked !== false) {
    return NextResponse.json({ error: 'Block is locked and cannot be modified.' }, { status: 409 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.startAt !== undefined) {
    const startAt = asIso(body.startAt)
    if (!startAt) return NextResponse.json({ error: 'Invalid startAt.' }, { status: 400 })
    patch.start_at = startAt
  }

  if (body.endAt !== undefined) {
    const endAt = asIso(body.endAt)
    if (!endAt) return NextResponse.json({ error: 'Invalid endAt.' }, { status: 400 })
    patch.end_at = endAt
  }

  if (patch.start_at && patch.end_at) {
    if (new Date(patch.end_at as string) <= new Date(patch.start_at as string)) {
      return NextResponse.json({ error: 'endAt must be after startAt.' }, { status: 400 })
    }
  }

  if (body.estimatedHours !== undefined) {
    const h = asPositiveNumber(body.estimatedHours)
    if (h === null) return NextResponse.json({ error: 'Invalid estimatedHours.' }, { status: 400 })
    patch.estimated_hours = h
  }

  if (body.stage !== undefined) {
    if (!isStage(body.stage)) return NextResponse.json({ error: `Invalid stage.` }, { status: 400 })
    patch.stage = body.stage
  }

  if (body.note !== undefined) {
    patch.note = asNullableString(body.note, 2000)
  }

  if (typeof body.is_locked === 'boolean') {
    patch.is_locked = body.is_locked
  }

  const { error: updateError } = await supabase
    .from('exp_machine_schedule_blocks')
    .update(patch)
    .eq('id', id)

  if (updateError) {
    console.error('[admin:schedule:patch]', updateError.message)
    return NextResponse.json({ error: 'Update failed.' }, { status: 500 })
  }

  await writeAdminAuditLog({
    action: 'schedule_block_updated',
    entityType: 'exp_machine_schedule_blocks',
    entityId: id,
    route: '/api/admin/schedule',
    request,
    status: 'success',
    details: patch,
  })

  return NextResponse.json({ updated: true }, { status: 200 })
}

export async function DELETE(request: Request) {
  const authResult = await requireAdminApiSession(request)
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: existing, error: fetchError } = await supabase
    .from('exp_machine_schedule_blocks')
    .select('id, is_locked')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Schedule block not found.' }, { status: 404 })
  }

  if (existing.is_locked) {
    return NextResponse.json({ error: 'Locked blocks cannot be deleted.' }, { status: 409 })
  }

  const { error: deleteError } = await supabase
    .from('exp_machine_schedule_blocks')
    .delete()
    .eq('id', id)

  if (deleteError) {
    console.error('[admin:schedule:delete]', deleteError.message)
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 })
  }

  await writeAdminAuditLog({
    action: 'schedule_block_deleted',
    entityType: 'exp_machine_schedule_blocks',
    entityId: id,
    route: '/api/admin/schedule',
    request,
    status: 'success',
  })

  return NextResponse.json({ deleted: true }, { status: 200 })
}
