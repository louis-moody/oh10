import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// fix: sync all Supabase tables with correct contract addresses (Cursor Rule 4)
export async function POST() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    console.log('🔄 Starting Supabase contract sync...')

    // 1. UPDATE PROPERTIES TABLE
    const { error: propertiesError } = await supabaseAdmin
      .from('properties')
      .update({
        orderbook_contract_address: '0xf6E6439707Ed80D141DE2cb05f6E6c04F28de2c3',
        token_contract_address: '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F',
        status: 'completed'
      })
      .eq('id', '795d70a0-7807-4d73-be93-b19050e9dec8')

    if (propertiesError) {
      console.error('❌ Properties table update failed:', propertiesError)
      return NextResponse.json({ error: 'Properties table update failed', details: propertiesError }, { status: 500 })
    }

    console.log('✅ Properties table updated')

    // 2. UPDATE PROPERTY_TOKEN_DETAILS TABLE
    const { error: tokenDetailsError } = await supabaseAdmin
      .from('property_token_details')
      .update({
        contract_address: '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F',
        orderbook_contract_address: '0xf6E6439707Ed80D141DE2cb05f6E6c04F28de2c3',
        total_shares: 50,
        price_per_token: 1,
        total_supply: 50,
        available_shares: 50,
        token_name: 'London Flat Shares',
        token_symbol: 'LONDON',
        price_source: 'openhouse',
        updated_at: new Date().toISOString()
      })
      .eq('property_id', '795d70a0-7807-4d73-be93-b19050e9dec8')

    if (tokenDetailsError) {
      console.error('❌ Property token details update failed:', tokenDetailsError)
      return NextResponse.json({ error: 'Property token details update failed', details: tokenDetailsError }, { status: 500 })
    }

    console.log('✅ Property token details updated')

    // 3. CLEAR STALE ORDER_BOOK ENTRIES
    const { error: clearOrdersError } = await supabaseAdmin
      .from('order_book')
      .delete()
      .eq('property_id', '795d70a0-7807-4d73-be93-b19050e9dec8')
      .neq('contract_address', '0xf6E6439707Ed80D141DE2cb05f6E6c04F28de2c3')

    if (clearOrdersError) {
      console.error('❌ Clear stale orders failed:', clearOrdersError)
      // Don't fail the sync for this - just log it
    } else {
      console.log('✅ Stale orders cleared')
    }

    // 4. VERIFY FINAL STATE
    const { data: finalProperties, error: verifyPropertiesError } = await supabaseAdmin
      .from('properties')
      .select('id, name, token_contract_address, orderbook_contract_address, status, total_shares, price_per_token')
      .eq('id', '795d70a0-7807-4d73-be93-b19050e9dec8')
      .single()

    const { data: finalTokenDetails, error: verifyTokenError } = await supabaseAdmin
      .from('property_token_details')
      .select('property_id, contract_address, orderbook_contract_address, token_name, token_symbol, total_shares, price_per_token, total_supply, available_shares')
      .eq('property_id', '795d70a0-7807-4d73-be93-b19050e9dec8')
      .single()

    if (verifyPropertiesError || verifyTokenError) {
      console.error('❌ Verification failed:', { verifyPropertiesError, verifyTokenError })
      return NextResponse.json({ 
        error: 'Verification failed', 
        details: { verifyPropertiesError, verifyTokenError } 
      }, { status: 500 })
    }

    console.log('✅ Verification complete - all tables synced')

    return NextResponse.json({
      success: true,
      message: 'SUPABASE SYNC COMPLETE - ALL CONTRACTS ALIGNED!',
      updated_data: {
        properties: finalProperties,
        property_token_details: finalTokenDetails
      },
      contract_addresses: {
        property_share_token: '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F',
        orderbook_exchange: '0xf6E6439707Ed80D141DE2cb05f6E6c04F28de2c3',
        usdc_token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      },
      network: 'Base Sepolia',
      property_id: '795d70a0-7807-4d73-be93-b19050e9dec8'
    })

  } catch (error) {
    console.error('❌ Sync failed:', error)
    return NextResponse.json({ 
      error: 'Sync failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
} 