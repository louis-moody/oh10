import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

interface CollectUsdcRequest {
  property_id: string
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Admin Collect USDC API Called')
    
    // fix: verify JWT token from cookie (Cursor Rule 3)
    const token = request.cookies.get('app-session-token')?.value
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

    const walletAddress = payload.wallet_address.toLowerCase()
    console.log('🎯 Authenticated wallet:', walletAddress)

    // fix: verify admin access (Cursor Rule 5)
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('wallet_address', walletAddress)
      .single()

    if (userError || !userData?.is_admin) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      )
    }

    const body: CollectUsdcRequest = await request.json()
    const { property_id } = body

    // fix: validate request data (Cursor Rule 6)
    if (!property_id) {
      return NextResponse.json(
        { error: 'Property ID required' },
        { status: 400 }
      )
    }

    // fix: validate property exists and is eligible for USDC collection (Cursor Rule 6)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('id, name, status, funding_goal_usdc, token_contract_address')
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
        { error: 'Property is not in active status' },
        { status: 400 }
      )
    }

    if (property.token_contract_address) {
      return NextResponse.json(
        { error: 'USDC already collected for this property' },
        { status: 400 }
      )
    }

    // fix: fetch approved reservations (Cursor Rule 4)
    const { data: reservations, error: reservationsError } = await supabaseAdmin
      .from('payment_authorizations')
      .select('*')
      .eq('property_id', property_id)
      .eq('payment_status', 'approved')
      .order('created_at', { ascending: true })

    if (reservationsError) {
      console.error('Error fetching reservations:', reservationsError)
      return NextResponse.json(
        { error: 'Failed to fetch reservations' },
        { status: 500 }
      )
    }

    if (!reservations || reservations.length === 0) {
      return NextResponse.json(
        { error: 'No approved reservations found' },
        { status: 400 }
      )
    }

    // fix: calculate total funding and validate goal met (Cursor Rule 4)
    const totalFunding = reservations.reduce((sum, res) => sum + parseFloat(res.usdc_amount), 0)
    const fundingProgress = (totalFunding / property.funding_goal_usdc) * 100

    if (fundingProgress < 100) {
      return NextResponse.json(
        { error: `Funding goal not met. Current: ${fundingProgress.toFixed(1)}%` },
        { status: 400 }
      )
    }

    console.log(`💰 Processing USDC collection for ${property.name}`)
    console.log(`📊 Total funding: $${totalFunding.toLocaleString()}`)
    console.log(`🎯 Reservations: ${reservations.length}`)

    // fix: simulate USDC collection process (Cursor Rule 7)
    // In production, this would call transferFrom() on USDC contract for each reservation
    let successCount = 0
    let failureCount = 0
    const results = []

    for (const reservation of reservations) {
      try {
        console.log(`💳 Processing: ${reservation.wallet_address} - $${reservation.usdc_amount}`)
        
        // fix: simulate successful USDC transfer (Cursor Rule 7)
        // In production: await usdcContract.transferFrom(reservation.wallet_address, treasuryAddress, amount)
        
        // fix: update payment status to transferred (Cursor Rule 4)
        const { error: updateError } = await supabaseAdmin
          .from('payment_authorizations')
          .update({
            payment_status: 'transferred',
            transfer_timestamp: new Date().toISOString(),
            transfer_hash: `0x${Math.random().toString(16).substr(2, 64)}`, // Simulate tx hash
            updated_at: new Date().toISOString()
          })
          .eq('id', reservation.id)

        if (updateError) {
          throw new Error(`Failed to update reservation: ${updateError.message}`)
        }

        successCount++
        results.push({
          wallet_address: reservation.wallet_address,
          amount: reservation.usdc_amount,
          status: 'success'
        })

      } catch (err) {
        console.error(`❌ Failed to process reservation ${reservation.id}:`, err)
        failureCount++
        results.push({
          wallet_address: reservation.wallet_address,
          amount: reservation.usdc_amount,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    // fix: update property status to funded if all transfers successful (Cursor Rule 4)
    if (successCount === reservations.length) {
      const { error: statusUpdateError } = await supabaseAdmin
        .from('properties')
        .update({
          status: 'funded',
          updated_at: new Date().toISOString()
        })
        .eq('id', property_id)

      if (statusUpdateError) {
        console.error('Failed to update property status:', statusUpdateError)
      } else {
        console.log('✅ Property status updated to funded')
      }
    }

    console.log(`🎉 USDC collection complete: ${successCount} success, ${failureCount} failures`)

    return NextResponse.json({
      success: true,
      property_id,
      property_name: property.name,
      total_funding: totalFunding,
      reservations_processed: reservations.length,
      successful_transfers: successCount,
      failed_transfers: failureCount,
      results,
      message: `USDC collection ${successCount === reservations.length ? 'completed successfully' : 'completed with some failures'}`
    })

  } catch (error) {
    console.error('❌ Admin collect USDC error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 