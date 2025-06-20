import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: API endpoint for recording trading transactions (Cursor Rule 4)
export async function POST(request: NextRequest) {
  try {
    // fix: verify JWT authentication (Cursor Rule 3)
    const token = request.cookies.get('auth-token')?.value
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const payload = await verifyJWT(token)
    if (!payload || !payload.wallet_address) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const {
      property_id,
      order_type, // 'buy' or 'sell'
      token_amount,
      price_per_token,
      total_amount,
      protocol_fee,
      transaction_hash,
      order_id
    } = body

    // fix: validate required fields (Cursor Rule 6)
    if (!property_id || !order_type || !token_amount || !price_per_token || !total_amount || !transaction_hash) {
      return NextResponse.json(
        { error: 'Missing required transaction data' },
        { status: 400 }
      )
    }

    // fix: record transaction in transactions table (Cursor Rule 4)
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .insert({
        property_id,
        wallet_address: payload.wallet_address,
        transaction_type: order_type,
        token_amount: parseInt(token_amount),
        usdc_amount: parseFloat(total_amount),
        price_per_token: parseFloat(price_per_token),
        protocol_fee: parseFloat(protocol_fee || 0),
        transaction_hash,
        order_id: order_id || null,
        status: 'completed',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (transactionError) {
      console.error('❌ Failed to record transaction:', transactionError)
      return NextResponse.json(
        { error: 'Failed to record transaction' },
        { status: 500 }
      )
    }

    // fix: update user holdings if buy transaction (Cursor Rule 4)
    if (order_type === 'buy') {
      await updateUserHoldings(payload.wallet_address, property_id, parseInt(token_amount), 'add')
    } else if (order_type === 'sell') {
      await updateUserHoldings(payload.wallet_address, property_id, parseInt(token_amount), 'subtract')
    }

    return NextResponse.json({
      success: true,
      transaction,
      message: 'Transaction recorded successfully'
    })

  } catch (error) {
    console.error('❌ Trading API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// fix: helper function to update user holdings (Cursor Rule 4)
async function updateUserHoldings(
  walletAddress: string, 
  propertyId: string, 
  tokenAmount: number, 
  operation: 'add' | 'subtract'
) {
  try {
    if (!supabaseAdmin) return

    // fix: get existing holdings (Cursor Rule 4)
    const { data: existingHolding } = await supabaseAdmin
      .from('user_holdings')
      .select('*')
      .eq('wallet_address', walletAddress)
      .eq('property_id', propertyId)
      .single()

    if (existingHolding) {
      // fix: update existing holding (Cursor Rule 4)
      const newAmount = operation === 'add' 
        ? existingHolding.token_amount + tokenAmount
        : Math.max(0, existingHolding.token_amount - tokenAmount)

      const { error: updateError } = await supabaseAdmin
        .from('user_holdings')
        .update({
          token_amount: newAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingHolding.id)

      if (updateError) {
        console.error('❌ Failed to update user holdings:', updateError)
      }
    } else if (operation === 'add') {
      // fix: create new holding record for buy transactions (Cursor Rule 4)
      const { error: insertError } = await supabaseAdmin
        .from('user_holdings')
        .insert({
          wallet_address: walletAddress,
          property_id: propertyId,
          token_amount: tokenAmount,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('❌ Failed to create user holdings:', insertError)
      }
    }
  } catch (error) {
    console.error('❌ Error updating user holdings:', error)
  }
}

// fix: API endpoint for fetching user holdings (Cursor Rule 4)
export async function GET(request: NextRequest) {
  try {
    // fix: verify JWT authentication (Cursor Rule 3)
    const token = request.cookies.get('auth-token')?.value
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const payload = await verifyJWT(token)
    if (!payload || !payload.wallet_address) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    // fix: fetch user holdings with property details (Cursor Rule 4)
    const { data: holdings, error: holdingsError } = await supabaseAdmin
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
      .eq('wallet_address', payload.wallet_address)
      .gt('token_amount', 0)

    if (holdingsError) {
      console.error('❌ Failed to fetch user holdings:', holdingsError)
      return NextResponse.json(
        { error: 'Failed to fetch holdings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      holdings: holdings || []
    })

  } catch (error) {
    console.error('❌ Holdings API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 