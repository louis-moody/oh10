import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // Test data that should work
    const testActivity = {
      property_id: '795d70a0-7807-4d73-be93-b19050e9dec8',
      activity_type: 'sell_order',
      wallet_address: '0xf8978edbab4e9f095581c0ab69c9e13acfd8d485',
      share_count: 1,
      price_per_share: 1,
      total_amount: 1,
      transaction_hash: '0xtest' + Date.now()
    }

    console.log('🧪 Testing activity insert with data:', testActivity)

    const { data, error } = await supabaseAdmin
      .from('property_activity')
      .insert(testActivity)
      .select('*')
      .single()

    if (error) {
      console.error('❌ Test insert failed:', error)
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
    }

    console.log('✅ Test insert succeeded:', data)
    return NextResponse.json({
      success: true,
      data,
      message: 'Test activity inserted successfully'
    })

  } catch (error) {
    console.error('❌ Test insert exception:', error)
    return NextResponse.json({ 
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 