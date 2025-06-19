import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

interface CreateReservationRequest {
  property_id: string
  usdc_amount: number
  token_amount: number
  approval_hash: string
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Reservation API Called')
    
    // fix: verify JWT token from cookie (Cursor Rule 3)
    const token = request.cookies.get('session-token')?.value
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const payload = verifyJWT(token)
    if (!payload || !payload.wallet_address) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    const walletAddress = payload.wallet_address.toLowerCase()
    console.log('🎯 Authenticated wallet:', walletAddress)

    const body: CreateReservationRequest = await request.json()
    const { property_id, usdc_amount, token_amount, approval_hash } = body

    // fix: validate request data (Cursor Rule 6)
    if (!property_id || !usdc_amount || !token_amount || !approval_hash) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (usdc_amount <= 0 || token_amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amounts' },
        { status: 400 }
      )
    }

    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      console.log('❌ Supabase admin client not initialized')
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    // fix: validate property exists and is active (Cursor Rule 6)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('id, name, status, funding_deadline, price_per_token, total_shares')
      .eq('id', property_id)
      .single()

    if (propertyError || !property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      )
    }

    if (property.status !== 'active') {
      return NextResponse.json(
        { error: 'Property is not accepting reservations' },
        { status: 400 }
      )
    }

    // fix: check funding deadline (Cursor Rule 6)
    if (new Date(property.funding_deadline) < new Date()) {
      return NextResponse.json(
        { error: 'Funding deadline has passed' },
        { status: 400 }
      )
    }

    // fix: validate price calculation (Cursor Rule 6)
    const expectedUsdcAmount = token_amount * property.price_per_token
    if (Math.abs(usdc_amount - expectedUsdcAmount) > 0.01) {
      return NextResponse.json(
        { error: 'Invalid price calculation' },
        { status: 400 }
      )
    }

    // fix: check available shares (Cursor Rule 6)
    const { data: existingReservations, error: reservationsError } = await supabaseAdmin
      .from('payment_authorizations')
      .select('token_amount')
      .eq('property_id', property_id)
      .eq('payment_status', 'approved')

    if (reservationsError) {
      console.error('Error fetching existing reservations:', reservationsError)
      return NextResponse.json(
        { error: 'Failed to validate reservation' },
        { status: 500 }
      )
    }

    const reservedShares = existingReservations?.reduce((sum, res) => sum + res.token_amount, 0) || 0
    const availableShares = property.total_shares - reservedShares

    if (token_amount > availableShares) {
      return NextResponse.json(
        { error: 'Not enough shares available' },
        { status: 400 }
      )
    }

    // fix: create or update reservation (Cursor Rule 4)
    const { data: reservation, error: insertError } = await supabaseAdmin
      .from('payment_authorizations')
      .upsert({
        property_id,
        wallet_address: walletAddress,
        usdc_amount,
        token_amount,
        approval_hash,
        approval_timestamp: new Date().toISOString(),
        payment_status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'property_id,wallet_address'
      })
      .select()

    if (insertError) {
      console.error('Reservation insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to create reservation' },
        { status: 500 }
      )
    }

    console.log('✅ Reservation created:', reservation)

    return NextResponse.json({
      success: true,
      reservation: reservation[0],
      message: 'Reservation created successfully'
    })

  } catch (error) {
    console.error('❌ Reservation API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // fix: verify JWT token from cookie (Cursor Rule 3)
    const token = request.cookies.get('session-token')?.value
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const payload = verifyJWT(token)
    if (!payload || !payload.wallet_address) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    const walletAddress = payload.wallet_address.toLowerCase()
    
    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    // fix: fetch user's reservations (Cursor Rule 4)
    const { data: reservations, error } = await supabaseAdmin
      .from('payment_authorizations')
      .select(`
        *,
        properties!inner(
          id,
          name,
          image_url,
          price_per_token,
          total_shares,
          funding_goal_usdc,
          funding_deadline,
          status
        )
      `)
      .eq('wallet_address', walletAddress)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching reservations:', error)
      return NextResponse.json(
        { error: 'Failed to fetch reservations' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      reservations: reservations || []
    })

  } catch (error) {
    console.error('❌ Get reservations error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 