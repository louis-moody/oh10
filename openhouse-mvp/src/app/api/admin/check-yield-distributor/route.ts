import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: check which properties need YieldDistributor deployment (Cursor Rule 4)
export async function GET(req: NextRequest) {
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

    // fix: find properties with deployed tokens but no YieldDistributor (Cursor Rule 4)
    const { data: propertiesNeedingYieldDistributor, error } = await supabaseAdmin
      .from('property_token_details')
      .select(`
        property_id,
        contract_address,
        token_name,
        token_symbol,
        yield_distributor_address,
        rental_wallet_address,
        properties!inner(
          id,
          name,
          status
        )
      `)
      .not('contract_address', 'is', null)
      .is('yield_distributor_address', null)

    if (error) {
      console.error('Error checking YieldDistributor status:', error)
      return NextResponse.json({ error: 'Failed to check YieldDistributor status' }, { status: 500 })
    }

    // fix: find properties with YieldDistributor already deployed (Cursor Rule 4)
    const { data: propertiesWithYieldDistributor, error: deployedError } = await supabaseAdmin
      .from('property_token_details')
      .select(`
        property_id,
        contract_address,
        token_name,
        token_symbol,
        yield_distributor_address,
        rental_wallet_address,
        properties!inner(
          id,
          name,
          status
        )
      `)
      .not('contract_address', 'is', null)
      .not('yield_distributor_address', 'is', null)

    if (deployedError) {
      console.error('Error checking deployed YieldDistributor:', deployedError)
      return NextResponse.json({ error: 'Failed to check deployed YieldDistributor' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      needs_deployment: propertiesNeedingYieldDistributor || [],
      already_deployed: propertiesWithYieldDistributor || [],
      summary: {
        needs_deployment_count: propertiesNeedingYieldDistributor?.length || 0,
        already_deployed_count: propertiesWithYieldDistributor?.length || 0
      }
    })

  } catch (error) {
    console.error('Error in check-yield-distributor:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 