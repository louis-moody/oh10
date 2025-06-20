import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: clean trading API for fallback and orderbook execution (Cursor Rule 4)
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const cookieStore = await cookies()
    const token = cookieStore.get('openhouse-session')?.value

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
      trade_type,
      amount,
      execution_method,
      price_per_token
    } = body

    // Validate required fields
    if (!property_id || !trade_type || !amount || !execution_method || !price_per_token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['buy', 'sell'].includes(trade_type)) {
      return NextResponse.json({ error: 'Invalid trade type' }, { status: 400 })
    }

    // Execute fallback trade (guaranteed liquidity)
    if (execution_method === 'fallback') {
      return await executeFallbackTrade({
        user_wallet: decoded.wallet_address,
        property_id,
        trade_type,
        amount,
        price_per_token
      })
    }

    // Handle order book trades (future implementation)
    return NextResponse.json({ error: 'Order book trading not yet implemented' }, { status: 501 })

  } catch (error) {
    console.error('Trading API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// fix: execute fallback trade with guaranteed liquidity (Cursor Rule 4)
async function executeFallbackTrade(params: {
  user_wallet: string
  property_id: string
  trade_type: 'buy' | 'sell'
  amount: number
  price_per_token: number
}) {
  const { user_wallet, property_id, trade_type, amount, price_per_token } = params

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    // Get current price from Supabase (OpenHouse price authority)
    const { data: propertyDetails } = await supabaseAdmin
      .from('property_token_details')
      .select('current_price_usdc, price_per_token, fallback_enabled')
      .eq('property_id', property_id)
      .single()

    if (!propertyDetails) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    if (!propertyDetails.fallback_enabled) {
      return NextResponse.json({ error: 'Fallback trading disabled for this property' }, { status: 403 })
    }

    // Use OpenHouse price (current_price_usdc takes priority over price_per_token)
    const currentPrice = propertyDetails.current_price_usdc || propertyDetails.price_per_token

    // Calculate trade amounts (no fees for fallback per PRD)
    let token_amount: number
    let usdc_amount: number

    if (trade_type === 'buy') {
      usdc_amount = amount
      token_amount = amount / currentPrice
    } else {
      token_amount = amount
      usdc_amount = amount * currentPrice
    }

    // Record transaction in database
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_address: user_wallet,
        property_id: parseInt(property_id),
        type: trade_type,
        amount: trade_type === 'buy' ? usdc_amount : token_amount,
        tx_hash: 'fallback_' + Date.now(), // Fallback identifier
        execution_source: 'fallback',
        fallback_reason: 'guaranteed_liquidity',
        original_price_usdc: currentPrice,
        executed_price_usdc: currentPrice,
        slippage_bps: 0 // No slippage for fallback
      })
      .select()
      .single()

    if (error) {
      console.error('Error recording fallback transaction:', error)
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 })
    }

    // For buy orders, update user holdings
    if (trade_type === 'buy') {
      const { data: propertyTokenDetails } = await supabaseAdmin
        .from('property_token_details')
        .select('contract_address')
        .eq('property_id', property_id)
        .single()

      if (propertyTokenDetails?.contract_address) {
        // Check if user holdings record exists
        const { data: existingHoldings } = await supabaseAdmin
          .from('user_holdings')
          .select('shares')
          .eq('user_address', user_wallet)
          .eq('property_id', parseInt(property_id))
          .single()

        const newShares = existingHoldings 
          ? existingHoldings.shares + token_amount
          : token_amount

        const { error: holdingsError } = await supabaseAdmin
          .from('user_holdings')
          .upsert({
            user_address: user_wallet,
            property_id: parseInt(property_id),
            token_contract: propertyTokenDetails.contract_address,
            shares: newShares
          }, {
            onConflict: 'user_address,property_id'
          })

        if (holdingsError) {
          console.warn('Failed to update user holdings:', holdingsError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      transaction_id: transaction?.id,
      execution_method: 'fallback',
      token_amount,
      usdc_amount,
      price_used: currentPrice,
      no_fees: true,
      message: 'Trade executed via OpenHouse guaranteed liquidity'
    })

  } catch (error) {
    console.error('Fallback trade execution failed:', error)
    return NextResponse.json({ error: 'Trade execution failed' }, { status: 500 })
  }
}

// fix: GET endpoint for user holdings (Cursor Rule 4)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('openhouse-session')?.value
    
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

    // Fetch user holdings
    const { data: holdings, error } = await supabaseAdmin
      .from('user_holdings')
      .select(`
        *,
        properties:property_id (
          id,
          name,
          status,
          price_per_token
        )
      `)
      .eq('user_address', decoded.wallet_address)
      .gt('shares', 0)

    if (error) {
      console.error('Failed to fetch user holdings:', error)
      return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      holdings: holdings || []
    })

  } catch (error) {
    console.error('Holdings API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 