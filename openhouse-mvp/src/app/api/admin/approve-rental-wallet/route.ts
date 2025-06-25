import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'
import { spawn } from 'child_process'

// fix: API endpoint to approve rental wallet for YieldDistributor (Cursor Rule 4)
export async function POST(req: NextRequest) {
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

    const { property_id } = await req.json()

    if (!property_id) {
      return NextResponse.json({ error: 'Property ID is required' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // fix: get property token details for approval (Cursor Rule 4)
    const { data: tokenDetails, error: tokenError } = await supabaseAdmin
      .from('property_token_details')
      .select('yield_distributor_address, rental_wallet_address')
      .eq('property_id', property_id)
      .single()

    if (tokenError || !tokenDetails?.yield_distributor_address) {
      return NextResponse.json({ 
        error: 'YieldDistributor not found for this property' 
      }, { status: 404 })
    }

    if (!tokenDetails.rental_wallet_address) {
      return NextResponse.json({ 
        error: 'Rental wallet address not configured for this property' 
      }, { status: 404 })
    }

    console.log('🔐 Running rental wallet approval via API...')
    console.log('   Property ID:', property_id)
    console.log('   YieldDistributor:', tokenDetails.yield_distributor_address)
    console.log('   Rental Wallet:', tokenDetails.rental_wallet_address)

    // fix: run the approval script via Hardhat (Cursor Rule 4)
    const approvalProcess = spawn('npx', [
      'hardhat', 'run', 'scripts/approve-rental-wallet.js',
      '--network', 'baseSepolia'
    ], {
      env: {
        ...process.env,
        TARGET_PROPERTY_ID: property_id,
        TARGET_YIELD_DISTRIBUTOR: tokenDetails.yield_distributor_address,
        TARGET_RENTAL_WALLET: tokenDetails.rental_wallet_address
      }
    })

    let approvalOutput = ''
    let approvalError = ''

    approvalProcess.stdout.on('data', (data: Buffer) => {
      approvalOutput += data.toString()
      console.log('APPROVAL:', data.toString().trim())
    })

    approvalProcess.stderr.on('data', (data: Buffer) => {
      approvalError += data.toString()
      console.error('APPROVAL ERROR:', data.toString().trim())
    })

    const approvalResult = await new Promise<{success: boolean, txHash?: string}>((resolve) => {
      approvalProcess.on('close', (code: number) => {
        if (code === 0) {
          // Parse transaction hash from output
          const txHashMatch = approvalOutput.match(/Transaction sent: (0x[a-fA-F0-9]{64})/)
          resolve({
            success: true,
            txHash: txHashMatch?.[1]
          })
        } else {
          console.error('Approval script failed:', approvalError)
          resolve({ success: false })
        }
      })
    })

    if (approvalResult.success) {
      return NextResponse.json({
        success: true,
        message: 'Rental wallet approval completed successfully',
        transaction_hash: approvalResult.txHash,
        yield_distributor_address: tokenDetails.yield_distributor_address,
        rental_wallet_address: tokenDetails.rental_wallet_address,
        explorer_url: approvalResult.txHash 
          ? `https://sepolia.basescan.org/tx/${approvalResult.txHash}`
          : undefined
      })
    } else {
      return NextResponse.json({
        success: false,
        error: 'Approval script failed',
        details: approvalError || 'Unknown error during approval'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error in approve-rental-wallet:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 