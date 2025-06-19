import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'
import { createPublicClient, http, parseAbi, isAddress, decodeEventLog } from 'viem'
import { baseSepolia } from 'viem/chains'

// fix: add USDC contract ABI for approval verification (Cursor Rule 4)
const USDC_ABI = parseAbi([
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
])

// fix: get environment variables for on-chain verification (Cursor Rule 4)
function getUSDCContractAddress(): string {
  const address = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
  if (!address || !isAddress(address)) {
    throw new Error('USDC contract address not configured or invalid')
  }
  return address
}

// fix: get operator address for USDC approvals - derive from private key for consistency (Cursor Rule 4)
function getOperatorAddress(): string {
  const privateKey = process.env.OPERATOR_PRIVATE_KEY
  if (!privateKey) {
    throw new Error('OPERATOR_PRIVATE_KEY not configured')
  }
  
  try {
    // fix: derive address from private key to ensure frontend/backend consistency (Cursor Rule 4)
    const { privateKeyToAccount } = require('viem/accounts')
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    return account.address
  } catch (error) {
    throw new Error('Failed to derive operator address from private key')
  }
}

function getTreasuryAddress(): string {
  const address = process.env.NEXT_PUBLIC_TREASURY_ADDRESS
  if (!address || !isAddress(address)) {
    throw new Error('Treasury address not configured or invalid')
  }
  return address
}

// fix: verify USDC approval on-chain before accepting reservation (Cursor Rule 4)
async function verifyUSDCApproval(
  approvalHash: string,
  expectedOwner: string,
  expectedAmount: number
): Promise<{ isValid: boolean; error?: string }> {
  try {
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http()
    })

    const usdcAddress = getUSDCContractAddress()
    const operatorAddress = getOperatorAddress()

    // fix: get transaction receipt to verify it exists and succeeded (Cursor Rule 4)
    const receipt = await publicClient.getTransactionReceipt({ 
      hash: approvalHash as `0x${string}` 
    })

    if (receipt.status !== 'success') {
      return { isValid: false, error: 'Transaction failed on-chain' }
    }

    // fix: parse approval events from the transaction logs (Cursor Rule 4)
    const approvalLogs = receipt.logs.filter(log => 
      log.address.toLowerCase() === usdcAddress.toLowerCase()
    )

    if (approvalLogs.length === 0) {
      return { isValid: false, error: 'No USDC events found in transaction' }
    }

    // fix: decode approval events and validate parameters (Cursor Rule 4)
    for (const log of approvalLogs) {
      try {
        const decoded = decodeEventLog({
          abi: USDC_ABI,
          data: log.data,
          topics: log.topics
        })

        if (decoded.eventName === 'Approval') {
          const { owner, spender, value } = decoded.args as {
            owner: string
            spender: string
            value: bigint
          }

          // fix: verify approval parameters match reservation - users must approve operator (Cursor Rule 4)
          const ownerMatches = owner.toLowerCase() === expectedOwner.toLowerCase()
          const spenderMatches = spender.toLowerCase() === operatorAddress.toLowerCase()
          const amountMatches = Number(value) >= (expectedAmount * 1_000_000) // USDC has 6 decimals

          if (ownerMatches && spenderMatches && amountMatches) {
            return { isValid: true }
          }
        }
      } catch (decodeError) {
        // fix: continue checking other logs if one fails to decode (Cursor Rule 6)
        continue
      }
    }

    return { isValid: false, error: 'No matching approval event found' }

  } catch (error) {
    return { isValid: false, error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

interface CreateReservationRequest {
  property_id: string
  usdc_amount: number
  token_amount: number
  approval_hash: string
}

interface CancelReservationRequest {
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

    const body: CreateReservationRequest = await request.json()
    const { property_id, usdc_amount, token_amount, approval_hash } = body

    // fix: validate approval hash is provided (Cursor Rule 4)
    if (!approval_hash || approval_hash === '0x' || approval_hash.length !== 66) {
      return NextResponse.json(
        { error: 'Valid USDC approval transaction hash required (66 characters starting with 0x)' },
        { status: 400 }
      )
    }

    // fix: verify USDC approval on-chain before proceeding (Cursor Rule 4)
    console.log(`Verifying USDC approval: ${approval_hash} for wallet ${walletAddress} amount ${usdc_amount}`)
    const verificationResult = await verifyUSDCApproval(approval_hash, walletAddress, usdc_amount)
    
    if (!verificationResult.isValid) {
      console.log(`USDC approval verification failed: ${verificationResult.error}`)
      return NextResponse.json(
        { error: `Invalid USDC approval: ${verificationResult.error}` },
        { status: 400 }
      )
    }
    
    console.log(`USDC approval verified successfully for ${walletAddress}`)

    // fix: validate request data (Cursor Rule 6)
    if (!property_id || !usdc_amount || !token_amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (usdc_amount <= 0 || token_amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amounts' },
        { status: 400 }
      )
    }

    // fix: validate property exists and is active (Cursor Rule 6)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('id, name, status, funding_deadline, price_per_token, total_shares')
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
        { error: 'Property is not accepting reservations' },
        { status: 400 }
      )
    }

    // fix: check funding deadline (Cursor Rule 6)
    if (new Date(property.funding_deadline) < new Date()) {
      return NextResponse.json(
        { error: 'Funding deadline has passed' },
        { status: 400 }
      )
    }

    // fix: validate price calculation (Cursor Rule 6)
    const expectedUsdcAmount = token_amount * property.price_per_token
    if (Math.abs(usdc_amount - expectedUsdcAmount) > 0.01) {
      return NextResponse.json(
        { error: 'Invalid price calculation' },
        { status: 400 }
      )
    }

    // fix: get user record for proper foreign key relationship (Cursor Rule 4)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('wallet_address', walletAddress)
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User profile not found. Please complete profile setup first.' },
        { status: 400 }
      )
    }

    // fix: check available shares using proper schema (Cursor Rule 6)
    const { data: existingReservations, error: reservationsError } = await supabaseAdmin
      .from('payment_authorizations')
      .select('token_amount')
      .eq('property_id', property_id)
      .in('payment_status', ['pending', 'approved', 'transferred'])

    if (reservationsError) {
      return NextResponse.json(
        { error: 'Failed to validate reservation' },
        { status: 500 }
      )
    }

    const reservedShares = existingReservations?.reduce((sum, res) => sum + res.token_amount, 0) || 0
    const availableShares = property.total_shares - reservedShares

    if (token_amount > availableShares) {
      return NextResponse.json(
        { error: 'Not enough shares available' },
        { status: 400 }
      )
    }

    // fix: check for existing reservation to prevent duplicates (Cursor Rule 4)
    const { data: existingReservation } = await supabaseAdmin
      .from('payment_authorizations')
      .select('id, payment_status')
      .eq('property_id', property_id)
      .eq('wallet_address', walletAddress)
      .single()

    // fix: create reservation using proper schema with verified approval (Cursor Rule 4)
    const reservationData = {
      user_id: user.id, // fix: include user_id for proper foreign key relationship (Cursor Rule 4)
      property_id,
      wallet_address: walletAddress,
      amount: usdc_amount, // fix: include legacy amount field for NOT NULL constraint (Cursor Rule 4)
      usdc_amount: usdc_amount,
      token_amount: token_amount,
      approval_hash: approval_hash,
      approval_timestamp: new Date().toISOString(),
      payment_status: 'approved' // fix: approved only after on-chain verification (Cursor Rule 4)
    }

    let reservation
    if (existingReservation) {
      // fix: update existing reservation if it exists (Cursor Rule 4)
      const { data: updatedReservation, error: updateError } = await supabaseAdmin
        .from('payment_authorizations')
        .update({
          ...reservationData,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingReservation.id)
        .select()

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update reservation' },
          { status: 500 }
        )
      }
      reservation = updatedReservation
    } else {
      // fix: create new reservation (Cursor Rule 4)
      const { data: newReservation, error: insertError } = await supabaseAdmin
        .from('payment_authorizations')
        .insert(reservationData)
        .select()

      if (insertError) {
        return NextResponse.json(
          { error: 'Failed to create reservation' },
          { status: 500 }
        )
      }
      reservation = newReservation
    }

    if (!reservation || reservation.length === 0) {
      return NextResponse.json(
        { error: 'Failed to create reservation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      reservation: reservation[0],
      message: 'Reservation successful! Your USDC approval has been recorded.'
    })

  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
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

    const body: CancelReservationRequest = await request.json()
    const { property_id } = body

    if (!property_id) {
      return NextResponse.json(
        { error: 'Property ID required' },
        { status: 400 }
      )
    }

    // fix: find existing reservation (Cursor Rule 4)
    const { data: existingReservation, error: findError } = await supabaseAdmin
      .from('payment_authorizations')
      .select('id, payment_status')
      .eq('property_id', property_id)
      .eq('wallet_address', walletAddress)
      .single()

    if (findError || !existingReservation) {
      return NextResponse.json(
        { error: 'No reservation found for this property' },
        { status: 404 }
      )
    }

    // fix: prevent cancellation if funds already transferred (Cursor Rule 6)
    if (existingReservation.payment_status === 'transferred') {
      return NextResponse.json(
        { error: 'Cannot cancel - funds have already been collected' },
        { status: 400 }
      )
    }

    // fix: delete the reservation (Cursor Rule 4)
    const { error: deleteError } = await supabaseAdmin
      .from('payment_authorizations')
      .delete()
      .eq('id', existingReservation.id)

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to cancel reservation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Reservation cancelled successfully'
    })

  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
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

    // fix: fetch user reservations using proper schema (Cursor Rule 4)
    const { data: reservations, error } = await supabaseAdmin
      .from('payment_authorizations')
      .select(`
        id,
        property_id,
        usdc_amount,
        token_amount,
        payment_status,
        approval_hash,
        approval_timestamp,
        created_at,
        properties (
          name,
          image_url,
          price_per_token
        )
      `)
      .eq('wallet_address', walletAddress)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch reservations' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      reservations: reservations || []
    })

  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 