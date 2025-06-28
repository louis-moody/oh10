import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // fix: get current chain ID from request or default to Base Sepolia (Cursor Rule 4)
    const { searchParams } = new URL(request.url)
    const chainId = searchParams.get('chainId') || '84532'

    // fix: fetch active router configuration (Cursor Rule 4)
    const { data: router, error } = await supabaseAdmin
      .from('openhouse_router')
      .select('contract_address, router_fee_basis_points, is_active')
      .eq('chain_id', parseInt(chainId))
      .eq('is_active', true)
      .single()

    if (error || !router) {
      return NextResponse.json({
        error: 'No active router found for this chain',
        chain_id: chainId
      }, { status: 404 })
    }

    return NextResponse.json({
      router_address: router.contract_address,
      router_fee_basis_points: router.router_fee_basis_points,
      chain_id: chainId
    })

  } catch (error) {
    console.error('❌ Router config fetch failed:', error)
    return NextResponse.json({
      error: 'Failed to fetch router configuration'
    }, { status: 500 })
  }
} 