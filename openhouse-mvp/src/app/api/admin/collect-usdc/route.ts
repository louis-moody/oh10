import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'
import { createWalletClient, http, parseUnits, formatUnits, parseEther } from 'viem'
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

// fix: get environment-specific addresses (Cursor Rule 4)
function getUsdcAddress(chainId: number): `0x${string}` {
  switch (chainId) {
    case base.id:
      return '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base Mainnet USDC
    case baseSepolia.id:
      return '0x036CbD53842c542668d858Cdf5Ff6eC9C2FcA5D7' // Base Sepolia USDC
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

    if (property.status !== 'active') {
      return NextResponse.json(
        { error: 'Property is not active for funding' },
        { status: 400 }
      )
    }

    if (!property.token_contract_address) {
      return NextResponse.json(
        { error: 'Property token contract not deployed yet' },
        { status: 400 }
      )
    }

    // fix: check if funding deadline has passed (Cursor Rule 6)
    if (new Date(property.funding_deadline) > new Date()) {
      return NextResponse.json(
        { error: 'Funding deadline has not yet passed' },
        { status: 400 }
      )
    }

    // fix: fetch all approved reservations for this property (Cursor Rule 4)
    const { data: reservations, error: reservationsError } = await supabaseAdmin
      .from('payment_authorizations')
      .select('id, wallet_address, usdc_amount, token_amount, payment_status')
      .eq('property_id', property_id)
      .eq('payment_status', 'approved')

    if (reservationsError) {
      return NextResponse.json(
        { error: 'Failed to fetch reservations' },
        { status: 500 }
      )
    }

    if (!reservations || reservations.length === 0) {
      return NextResponse.json(
        { error: 'No approved reservations found for this property' },
        { status: 400 }
      )
    }

    // fix: calculate total funding amount (Cursor Rule 6)
    const totalFunding = reservations.reduce((sum, res) => sum + parseFloat(res.usdc_amount.toString()), 0)

    // fix: verify funding goal is met (Cursor Rule 6)
    if (totalFunding < parseFloat(property.funding_goal_usdc.toString())) {
      return NextResponse.json(
        { error: 'Funding goal not yet reached' },
        { status: 400 }
      )
    }

    console.log(`🏠 Processing USDC collection for: ${property.name}`)
    console.log(`💰 Total funding to collect: $${totalFunding.toLocaleString()}`)
    console.log(`👥 Number of investors: ${reservations.length}`)

    // fix: initialize blockchain clients (Cursor Rule 4)
    const chainId = getChainId()
    const usdcAddress = getUsdcAddress(chainId)
    const treasuryAddress = getTreasuryAddress()
    const operatorPrivateKey = getOperatorPrivateKey()
    
    const account = privateKeyToAccount(operatorPrivateKey)
    const chain = chainId === base.id ? base : baseSepolia
    
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http()
    })

    // fix: process USDC collection and token minting for each reservation (Cursor Rule 4)
    let successCount = 0
    let failureCount = 0
    const processedReservations = []

    for (const reservation of reservations) {
      try {
        console.log(`💸 Processing: ${reservation.wallet_address} - $${reservation.usdc_amount}`)

        // fix: convert USDC amount to wei (6 decimals) (Cursor Rule 4)
        const usdcAmountWei = parseUnits(reservation.usdc_amount.toString(), 6)
        
        // fix: collect USDC from investor to treasury (Cursor Rule 4)
        const transferHash = await walletClient.writeContract({
          address: usdcAddress,
          abi: USDC_ABI,
          functionName: 'transferFrom',
          args: [
            reservation.wallet_address as `0x${string}`,
            treasuryAddress,
            usdcAmountWei
          ]
        })

        console.log(`✅ USDC transfer successful: ${transferHash}`)

        // fix: mint property tokens to investor (Cursor Rule 4)
        const tokenAmount = BigInt(reservation.token_amount)
        const mintHash = await walletClient.writeContract({
          address: property.token_contract_address as `0x${string}`,
          abi: PROPERTY_SHARE_TOKEN_ABI,
          functionName: 'mintTo',
          args: [
            reservation.wallet_address as `0x${string}`,
            tokenAmount
          ]
        })

        console.log(`🎯 Token minting successful: ${mintHash}`)

        // fix: update reservation status with transaction hashes (Cursor Rule 4)
        const { error: updateError } = await supabaseAdmin
          .from('payment_authorizations')
          .update({
            payment_status: 'transferred',
            transfer_hash: transferHash,
            transfer_timestamp: new Date().toISOString(),
            tokens_minted: true,
            mint_hash: mintHash,
            mint_timestamp: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', reservation.id)

        if (updateError) {
          console.warn(`⚠️ Database update failed: ${updateError.message}`)
        }

        // fix: create user holding record (Cursor Rule 4)
        const { error: holdingError } = await supabaseAdmin
          .from('user_holdings')
          .upsert({
            wallet_address: reservation.wallet_address,
            property_id: property_id,
            token_balance: reservation.token_amount,
            total_invested_usdc: reservation.usdc_amount,
            average_purchase_price: property.price_per_token,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'wallet_address,property_id'
          })

        if (holdingError) {
          console.warn(`⚠️ User holding creation failed: ${holdingError.message}`)
        }

        // fix: create transaction records (Cursor Rule 4)
        const transactions = [
          {
            user_address: reservation.wallet_address,
            property_id: property_id,
            type: 'usdc_collection',
            amount: reservation.usdc_amount,
            tx_hash: transferHash,
            created_at: new Date().toISOString()
          },
          {
            user_address: reservation.wallet_address,
            property_id: property_id,
            type: 'token_mint',
            amount: reservation.token_amount,
            tx_hash: mintHash,
            created_at: new Date().toISOString()
          }
        ]

        const { error: transactionError } = await supabaseAdmin
          .from('transactions')
          .insert(transactions)

        if (transactionError) {
          console.warn(`⚠️ Transaction logging failed: ${transactionError.message}`)
        }

        processedReservations.push({
          wallet_address: reservation.wallet_address,
          usdc_amount: reservation.usdc_amount,
          token_amount: reservation.token_amount,
          transfer_hash: transferHash,
          mint_hash: mintHash,
          status: 'success'
        })

        successCount++
        console.log(`✅ Successfully processed reservation ${reservation.id}`)

      } catch (err) {
        console.error(`❌ Failed to process reservation ${reservation.id}:`, err)
        
        failureCount++
        processedReservations.push({
          wallet_address: reservation.wallet_address,
          usdc_amount: reservation.usdc_amount,
          token_amount: reservation.token_amount,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error'
        })

        // fix: mark reservation as failed (Cursor Rule 4)
        await supabaseAdmin
          .from('payment_authorizations')
          .update({
            payment_status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', reservation.id)
      }
    }

    // fix: update property status if all successful (Cursor Rule 4)
    if (successCount > 0 && failureCount === 0) {
      const { error: statusUpdateError } = await supabaseAdmin
        .from('properties')
        .update({
          status: 'funded'
        })
        .eq('id', property_id)

      if (statusUpdateError) {
        console.warn(`⚠️ Property status update failed: ${statusUpdateError.message}`)
      }
    }

    console.log(`📊 Final Results:`)
    console.log(`   ✅ Successful: ${successCount}/${reservations.length}`)
    console.log(`   ❌ Failed: ${failureCount}/${reservations.length}`)
    console.log(`   💰 Total collected: $${(successCount / reservations.length * totalFunding).toLocaleString()}`)

    return NextResponse.json({
      success: true,
      message: 'USDC collection and token minting completed',
      summary: {
        total_reservations: reservations.length,
        successful_collections: successCount,
        failed_collections: failureCount,
        total_amount_collected: successCount / reservations.length * totalFunding,
        property_status: successCount > 0 && failureCount === 0 ? 'funded' : 'partially_funded'
      },
      processed_reservations: processedReservations
    })

  } catch (error) {
    console.error('❌ USDC collection failed:', error)
    return NextResponse.json(
      { error: 'Internal server error during USDC collection' },
      { status: 500 }
    )
  }
} 