import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: handle order execution and mark filled orders (Cursor Rule 4)
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const cookieStore = await cookies()
    const token = cookieStore.get('app-session-token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const decoded = await verifyJWT(token)
    if (!decoded || !decoded.wallet_address) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    const body = await req.json()
    const { 
      property_id, 
      transaction_hash, 
      buyer_address, 
      shares_bought, 
      price_per_share, 
      contract_address 
    } = body

    // fix: validate required fields (Cursor Rule 6)
    if (!property_id || !transaction_hash || !buyer_address || !shares_bought || !price_per_share || !contract_address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // fix: verify user matches authenticated wallet (Cursor Rule 3)
    if (buyer_address.toLowerCase() !== decoded.wallet_address.toLowerCase()) {
      return NextResponse.json({ error: 'User address mismatch' }, { status: 403 })
    }

    console.log('🔄 ORDER EXECUTION: Processing order execution...', {
      property_id,
      transaction_hash,
      buyer_address,
      shares_bought,
      price_per_share
    })

    // fix: find and mark sell orders as filled based on shares bought (Cursor Rule 4)
    let remainingShares = parseFloat(shares_bought)
    const filledOrders = []

    // Get open sell orders sorted by creation date (FIFO)
    const { data: sellOrders, error: fetchError } = await supabaseAdmin
      .from('order_book')
      .select('*')
      .eq('property_id', property_id)
      .eq('order_type', 'sell')
      .eq('status', 'open')
      .eq('contract_address', contract_address.toLowerCase())
      .gt('shares_remaining', 0)
      .order('created_at', { ascending: true })

    if (fetchError) {
      console.error('❌ ORDER EXECUTION: Failed to fetch sell orders:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    if (!sellOrders || sellOrders.length === 0) {
      console.warn('⚠️ ORDER EXECUTION: No open sell orders found to fill')
      return NextResponse.json({ error: 'No sell orders to fill' }, { status: 400 })
    }

    // Fill orders in FIFO order
    for (const order of sellOrders) {
      if (remainingShares <= 0) break

      const orderShares = order.shares_remaining
      const sharesToFill = Math.min(remainingShares, orderShares)
      const newRemainingShares = orderShares - sharesToFill

      console.log(`🔄 ORDER EXECUTION: Filling order ${order.id}:`, {
        orderShares,
        sharesToFill,
        newRemainingShares,
        remainingSharesNeeded: remainingShares
      })

      // Update order status
      const updateData = newRemainingShares <= 0 
        ? { status: 'filled', shares_remaining: 0 }
        : { shares_remaining: newRemainingShares }

      const { error: updateError } = await supabaseAdmin
        .from('order_book')
        .update(updateData)
        .eq('id', order.id)

      if (updateError) {
        console.error(`❌ ORDER EXECUTION: Failed to update order ${order.id}:`, updateError)
        continue
      }

      filledOrders.push({
        order_id: order.id,
        shares_filled: sharesToFill,
        fully_filled: newRemainingShares <= 0
      })

      remainingShares -= sharesToFill
    }

    // fix: record the buy transaction in activity log with correct column names (Cursor Rule 4)
    const { error: activityError } = await supabaseAdmin
      .from('property_activity')
      .insert({
        property_id,
        wallet_address: buyer_address.toLowerCase(),
        activity_type: 'trade_executed',
        share_count: parseFloat(shares_bought),
        price_per_share: parseFloat(price_per_share),
        total_amount: parseFloat(shares_bought) * parseFloat(price_per_share),
        transaction_hash: transaction_hash.toLowerCase(),
        created_at: new Date().toISOString()
      })

    if (activityError) {
      console.warn('⚠️ ORDER EXECUTION: Failed to log activity:', activityError)
    }

    console.log('✅ ORDER EXECUTION: Successfully processed order execution:', {
      filled_orders: filledOrders,
      total_shares_bought: shares_bought,
      remaining_unfilled_shares: remainingShares
    })

    return NextResponse.json({
      success: true,
      filled_orders: filledOrders,
      total_shares_bought: shares_bought,
      remaining_unfilled_shares: remainingShares,
      message: 'Order execution processed successfully'
    })

  } catch (error) {
    console.error('❌ ORDER EXECUTION: Error processing execution:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 