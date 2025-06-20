import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: API endpoint to record trading transactions (Cursor Rule 4)
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      order_type,
      token_amount,
      usdc_amount,
      price_per_token,
      transaction_hash
    } = body

    // fix: validate required fields (Cursor Rule 6)
    if (!property_id || !order_type || !token_amount || !usdc_amount || !price_per_token || !transaction_hash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['buy', 'sell'].includes(order_type)) {
      return NextResponse.json({ error: 'Invalid order type' }, { status: 400 })
    }

    // fix: get user record (Cursor Rule 4)
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('wallet_address', decoded.wallet_address)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // fix: record transaction (Cursor Rule 4)
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: user.id,
        property_id: parseInt(property_id),
        transaction_type: order_type,
        token_amount: parseFloat(token_amount),
        usdc_amount: parseFloat(usdc_amount),
        price_per_token: parseFloat(price_per_token),
        transaction_hash,
        status: 'completed'
      })
      .select()
      .single()

    if (error) {
      console.error('Error recording transaction:', error)
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 })
    }

    // fix: update user holdings if it's a buy order (Cursor Rule 4)
    if (order_type === 'buy') {
      // Get property token contract address
      const { data: propertyTokenDetails } = await supabaseAdmin
        .from('property_token_details')
        .select('token_contract_address')
        .eq('property_id', property_id)
        .single()

      if (propertyTokenDetails?.token_contract_address) {
        // Update or create user holdings record
        const { error: holdingsError } = await supabaseAdmin
          .from('user_holdings')
          .upsert({
            user_id: user.id,
            property_id: parseInt(property_id),
            token_contract: propertyTokenDetails.token_contract_address,
            shares: parseFloat(token_amount)
          }, {
            onConflict: 'user_id,property_id',
            ignoreDuplicates: false
          })

        if (holdingsError) {
          console.warn('Failed to update user holdings:', holdingsError)
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      transaction_id: transaction?.id 
    })

  } catch (error) {
    console.error('Trading API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// fix: API endpoint for fetching user holdings (Cursor Rule 4)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session')?.value
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = await verifyJWT(token)
    if (!decoded || !decoded.wallet_address) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // fix: fetch user holdings (Cursor Rule 4)
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('wallet_address', decoded.wallet_address)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

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
      .eq('user_id', user.id)
      .gt('shares', 0)

    if (holdingsError) {
      console.error('Failed to fetch user holdings:', holdingsError)
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