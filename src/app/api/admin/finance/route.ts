import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { getSupabaseAdmin } from '@/lib/supabase/client'

type OrderPath = 'shop' | 'ready_made' | 'custom'

type OrderRow = {
  id: string
  order_path: OrderPath
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded'
  order_total: number
  created_at: string
}

type OrderItemRow = {
  id: string
  order_id: string
  product_id: string | null
  product_title: string
  quantity: number
  line_total: number
}

type ProductRow = {
  id: string
  category_key: string
}

type LaborRow = {
  id: string
  order_id: string | null
  order_item_id: string | null
  stage: 'design' | 'setup' | 'production' | 'finishing' | 'packing'
  minutes: number
  hourly_rate: number
  logged_at: string
}

type MaterialUsageRow = {
  id: string
  order_item_id: string
  total_cost_snapshot: number
}

type MachineBlockRow = {
  id: string
  estimated_hours: number
  start_at: string
  end_at: string
  is_locked: boolean
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function parseDate(input: string): Date | null {
  if (!input) return null
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function toIsoDate(date: Date): string {
  return date.toISOString()
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0)
}

function money(value: number): number {
  return Number(value.toFixed(2))
}

function csvEscape(value: string | number): string {
  const text = String(value)
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function formatCsv(input: {
  summary: Record<string, number | string>
  items: Array<Record<string, number | string>>
  laborByStage: Array<Record<string, number | string>>
}): string {
  const lines: string[] = []

  lines.push('section,key,value')
  Object.entries(input.summary).forEach(([key, value]) => {
    lines.push([csvEscape('summary'), csvEscape(key), csvEscape(value)].join(','))
  })

  lines.push('')
  lines.push('item,product_id,product_title,category_key,units,gross_sales,material_cost,gross_margin')
  input.items.forEach((row) => {
    lines.push(
      [
        csvEscape('item'),
        csvEscape(row.product_id),
        csvEscape(row.product_title),
        csvEscape(row.category_key),
        csvEscape(row.units),
        csvEscape(row.gross_sales),
        csvEscape(row.material_cost),
        csvEscape(row.gross_margin),
      ].join(',')
    )
  })

  lines.push('')
  lines.push('labor_stage,minutes,hours,cost')
  input.laborByStage.forEach((row) => {
    lines.push(
      [
        csvEscape(row.stage),
        csvEscape(row.minutes),
        csvEscape(row.hours),
        csvEscape(row.cost),
      ].join(',')
    )
  })

  return lines.join('\n')
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const url = new URL(request.url)

    const format = asString(url.searchParams.get('format'), 12)
    const fromRaw = asString(url.searchParams.get('from'), 40)
    const toRaw = asString(url.searchParams.get('to'), 40)
    const orderPathRaw = asString(url.searchParams.get('orderPath'), 24)
    const categoryKey = asString(url.searchParams.get('categoryKey'), 80)

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - 30)

    const fromDate = parseDate(fromRaw) ?? defaultFrom
    const toDate = parseDate(toRaw) ?? now

    if (toDate < fromDate) {
      return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 })
    }

    let ordersQuery = supabase
      .from('exp_orders')
      .select('id, order_path, payment_status, order_total, created_at')
      .gte('created_at', toIsoDate(fromDate))
      .lte('created_at', toIsoDate(toDate))
      .order('created_at', { ascending: false })

    if (orderPathRaw === 'shop' || orderPathRaw === 'ready_made' || orderPathRaw === 'custom') {
      ordersQuery = ordersQuery.eq('order_path', orderPathRaw)
    }

    const [ordersResult, laborResult, machineResult] = await Promise.all([
      ordersQuery,
      supabase
        .from('exp_labor_time_entries')
        .select('id, order_id, order_item_id, stage, minutes, hourly_rate, logged_at')
        .gte('logged_at', toIsoDate(fromDate))
        .lte('logged_at', toIsoDate(toDate))
        .order('logged_at', { ascending: false }),
      supabase
        .from('exp_machine_schedule_blocks')
        .select('id, estimated_hours, start_at, end_at, is_locked')
        .gte('start_at', toIsoDate(fromDate))
        .lte('start_at', toIsoDate(toDate))
        .order('start_at', { ascending: true }),
    ])

    if (ordersResult.error) {
      console.error('[admin:finance:orders]', ordersResult.error.message)
      return NextResponse.json({ error: 'Could not load finance data.' }, { status: 500 })
    }

    if (laborResult.error) {
      console.error('[admin:finance:labor]', laborResult.error.message)
      return NextResponse.json({ error: 'Could not load labor data.' }, { status: 500 })
    }

    if (machineResult.error) {
      console.error('[admin:finance:machine]', machineResult.error.message)
      return NextResponse.json({ error: 'Could not load machine schedule data.' }, { status: 500 })
    }

    const allOrders = (ordersResult.data ?? []) as OrderRow[]
    const grossEligibleOrders = allOrders.filter((order) =>
      order.payment_status === 'paid' || order.payment_status === 'refunded'
    )

    const refundedOrders = allOrders.filter((order) => order.payment_status === 'refunded')
    const paidOrders = allOrders.filter((order) => order.payment_status === 'paid')

    const orderIds = grossEligibleOrders.map((order) => order.id)

    let items: OrderItemRow[] = []
    let productsById = new Map<string, ProductRow>()
    let materialUsage: MaterialUsageRow[] = []

    if (orderIds.length > 0) {
      const itemsResult = await supabase
        .from('exp_order_items')
        .select('id, order_id, product_id, product_title, quantity, line_total')
        .in('order_id', orderIds)

      if (itemsResult.error) {
        console.error('[admin:finance:items]', itemsResult.error.message)
        return NextResponse.json({ error: 'Could not load finance data.' }, { status: 500 })
      }

      items = (itemsResult.data ?? []) as OrderItemRow[]

      const productIds = Array.from(
        new Set(items.map((item) => item.product_id).filter((value): value is string => Boolean(value)))
      )

      if (productIds.length > 0) {
        const productsResult = await supabase
          .from('exp_products')
          .select('id, category_key')
          .in('id', productIds)

        if (productsResult.error) {
          console.error('[admin:finance:products]', productsResult.error.message)
          return NextResponse.json({ error: 'Could not load finance data.' }, { status: 500 })
        }

        ;((productsResult.data ?? []) as ProductRow[]).forEach((product) => {
          productsById.set(product.id, product)
        })
      }

      const itemIds = items.map((item) => item.id)
      if (itemIds.length > 0) {
        const materialResult = await supabase
          .from('exp_order_item_material_usage')
          .select('id, order_item_id, total_cost_snapshot')
          .in('order_item_id', itemIds)

        if (materialResult.error) {
          console.error('[admin:finance:material]', materialResult.error.message)
          return NextResponse.json({ error: 'Could not load finance data.' }, { status: 500 })
        }

        materialUsage = (materialResult.data ?? []) as MaterialUsageRow[]
      }
    }

    const filteredItems = categoryKey
      ? items.filter((item) => {
          if (!item.product_id) return false
          return productsById.get(item.product_id)?.category_key === categoryKey
        })
      : items

    const filteredItemIds = new Set(filteredItems.map((item) => item.id))
    const filteredMaterialUsage = materialUsage.filter((usage) => filteredItemIds.has(usage.order_item_id))

    const grossSales = money(sum(grossEligibleOrders.map((order) => Number(order.order_total ?? 0))))
    const refundedAmount = money(sum(refundedOrders.map((order) => Number(order.order_total ?? 0))))
    const netSales = money(grossSales - refundedAmount)

    const materialCost = money(
      sum(filteredMaterialUsage.map((usage) => Number(usage.total_cost_snapshot ?? 0)))
    )

    const laborEntries = (laborResult.data ?? []) as LaborRow[]
    const laborHours = Number(
      (sum(laborEntries.map((entry) => Number(entry.minutes ?? 0))) / 60).toFixed(2)
    )
    const laborCost = money(
      sum(laborEntries.map((entry) => (Number(entry.minutes ?? 0) / 60) * Number(entry.hourly_rate ?? 0)))
    )

    const grossProfit = money(netSales - materialCost)
    const netProfit = money(grossProfit - laborCost)
    const paidOrderCount = paidOrders.length
    const grossOrderCount = grossEligibleOrders.length
    const unitsSold = filteredItems.reduce((acc, item) => acc + Number(item.quantity ?? 0), 0)

    const aov = paidOrderCount > 0 ? money(netSales / paidOrderCount) : 0
    const effectiveHourlyRevenue = laborHours > 0 ? money(netSales / laborHours) : 0
    const effectiveHourlyGrossProfit = laborHours > 0 ? money(grossProfit / laborHours) : 0

    const materialCostByItem = new Map<string, number>()
    filteredMaterialUsage.forEach((usage) => {
      const prior = materialCostByItem.get(usage.order_item_id) ?? 0
      materialCostByItem.set(usage.order_item_id, prior + Number(usage.total_cost_snapshot ?? 0))
    })

    const itemAggregate = new Map<
      string,
      {
        product_id: string
        product_title: string
        category_key: string
        units: number
        gross_sales: number
        material_cost: number
      }
    >()

    filteredItems.forEach((item) => {
      const key = `${item.product_id ?? 'unknown'}::${item.product_title}`
      const existing = itemAggregate.get(key)
      const category = item.product_id ? productsById.get(item.product_id)?.category_key ?? 'unknown' : 'unknown'
      const material = materialCostByItem.get(item.id) ?? 0

      if (!existing) {
        itemAggregate.set(key, {
          product_id: item.product_id ?? 'unknown',
          product_title: item.product_title,
          category_key: category,
          units: Number(item.quantity ?? 0),
          gross_sales: Number(item.line_total ?? 0),
          material_cost: material,
        })
        return
      }

      existing.units += Number(item.quantity ?? 0)
      existing.gross_sales += Number(item.line_total ?? 0)
      existing.material_cost += material
    })

    const itemContributions = Array.from(itemAggregate.values())
      .map((row) => ({
        ...row,
        gross_sales: money(row.gross_sales),
        material_cost: money(row.material_cost),
        gross_margin: money(row.gross_sales - row.material_cost),
      }))
      .sort((a, b) => b.gross_sales - a.gross_sales)

    const stageAgg = new Map<string, { stage: string; minutes: number; hours: number; cost: number }>()
    laborEntries.forEach((entry) => {
      const prior = stageAgg.get(entry.stage) ?? { stage: entry.stage, minutes: 0, hours: 0, cost: 0 }
      prior.minutes += Number(entry.minutes ?? 0)
      prior.hours = Number((prior.minutes / 60).toFixed(2))
      prior.cost += (Number(entry.minutes ?? 0) / 60) * Number(entry.hourly_rate ?? 0)
      stageAgg.set(entry.stage, prior)
    })

    const laborByStage = Array.from(stageAgg.values())
      .map((row) => ({
        ...row,
        cost: money(row.cost),
      }))
      .sort((a, b) => b.hours - a.hours)

    const machineBlocks = (machineResult.data ?? []) as MachineBlockRow[]
    const machineHoursScheduled = Number(
      sum(machineBlocks.map((block) => Number(block.estimated_hours ?? 0))).toFixed(2)
    )
    const machineBlocksLocked = machineBlocks.filter((block) => block.is_locked).length

    const summary = {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      gross_orders: grossOrderCount,
      paid_orders: paidOrderCount,
      units_sold: unitsSold,
      gross_sales: grossSales,
      refunds: refundedAmount,
      net_sales: netSales,
      material_cost: materialCost,
      gross_profit: grossProfit,
      labor_hours: laborHours,
      labor_cost: laborCost,
      net_profit: netProfit,
      aov,
      effective_hourly_revenue: effectiveHourlyRevenue,
      effective_hourly_gross_profit: effectiveHourlyGrossProfit,
      machine_hours_scheduled: machineHoursScheduled,
      machine_blocks_locked: machineBlocksLocked,
    }

    if (format === 'csv') {
      const csv = formatCsv({
        summary,
        items: itemContributions,
        laborByStage,
      })

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="finance-report.csv"',
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json(
      {
        summary,
        itemContributions,
        laborByStage,
        machine: {
          blocksScheduled: machineBlocks.length,
          blocksLocked: machineBlocksLocked,
          hoursScheduled: machineHoursScheduled,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[admin:finance:get]', error)
    return NextResponse.json({ error: 'Could not load finance analytics.' }, { status: 500 })
  }
}
