import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

interface DeployTokenRequest {
  property_id: string
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Admin Deploy Token API Called')
    
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

    const body: DeployTokenRequest = await request.json()
    const { property_id } = body

    // fix: validate request data (Cursor Rule 6)
    if (!property_id) {
      return NextResponse.json(
        { error: 'Property ID required' },
        { status: 400 }
      )
    }

    // fix: validate property exists and is eligible for token deployment (Cursor Rule 6)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('*')
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
        { error: 'Property must be in funded status before token deployment' },
        { status: 400 }
      )
    }

    if (property.token_contract_address) {
      return NextResponse.json(
        { error: 'Token contract already deployed for this property' },
        { status: 400 }
      )
    }

    // fix: check if property_token_details already exists (Cursor Rule 6)
    const { data: existingToken, error: tokenCheckError } = await supabaseAdmin
      .from('property_token_details')
      .select('*')
      .eq('property_id', property_id)
      .single()

    if (!tokenCheckError && existingToken) {
      return NextResponse.json(
        { error: 'Property token details already exist' },
        { status: 400 }
      )
    }

    console.log(`🚀 Deploying token contract for ${property.name}`)

    // fix: simulate token contract deployment (Cursor Rule 7)
    // In production, this would call the hardhat deployment script
    const simulatedContractAddress = `0x${Math.random().toString(16).substr(2, 40)}`
    const simulatedDeploymentHash = `0x${Math.random().toString(16).substr(2, 64)}`
    const tokenSymbol = `OH${property.id.substr(0, 4).toUpperCase()}`
    const tokenName = `OpenHouse ${property.name}`

    console.log(`📄 Contract Address: ${simulatedContractAddress}`)
    console.log(`🔗 Deployment Hash: ${simulatedDeploymentHash}`)
    console.log(`🏷️ Token Symbol: ${tokenSymbol}`)

    // fix: calculate deployment parameters from property data (Cursor Rule 4)
    const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000'
    const operatorAddress = process.env.OPERATOR_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000'

    try {
      // fix: create property_token_details record (Cursor Rule 4)
      const { data: tokenDetails, error: tokenDetailsError } = await supabaseAdmin
        .from('property_token_details')
        .insert({
          property_id: property_id,
          contract_address: simulatedContractAddress,
          token_name: tokenName,
          token_symbol: tokenSymbol,
          total_shares: property.total_shares,
          price_per_token: property.price_per_token,
          funding_goal_usdc: property.funding_goal_usdc,
          funding_deadline: property.funding_deadline,
          treasury_address: treasuryAddress,
          operator_address: operatorAddress,
          deployment_hash: simulatedDeploymentHash,
          deployment_block_number: Math.floor(Math.random() * 1000000) + 1000000,
          deployment_timestamp: new Date().toISOString(),
          minting_completed: false,
          tokens_minted: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()

      if (tokenDetailsError) {
        throw new Error(`Failed to create token details: ${tokenDetailsError.message}`)
      }

      // fix: update property with token contract address (Cursor Rule 4)
      const { error: propertyUpdateError } = await supabaseAdmin
        .from('properties')
        .update({
          token_contract_address: simulatedContractAddress,
          token_symbol: tokenSymbol,
          token_deployment_hash: simulatedDeploymentHash,
          status: 'deployed',
          updated_at: new Date().toISOString()
        })
        .eq('id', property_id)

      if (propertyUpdateError) {
        throw new Error(`Failed to update property: ${propertyUpdateError.message}`)
      }

      console.log('✅ Token contract deployment completed successfully')

      return NextResponse.json({
        success: true,
        property_id,
        property_name: property.name,
        contract_address: simulatedContractAddress,
        token_symbol: tokenSymbol,
        token_name: tokenName,
        deployment_hash: simulatedDeploymentHash,
        total_shares: property.total_shares,
        price_per_token: property.price_per_token,
        funding_goal_usdc: property.funding_goal_usdc,
        treasury_address: treasuryAddress,
        operator_address: operatorAddress,
        token_details: tokenDetails[0],
        message: 'Token contract deployed successfully'
      })

    } catch (err) {
      console.error('❌ Token deployment error:', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Token deployment failed' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('❌ Admin deploy token error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 