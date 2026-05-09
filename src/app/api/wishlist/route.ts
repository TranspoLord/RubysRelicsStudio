import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { verifyCustomerSession } from '@/lib/auth/customer'

const CUSTOMER_SESSION_COOKIE = 'rr_customer_session'

async function getCustomerIdFromSession(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const sessionToken = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${CUSTOMER_SESSION_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')

  if (!sessionToken) {
    return null
  }

  return await verifyCustomerSession(sessionToken)
}

// GET /api/wishlist - Get customer's wishlist
export async function GET(request: Request) {
  try {
    const customerId = await getCustomerIdFromSession(request)

    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    const { data: wishlists, error } = await supabase
      .from('exp_wishlists')
      .select(`
        id,
        product_id,
        created_at,
        exp_products (
          id,
          title,
          slug,
          base_price,
          thumbnail_url,
          exp_product_categories (
            category_key,
            display_name
          )
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[wishlist:get]', error.message)
      return NextResponse.json({ error: 'Failed to fetch wishlist.' }, { status: 500 })
    }

    const items = (wishlists || []).map((item: any) => ({
      id: item.id,
      product: {
        id: item.exp_products.id,
        title: item.exp_products.title,
        slug: item.exp_products.slug,
        price: item.exp_products.base_price,
        thumbnail: item.exp_products.thumbnail_url,
        category: item.exp_products.exp_product_categories?.display_name,
        categoryKey: item.exp_products.exp_product_categories?.category_key,
      },
      addedAt: item.created_at,
    }))

    return NextResponse.json({ items }, { status: 200 })
  } catch (error) {
    console.error('[wishlist:get]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

// POST /api/wishlist - Add product to wishlist
export async function POST(request: Request) {
  try {
    const customerId = await getCustomerIdFromSession(request)

    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    const body = await request.json()
    const { productId } = body

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Check if product exists
    const { data: product, error: productError } = await supabase
      .from('exp_products')
      .select('id')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    }

    // Check if already in wishlist
    const { data: existing } = await supabase
      .from('exp_wishlists')
      .select('id')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Product already in wishlist.' }, { status: 409 })
    }

    // Add to wishlist
    const { data, error } = await supabase
      .from('exp_wishlists')
      .insert({ customer_id: customerId, product_id: productId })
      .select('id')
      .single()

    if (error) {
      console.error('[wishlist:post]', error.message)
      return NextResponse.json({ error: 'Failed to add to wishlist.' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, message: 'Added to wishlist.' }, { status: 201 })
  } catch (error) {
    console.error('[wishlist:post]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

// DELETE /api/wishlist - Remove product from wishlist
export async function DELETE(request: Request) {
  try {
    const customerId = await getCustomerIdFromSession(request)

    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { error } = await supabase
      .from('exp_wishlists')
      .delete()
      .eq('customer_id', customerId)
      .eq('product_id', productId)

    if (error) {
      console.error('[wishlist:delete]', error.message)
      return NextResponse.json({ error: 'Failed to remove from wishlist.' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Removed from wishlist.' }, { status: 200 })
  } catch (error) {
    console.error('[wishlist:delete]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
