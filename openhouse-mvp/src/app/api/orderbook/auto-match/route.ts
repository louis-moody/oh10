import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: AUTO-MATCH AND EXECUTE ORDERS - find and execute compatible orders (Cursor Rule 4)
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
    const { property_id } = body

    // fix: validate required fields (Cursor Rule 6)
    if (!property_id) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    console.log('🔄 AUTO-MATCH: Starting automatic order matching for property:', property_id)

    // fix: find all open buy orders with contract IDs (Cursor Rule 4)
    const { data: buyOrders, error: buyError } = await supabaseAdmin
      .from('order_book')
      .select('*')
      .eq('property_id', property_id)
      .eq('order_type', 'buy')
      .eq('status', 'open')
      .gt('shares_remaining', 0)
      .not('contract_order_id', 'is', null)
      .order('price_per_share', { ascending: false }) // Best prices first
      .order('created_at', { ascending: true }) // Then FIFO

    // fix: find all open sell orders with contract IDs (Cursor Rule 4)
    const { data: sellOrders, error: sellError } = await supabaseAdmin
      .from('order_book')
      .select('*')
      .eq('property_id', property_id)
      .eq('order_type', 'sell')
      .eq('status', 'open')
      .gt('shares_remaining', 0)
      .not('contract_order_id', 'is', null)
      .order('price_per_share', { ascending: true }) // Best prices first
      .order('created_at', { ascending: true }) // Then FIFO

    if (buyError || sellError) {
      console.error('❌ AUTO-MATCH: Failed to fetch orders:', { buyError, sellError })
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    if (!buyOrders?.length || !sellOrders?.length) {
      console.log('🔍 AUTO-MATCH: No compatible orders found', {
        buyOrders: buyOrders?.length || 0,
        sellOrders: sellOrders?.length || 0
      })
      return NextResponse.json({
        success: true,
        matches_found: 0,
        message: 'No compatible orders to match'
      })
    }

    console.log(`🔍 AUTO-MATCH: Found ${buyOrders.length} buy orders and ${sellOrders.length} sell orders`)

    // fix: find compatible order pairs (Cursor Rule 4)
    const compatibleMatches = []
    
    for (const buyOrder of buyOrders) {
      for (const sellOrder of sellOrders) {
        // Skip if same user
        if (buyOrder.user_address === sellOrder.user_address) continue
        
        // Check price compatibility - buy price >= sell price
        if (buyOrder.price_per_share >= sellOrder.price_per_share) {
          const maxShares = Math.min(buyOrder.shares_remaining, sellOrder.shares_remaining)
          
          if (maxShares > 0) {
            compatibleMatches.push({
              buyOrder,
              sellOrder,
              matchedShares: maxShares,
              executionPrice: sellOrder.price_per_share, // Execute at sell price (better for buyer)
              priceSpread: buyOrder.price_per_share - sellOrder.price_per_share
            })
          }
        }
      }
    }

    if (compatibleMatches.length === 0) {
      console.log('🔍 AUTO-MATCH: No price-compatible matches found')
      return NextResponse.json({
        success: true,
        matches_found: 0,
        message: 'No price-compatible orders found'
      })
    }

    // fix: sort matches by best price spread (highest spread = best arbitrage opportunity) (Cursor Rule 4)
    compatibleMatches.sort((a, b) => b.priceSpread - a.priceSpread)

    console.log(`✅ AUTO-MATCH: Found ${compatibleMatches.length} compatible matches`)

    // fix: return execution instructions for the frontend (Cursor Rule 4)
    const topMatches = compatibleMatches.slice(0, 5) // Top 5 matches
    const executionInstructions = topMatches.map(match => ({
      buy_order_id: match.buyOrder.id,
      sell_order_id: match.sellOrder.id,
      buy_contract_order_id: match.buyOrder.contract_order_id,
      sell_contract_order_id: match.sellOrder.contract_order_id,
      matched_shares: match.matchedShares,
      execution_price: match.executionPrice,
      price_spread: match.priceSpread,
      buyer_address: match.buyOrder.user_address,
      seller_address: match.sellOrder.user_address,
      // Contract execution details
      execute_against: 'sell_order', // Execute the buy order against the sell order
      contract_function: 'executeOrder',
      contract_params: [match.sellOrder.contract_order_id, match.matchedShares]
    }))

    console.log('📋 AUTO-MATCH: Execution instructions prepared:', executionInstructions)

    return NextResponse.json({
      success: true,
      matches_found: compatibleMatches.length,
      execution_instructions: executionInstructions,
      property_id,
      message: `Found ${compatibleMatches.length} compatible order matches`
    })

  } catch (error) {
    console.error('❌ AUTO-MATCH: Error in automatic matching:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 