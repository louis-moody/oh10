import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'
import { createWalletClient, createPublicClient, http, parseUnits } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

interface CollectUsdcRequest {
  property_id: string
}

// fix: USDC contract ABI for transferFrom calls (Cursor Rule 4)
const USDC_ABI = [
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transferFrom',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// fix: PropertyShareToken ABI for minting (Cursor Rule 4)
const PROPERTY_SHARE_TOKEN_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'mintTo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalMinted',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'mintingCompleted',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// fix: get USDC address from environment or fallback to chain defaults (Cursor Rule 4)
function getUsdcAddress(chainId: number): `0x${string}` {
  // fix: check environment variable first (Cursor Rule 4)
  const envUsdcAddress = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
  if (envUsdcAddress) {
    return envUsdcAddress as `0x${string}`
  }
  
  // fix: fallback to chain-specific defaults (Cursor Rule 4)
  switch (chainId) {
    case base.id:
      return '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base Mainnet USDC
    case baseSepolia.id:
      return '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`)
  }
}

function getTreasuryAddress(): `0x${string}` {
  const treasury = process.env.TREASURY_WALLET_ADDRESS
  if (!treasury) {
    throw new Error('TREASURY_WALLET_ADDRESS environment variable is required')
  }
  return treasury as `0x${string}`
}

function getOperatorPrivateKey(): `0x${string}` {
  const privateKey = process.env.OPERATOR_PRIVATE_KEY
  if (!privateKey) {
    throw new Error('OPERATOR_PRIVATE_KEY environment variable is required')
  }
  return privateKey as `0x${string}`
}

function getDeployerPrivateKey(): `0x${string}` {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY environment variable is required')
  }
  return privateKey as `0x${string}`
}

function getChainId(): number {
  const chainId = process.env.NEXT_PUBLIC_BASE_CHAIN_ID
  return chainId ? parseInt(chainId) : baseSepolia.id
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

    const { property_id }: CollectUsdcRequest = await request.json()

    if (!property_id) {
      return NextResponse.json(
        { error: 'Property ID is required' },
        { status: 400 }
      )
    }

    // fix: validate property exists and get contract address (Cursor Rule 6)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('id, name, status, funding_goal_usdc, funding_deadline, token_contract_address, price_per_token')
      .eq('id', property_id)
      .single()

    if (propertyError || !property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      )
    }

    // fix: prevent collection from flagged properties (Cursor Rule 4)
    if (property.status.startsWith('flagged_')) {
      return NextResponse.json(
        { error: 'Cannot collect USDC from flagged property. Property must be reviewed and cleared first.' },
        { status: 400 }
      )
    }

    // fix: PRD requirement - only allow USDC collection when status is 'funded' (Cursor Rule 4)
    if (property.status !== 'funded') {
      return NextResponse.json(
        { error: 'Property must have status "funded" to collect USDC. Current status: ' + property.status },
        { status: 400 }
      )
    }

    // fix: PRD requirement - USDC collection happens BEFORE token deployment, not after (Cursor Rule 4)
    // Token contract is deployed AFTER USDC collection is complete

    // fix: fetch payment authorizations for USDC collection (Cursor Rule 4)
    const { data: paymentAuthorizations, error: authError } = await supabaseAdmin
      .from('payment_authorizations')
      .select('id, wallet_address, usdc_amount, payment_status, approval_hash')
      .eq('property_id', property_id)
      .eq('payment_status', 'approved')

    if (authError) {
      return NextResponse.json(
        { error: 'Failed to fetch payment authorizations' },
        { status: 500 }
      )
    }

    if (!paymentAuthorizations || paymentAuthorizations.length === 0) {
      return NextResponse.json(
        { error: 'No approved payment authorizations found for this property' },
        { status: 400 }
      )
    }

    // fix: verify funding goal is met (Cursor Rule 6)
    const totalFunding = paymentAuthorizations.reduce((sum, auth) => sum + parseFloat(auth.usdc_amount.toString()), 0)

    if (totalFunding < parseFloat(property.funding_goal_usdc.toString())) {
      return NextResponse.json(
        { error: 'Funding goal not yet reached' },
        { status: 400 }
      )
    }

    // fix: initialize blockchain client for USDC collection only (Cursor Rule 4)
    const chainId = getChainId()
    const usdcAddress = getUsdcAddress(chainId)
    const treasuryAddress = getTreasuryAddress()
    const operatorPrivateKey = getOperatorPrivateKey()
    
    const operatorAccount = privateKeyToAccount(operatorPrivateKey)

    console.log(`🏠 Processing USDC collection for: ${property.name}`)
    console.log(`💰 Total funding to collect: $${totalFunding.toLocaleString()}`)
    console.log(`👥 Number of investors: ${paymentAuthorizations.length}`)
    console.log(`🏦 USDC Contract: ${usdcAddress}`)
    console.log(`🏛️ Treasury Address: ${treasuryAddress}`)
    console.log(`🔑 Operator Signer: ${operatorAccount.address}`)

    const chain = chainId === base.id ? base : baseSepolia
    
    const operatorWalletClient = createWalletClient({
      account: operatorAccount,
      chain,
      transport: http()
    })

    const publicClient = createPublicClient({
      chain,
      transport: http()
    })

    // fix: process USDC collection with delay between calls to avoid nonce contention (PRD requirement)
    let successCount = 0
    let failureCount = 0
    const processedTransfers = []

    for (const authorization of paymentAuthorizations) {
      try {
        console.log(`💸 Processing USDC transfer: ${authorization.wallet_address} - $${authorization.usdc_amount}`)

        // fix: convert USDC amount to wei (6 decimals) (Cursor Rule 4)
        const usdcAmountWei = parseUnits(authorization.usdc_amount.toString(), 6)
        
        // fix: collect approved USDC from investor to treasury (Cursor Rule 4)
        const transferHash = await operatorWalletClient.writeContract({
          address: usdcAddress,
          abi: USDC_ABI,
          functionName: 'transferFrom',
          args: [
            authorization.wallet_address as `0x${string}`,
            treasuryAddress,
            usdcAmountWei
          ]
        })

        console.log(`⏳ USDC transfer submitted: ${transferHash}`)

        // fix: wait for transaction confirmation (Cursor Rule 4)
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: transferHash
        })

        if (receipt.status !== 'success') {
          throw new Error('Transaction failed on-chain')
        }

        console.log(`✅ USDC transfer confirmed: ${transferHash}`)

        // fix: update payment authorization with transfer details using existing schema (Cursor Rule 4)
        const { error: updateError } = await supabaseAdmin
          .from('payment_authorizations')
          .update({
            payment_status: 'transferred',
            updated_at: new Date().toISOString()
          })
          .eq('id', authorization.id)

        if (updateError) {
          console.warn(`⚠️ Failed to update payment authorization: ${updateError.message}`)
        }

        // fix: create transaction record (Cursor Rule 4)
        const { error: transactionError } = await supabaseAdmin
          .from('transactions')
          .insert({
            user_address: authorization.wallet_address,
            property_id: property_id,
            type: 'usdc_collection',
            amount: authorization.usdc_amount,
            tx_hash: transferHash,
            created_at: new Date().toISOString()
          })

        if (transactionError) {
          console.warn(`⚠️ Failed to create transaction record: ${transactionError.message}`)
        }

        processedTransfers.push({
          wallet_address: authorization.wallet_address,
          usdc_amount: authorization.usdc_amount,
          transfer_hash: transferHash,
          status: 'success'
        })

        successCount++
        console.log(`✅ Successfully processed USDC transfer for ${authorization.wallet_address}`)

        // fix: PRD requirement - add delay between transfers to avoid nonce contention
        if (authorization !== paymentAuthorizations[paymentAuthorizations.length - 1]) {
          console.log('⏳ Waiting 1 second before next transfer...')
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error(`❌ Failed to process USDC transfer for ${authorization.wallet_address}:`, errorMessage)
        
        processedTransfers.push({
          wallet_address: authorization.wallet_address,
          usdc_amount: authorization.usdc_amount,
          transfer_hash: null,
          status: 'failed',
          error: errorMessage
        })

        failureCount++
      }
    }

    // fix: update property status to 'collected' when all USDC transfers are successful (PRD requirement)
    if (successCount > 0 && failureCount === 0) {
      const { error: statusUpdateError } = await supabaseAdmin
        .from('properties')
        .update({
          status: 'collected'
          // Note: properties table doesn't have updated_at column based on actual schema
        })
        .eq('id', property_id)

      if (statusUpdateError) {
        console.error(`❌ Failed to update property status to collected: ${statusUpdateError.message}`)
      } else {
        console.log(`✅ Property status updated to 'collected'`)
      }
    }

    const summary = {
      total_authorizations: paymentAuthorizations.length,
      successful_transfers: successCount,
      failed_transfers: failureCount,
      total_usdc_collected: processedTransfers
        .filter(t => t.status === 'success')
        .reduce((sum, t) => sum + parseFloat(t.usdc_amount.toString()), 0),
      property_status: successCount > 0 && failureCount === 0 ? 'collected' : 'partially_collected'
    }

    return NextResponse.json({
      success: true,
      message: `USDC collection ${failureCount === 0 ? 'completed successfully' : 'completed with some failures'}`,
      summary,
      processed_transfers: processedTransfers
    })

  } catch (error) {
    console.error('❌ USDC collection failed:', error)
    return NextResponse.json(
      { error: `USDC collection failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
} 