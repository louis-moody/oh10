import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    const propertyId = '795d70a0-7807-4d73-be93-b19050e9dec8'
    
    console.log('🔍 Checking Supabase values for London property...')

    // Check properties table
    const { data: property, error: propError } = await supabaseAdmin
      .from('properties')
      .select('id, name, token_contract_address, orderbook_contract_address, status')
      .eq('id', propertyId)
      .single()

    // Check property_token_details table  
    const { data: tokenDetails, error: tokenError } = await supabaseAdmin
      .from('property_token_details')
      .select('property_id, contract_address, orderbook_contract_address, total_shares, price_per_token')
      .eq('property_id', propertyId)
      .single()

    // Check order_book table
    const { data: orders, error: orderError } = await supabaseAdmin
      .from('order_book')
      .select('*')
      .eq('property_id', propertyId)

    const result = {
      property_id: propertyId,
      expected_values: {
        token_address: '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F',
        orderbook_address: '0xd0408444c1afF904107D95AD240d4100f875eEdF'
      },
      properties_table: {
        data: property,
        error: propError?.message,
        orderbook_correct: property?.orderbook_contract_address?.toLowerCase() === '0xd0408444c1afF904107D95AD240d4100f875eEdF'.toLowerCase()
      },
      property_token_details_table: {
        data: tokenDetails,
        error: tokenError?.message,
        token_correct: tokenDetails?.contract_address?.toLowerCase() === '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F'.toLowerCase(),
        orderbook_correct: tokenDetails?.orderbook_contract_address?.toLowerCase() === '0xd0408444c1afF904107D95AD240d4100f875eEdF'.toLowerCase()
      },
      order_book_table: {
        count: orders?.length || 0,
        data: orders,
        error: orderError?.message
      },
      summary: {
        all_correct: property?.orderbook_contract_address?.toLowerCase() === '0xd0408444c1afF904107D95AD240d4100f875eEdF'.toLowerCase() &&
                    tokenDetails?.contract_address?.toLowerCase() === '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F'.toLowerCase() &&
                    tokenDetails?.orderbook_contract_address?.toLowerCase() === '0xd0408444c1afF904107D95AD240d4100f875eEdF'.toLowerCase(),
        needs_update: false
      }
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Schema check error:', error)
    return NextResponse.json({ 
      error: 'Failed to check schema',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 