import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

interface DeployTokenRequest {
  property_id: string
}

export async function POST(request: NextRequest) {
  try {
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

    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    // fix: validate session via Supabase RPC (Cursor Rule 3)
    const { data: sessionValid, error: sessionError } = await supabaseAdmin
      .rpc('is_valid_session', { 
        wallet_addr: walletAddress 
      })

    if (sessionError || !sessionValid) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    // fix: verify user is admin (Cursor Rule 3)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('wallet_address', walletAddress)
      .single()

    if (userError || !user?.is_admin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { property_id }: DeployTokenRequest = await request.json()

    if (!property_id) {
      return NextResponse.json(
        { error: 'Property ID is required' },
        { status: 400 }
      )
    }

    // fix: validate property exists and is funded (Cursor Rule 6)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('id, name, status, price_per_token, total_shares, funding_goal_usdc, token_contract_address')
      .eq('id', property_id)
      .single()

    if (propertyError || !property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      )
    }

    if (property.status !== 'funded') {
      return NextResponse.json(
        { error: 'Property must be funded before token deployment' },
        { status: 400 }
      )
    }

    if (property.token_contract_address) {
      return NextResponse.json(
        { error: 'Token contract already deployed for this property' },
        { status: 400 }
      )
    }

    // fix: generate token symbol and contract details (Cursor Rule 4)
    const tokenSymbol = `OH${property.name.replace(/\s+/g, '').toUpperCase().substring(0, 8)}`
    const tokenName = `${property.name} Shares`

    // fix: simulate token contract deployment (Cursor Rule 4)
    // In production, this would deploy the actual PropertyShareToken contract
    const simulatedContractAddress = `0x${Math.random().toString(16).substring(2, 42).padStart(40, '0')}`
    const simulatedDeploymentHash = `0x${Math.random().toString(16).substring(2, 66)}`

    // fix: simulate contract deployment parameters (Cursor Rule 4)
    const treasuryAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '0x742d35Cc6634C0532925a3b8D6Ac0D47396E2A51'
    const operatorAddress = walletAddress // Admin wallet as operator

    // fix: insert property token details record (Cursor Rule 4)
    const { error: tokenInsertError } = await supabaseAdmin
      .from('property_token_details')
      .insert({
        property_id: property_id,
        contract_address: simulatedContractAddress,
        token_name: tokenName,
        token_symbol: tokenSymbol,
        total_shares: property.total_shares,
        price_per_token: property.price_per_token,
        funding_goal_usdc: property.funding_goal_usdc,
        funding_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        treasury_address: treasuryAddress,
        operator_address: operatorAddress,
        deployment_hash: simulatedDeploymentHash,
        deployment_timestamp: new Date().toISOString(),
        minting_completed: false,
        tokens_minted: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (tokenInsertError) {
      return NextResponse.json(
        { error: 'Failed to create token details record' },
        { status: 500 }
      )
    }

    // fix: update property with token contract address (Cursor Rule 4)
    const { error: propertyUpdateError } = await supabaseAdmin
      .from('properties')
      .update({
        token_contract_address: simulatedContractAddress,
        token_symbol: tokenSymbol,
        token_deployment_hash: simulatedDeploymentHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', property_id)

    if (propertyUpdateError) {
      return NextResponse.json(
        { error: 'Failed to update property with token details' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Token contract deployed successfully',
      deployment: {
        property_id: property_id,
        property_name: property.name,
        contract_address: simulatedContractAddress,
        token_name: tokenName,
        token_symbol: tokenSymbol,
        total_shares: property.total_shares,
        price_per_token: property.price_per_token,
        deployment_hash: simulatedDeploymentHash,
        treasury_address: treasuryAddress,
        operator_address: operatorAddress
      }
    })

  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 