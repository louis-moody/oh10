import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: record trading activity in Supabase (Cursor Rule 4)
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
      activity_type, 
      wallet_address, 
      share_count, 
      price_per_share, 
      total_amount, 
      transaction_hash 
    } = body

    // Validate inputs
    if (!property_id || !activity_type || !wallet_address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['buy_order', 'sell_order', 'trade_executed', 'yield_distributed'].includes(activity_type)) {
      return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 })
    }

    // Verify wallet address matches authenticated user
    if (wallet_address.toLowerCase() !== decoded.wallet_address.toLowerCase()) {
      return NextResponse.json({ error: 'Wallet address mismatch' }, { status: 403 })
    }

    console.log('📝 Recording activity:', {
      property_id,
      activity_type,
      wallet_address,
      share_count,
      price_per_share,
      total_amount,
      transaction_hash
    })

    // Insert activity record
    const { data, error } = await supabaseAdmin
      .from('property_activity')
      .insert({
        property_id,
        activity_type,
        wallet_address: wallet_address.toLowerCase(),
        share_count: share_count || null,
        price_per_share: price_per_share || null,
        total_amount: total_amount || null,
        transaction_hash: transaction_hash || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Activity insert error:', error)
      return NextResponse.json({ error: 'Failed to record activity' }, { status: 500 })
    }

    console.log('✅ Activity recorded:', data)

    return NextResponse.json({ 
      success: true, 
      activity: data,
      message: 'Activity recorded successfully' 
    })

  } catch (error) {
    console.error('Activity recording API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 