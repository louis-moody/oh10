import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

export async function POST(request: NextRequest) {
  try {
    // fix: check database configuration (Cursor Rule 6)
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // fix: JWT authentication (Cursor Rule 5)
    const cookieStore = await cookies()
    const token = cookieStore.get('session')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyJWT(token)
    if (!payload?.wallet_address) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const orderData = await request.json()
    
    // fix: validate required fields (Cursor Rule 6)
    if (!orderData.transactionHash || !orderData.propertyId || !orderData.orderType) {
      return NextResponse.json({ 
        error: 'Missing required fields: transactionHash, propertyId, orderType' 
      }, { status: 400 })
    }

    console.log('📝 Recording trade activity:', {
      propertyId: orderData.propertyId,
      orderType: orderData.orderType,
      walletAddress: payload.wallet_address,
      transactionHash: orderData.transactionHash
    })

    // fix: check if transaction already recorded (Cursor Rule 6)
    const { data: existingRecord } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('transaction_hash', orderData.transactionHash)
      .single()

    if (existingRecord) {
      console.log('⚠️ Transaction already recorded:', orderData.transactionHash)
      return NextResponse.json({ 
        success: true, 
        message: 'Transaction already recorded',
        recordId: existingRecord.id 
      })
    }

    // fix: record transaction in database (Cursor Rule 4)
    const { data: recordedTransaction, error: recordError } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: payload.wallet_address,
        property_id: orderData.propertyId,
        transaction_hash: orderData.transactionHash,
        transaction_type: orderData.orderType.toLowerCase(),
        amount: orderData.amount || '0',
        price_per_token: orderData.pricePerToken || '0',
        status: 'confirmed',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (recordError) {
      console.error('❌ Database record error:', recordError)
      return NextResponse.json({ 
        error: 'Failed to record transaction',
        details: recordError.message 
      }, { status: 500 })
    }

    // fix: record activity log (Cursor Rule 4)
    await supabaseAdmin
      .from('activity_logs')
      .insert({
        user_id: payload.wallet_address,
        property_id: orderData.propertyId,
        action: `${orderData.orderType.toLowerCase()}_order_created`,
        details: {
          transactionHash: orderData.transactionHash,
          amount: orderData.amount,
          pricePerToken: orderData.pricePerToken
        },
        created_at: new Date().toISOString()
      })

    console.log('✅ Trade activity recorded successfully:', {
      recordId: recordedTransaction.id,
      transactionHash: orderData.transactionHash
    })

    return NextResponse.json({ 
      success: true,
      recordId: recordedTransaction.id,
      message: 'Trade activity recorded successfully'
    })

  } catch (error) {
    console.error('❌ Record trade activity error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 