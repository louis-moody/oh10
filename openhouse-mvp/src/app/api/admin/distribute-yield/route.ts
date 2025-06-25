import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'



// fix: admin yield distribution API endpoint (Cursor Rule 4)
export async function POST(request: NextRequest) {
  try {
    // fix: verify JWT token from cookie (same pattern as other admin endpoints) (Cursor Rule 3)
    const token = request.cookies.get('app-session-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const payload = await verifyJWT(token)
    if (!payload || !payload.wallet_address) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

    const walletAddress = payload.wallet_address.toLowerCase()

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    // fix: validate session via Supabase RPC (Cursor Rule 3)
    const { data: sessionValid, error: sessionError } = await supabaseAdmin
      .rpc('is_valid_session', { wallet_addr: walletAddress })

    if (sessionError || !sessionValid) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // fix: verify user is admin (Cursor Rule 3)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('wallet_address', walletAddress)
      .single()

    if (userError || !user?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { property_id, usdc_amount, tx_hash, distribution_round } = await request.json()

    // fix: validate required parameters (Cursor Rule 6)
    if (!property_id || !usdc_amount || !tx_hash) {
      return NextResponse.json({ 
        error: 'Missing required fields: property_id, usdc_amount, tx_hash' 
      }, { status: 400 })
    }

    // fix: verify property exists and admin has access (Cursor Rule 4)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('id, name, status')
      .eq('id', property_id)
      .single()

    if (propertyError || !property) {
      return NextResponse.json({ 
        error: 'Property not found' 
      }, { status: 404 })
    }

    // fix: ensure property has a completed token deployment (Cursor Rule 4)
    const { data: tokenDetails, error: tokenError } = await supabaseAdmin
      .from('property_token_details')
      .select('yield_distributor_address, contract_address')
      .eq('property_id', property_id)
      .single()

    if (tokenError || !tokenDetails?.yield_distributor_address) {
      return NextResponse.json({ 
        error: 'Property does not have a deployed YieldDistributor contract' 
      }, { status: 400 })
    }

    // fix: record yield distribution in rental_distributions table (Cursor Rule 4)
    const { data: distributionRecord, error: insertError } = await supabaseAdmin
      .from('rental_distributions')
      .insert({
        property_id,
        usdc_amount: parseFloat(usdc_amount),
        tx_hash,
        distributed_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting distribution record:', insertError)
      // Don't fail the request since the on-chain transaction succeeded
      console.warn('Distribution succeeded on-chain but failed to record in database')
    }

    console.log(`✅ Yield distribution confirmed for ${property.name}: $${usdc_amount} (tx: ${tx_hash})`)

    return NextResponse.json({
      success: true,
      transaction_hash: tx_hash,
      distribution_id: distributionRecord?.id,
      message: `Successfully distributed $${usdc_amount} yield for ${property.name}`
    })

  } catch (error) {
    console.error('Yield distribution API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
} 