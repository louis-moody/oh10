import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// fix: REAL MARKET DATA - fetch live orderbook data from Supabase (Cursor Rule 4)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const propertyId = url.searchParams.get('property_id')

    if (!propertyId) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // fix: fetch active sell orders (asks) sorted by price (Cursor Rule 4)
    const { data: sellOrders, error: sellError } = await supabaseAdmin
      .from('order_book')
      .select('id, shares_remaining, price_per_share, user_address, created_at, status, contract_order_id')
      .eq('property_id', propertyId)
      .eq('order_type', 'sell')
      .eq('status', 'open')
      .gt('shares_remaining', 0)
      .order('price_per_share', { ascending: true })
      .limit(50) // Top 50 asks

    // fix: fetch active buy orders (bids) sorted by price (Cursor Rule 4)  
    const { data: buyOrders, error: buyError } = await supabaseAdmin
      .from('order_book')
      .select('id, shares_remaining, price_per_share, user_address, created_at, status, contract_order_id')
      .eq('property_id', propertyId)
      .eq('order_type', 'buy')
      .eq('status', 'open')
      .gt('shares_remaining', 0)
      .order('price_per_share', { ascending: false })
      .limit(50) // Top 50 bids

    // fix: calculate market metrics (Cursor Rule 4)
    const bestAsk = sellOrders?.[0]?.price_per_share || null
    const bestBid = buyOrders?.[0]?.price_per_share || null
    const spread = bestAsk && bestBid ? bestAsk - bestBid : null
    const spreadPercentage = spread && bestBid ? (spread / bestBid) * 100 : null

    const availableShares = sellOrders?.reduce((sum, order) => sum + order.shares_remaining, 0) || 0
    const totalBuyDemand = buyOrders?.reduce((sum, order) => sum + order.shares_remaining, 0) || 0

    // fix: get recent trade activity for price trend (Cursor Rule 4)
    const { data: recentTrades } = await supabaseAdmin
      .from('property_activity')
      .select('price_per_share, share_count, created_at, activity_type')
      .eq('property_id', propertyId)
      .in('activity_type', ['buy_order', 'sell_order'])
      .order('created_at', { ascending: false })
      .limit(5)

    const marketData = {
      property_id: propertyId,
      best_ask: bestAsk,
      best_bid: bestBid,
      spread: spread,
      spread_percentage: spreadPercentage ? Number(spreadPercentage.toFixed(4)) : null,
      available_shares: availableShares,
      total_buy_demand: totalBuyDemand,
      order_depth: {
        sell_orders: sellOrders?.length || 0,
        buy_orders: buyOrders?.length || 0
      },
      sell_orders: sellOrders?.map(order => ({
        order_id: order.id,
        id: order.id,
        price: order.price_per_share,
        shares: order.shares_remaining,
        shares_remaining: order.shares_remaining,
        contract_order_id: order.contract_order_id,
        status: order.status,
        user: order.user_address.slice(0, 6) + '...' + order.user_address.slice(-4), // Anonymize
        user_address: order.user_address, // Keep full address for trading
        age: Math.floor((new Date().getTime() - new Date(order.created_at).getTime()) / (1000 * 60)) // minutes
      })) || [],
      buy_orders: buyOrders?.map(order => ({
        order_id: order.id,
        id: order.id,
        price: order.price_per_share,
        shares: order.shares_remaining,
        shares_remaining: order.shares_remaining,
        contract_order_id: order.contract_order_id,
        status: order.status,
        user: order.user_address.slice(0, 6) + '...' + order.user_address.slice(-4), // Anonymize
        user_address: order.user_address, // Keep full address for trading
        age: Math.floor((new Date().getTime() - new Date(order.created_at).getTime()) / (1000 * 60)) // minutes
      })) || [],
      recent_activity: recentTrades?.map(trade => ({
        type: trade.activity_type,
        price: trade.price_per_share,
        shares: trade.share_count,
        timestamp: trade.created_at
      })) || [],
      last_updated: new Date().toISOString()
    }

    return NextResponse.json(marketData)

  } catch (error) {
    console.error('Market data fetch error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch market data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 