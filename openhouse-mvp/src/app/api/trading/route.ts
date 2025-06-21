import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: PURE ORDERBOOK TRADING - NO FALLBACK COMPLEXITY (Cursor Rule 4)
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
    const { property_id, trade_type, usdc_amount, shares_to_sell } = body

    // Validate inputs
    if (!property_id || !trade_type) {
      return NextResponse.json({ error: 'Property ID and trade type required' }, { status: 400 })
    }

    if (!['buy', 'sell'].includes(trade_type)) {
      return NextResponse.json({ error: 'Invalid trade type' }, { status: 400 })
    }

    // fix: get property details including OpenHouse price (Cursor Rule 4)
    const { data: property } = await supabaseAdmin
      .from('properties')
      .select('price_per_token')
      .eq('id', property_id)
      .single()

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const { data: propertyDetails } = await supabaseAdmin
      .from('property_token_details')
      .select('contract_address, orderbook_contract_address')
      .eq('property_id', property_id)
      .single()

    if (!propertyDetails || !propertyDetails.orderbook_contract_address) {
      return NextResponse.json({ error: 'Orderbook not available for this property' }, { status: 404 })
    }

    // fix: calculate shares and amounts at FIXED OpenHouse price (Cursor Rule 1)
    const openHousePrice = property.price_per_token
    let shares: number
    let totalUsdcAmount: number

    if (trade_type === 'buy') {
      if (!usdc_amount || usdc_amount <= 0) {
        return NextResponse.json({ error: 'USDC amount required for buy orders' }, { status: 400 })
      }
      shares = usdc_amount / openHousePrice
      totalUsdcAmount = usdc_amount
    } else {
      if (!shares_to_sell || shares_to_sell <= 0) {
        return NextResponse.json({ error: 'Share amount required for sell orders' }, { status: 400 })
      }
      shares = shares_to_sell
      totalUsdcAmount = shares * openHousePrice
    }

    // STEP 1: Try to match with existing orders first
    const { data: matchingOrders } = await supabaseAdmin
      .from('order_book_state')
      .select('*')
      .eq('property_id', property_id)
      .eq('order_type', trade_type === 'buy' ? 'sell' : 'buy')
      .eq('status', 'active')
      .gte('price_per_token', trade_type === 'buy' ? 0 : openHousePrice)
      .lte('price_per_token', trade_type === 'buy' ? openHousePrice : 999999)
      .order('price_per_token', { ascending: trade_type === 'buy' })
      .limit(1)

    if (matchingOrders && matchingOrders.length > 0) {
      // Execute trade with existing order
      return await executeOrderMatch({
        user_wallet: decoded.wallet_address,
        property_id,
        trade_type,
        shares,
        price_per_token: openHousePrice,
        matching_order: matchingOrders[0],
        propertyDetails
      })
    }

    // STEP 2: Place new order on-chain
    return await placeOrderOnChain({
      user_wallet: decoded.wallet_address,
      property_id,
      trade_type,
      shares,
      price_per_token: openHousePrice,
      propertyDetails
    })

  } catch (error) {
    console.error('Trading API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// fix: Execute trade with matching order (Cursor Rule 4)
async function executeOrderMatch(params: {
  user_wallet: string
  property_id: string
  trade_type: 'buy' | 'sell'
  shares: number
  price_per_token: number
  matching_order: any
  propertyDetails: any
}) {
  const { user_wallet, property_id, trade_type, shares, price_per_token, matching_order, propertyDetails } = params

  try {
    // Return execution instructions for frontend
    return NextResponse.json({
      success: false,
      execution_method: 'orderbook_match',
      requires_wallet_interaction: true,
      action: 'execute_order',
      order_id: matching_order.id,
      fill_amount: Math.min(shares, matching_order.token_amount - matching_order.filled_amount),
      execution_price: matching_order.price_per_token,
      usdc_amount: Math.min(shares, matching_order.token_amount - matching_order.filled_amount) * matching_order.price_per_token,
      contract_address: propertyDetails.orderbook_contract_address,
      message: `Execute ${trade_type} order for ${Math.min(shares, matching_order.token_amount - matching_order.filled_amount)} tokens`,
      instructions: {
        contract: propertyDetails.orderbook_contract_address,
        function: 'executeOrder',
        parameters: [matching_order.id, shares]
      }
    })

  } catch (error) {
    console.error('Order matching error:', error)
    return NextResponse.json({ error: 'Order matching failed' }, { status: 500 })
  }
}

// fix: Place new order on-chain (Cursor Rule 4)
async function placeOrderOnChain(params: {
  user_wallet: string
  property_id: string
  trade_type: 'buy' | 'sell'
  shares: number
  price_per_token: number
  propertyDetails: any
}) {
  const { user_wallet, property_id, trade_type, shares, price_per_token, propertyDetails } = params

  try {
    // fix: DIRECT WALLET TRANSACTION - NO PRE-VALIDATION (Cursor Rule 1)
    // Let the wallet handle approvals automatically when user signs

    // Return order placement instructions for frontend
    return NextResponse.json({
      success: false,
      execution_method: 'orderbook_place',
      requires_wallet_interaction: true,
      action: trade_type === 'buy' ? 'create_buy_order' : 'create_sell_order',
      shares: shares,
      price_per_token: price_per_token,
      total_value: shares * price_per_token,
      contract_address: propertyDetails.orderbook_contract_address,
      message: `${trade_type === 'buy' ? 'Buy' : 'Sell'} ${shares} tokens at $${price_per_token} each`,
      instructions: {
        contract: propertyDetails.orderbook_contract_address,
        function: trade_type === 'buy' ? 'createBuyOrder' : 'createSellOrder',
        parameters: [shares, price_per_token]
      }
    })

  } catch (error) {
    console.error('Order placement error:', error)
    return NextResponse.json({ error: 'Order placement failed' }, { status: 500 })
  }
} 