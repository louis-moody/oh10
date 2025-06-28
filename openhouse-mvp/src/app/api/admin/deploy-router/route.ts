import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { verifyJWT } from '@/lib/jwt'
import { createClient } from '@supabase/supabase-js'

// fix: Supabase admin client (Cursor Rule 3)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// fix: validate admin access (Cursor Rule 5)
async function validateAdminAccess(jwt: string) {
  try {
    const payload = await verifyJWT(jwt)
    if (!payload?.wallet_address) return false

    const { data: isValidResponse } = await supabaseAdmin.rpc('is_valid_session', {
      jwt_id: payload.session_id,
      wallet_addr: payload.wallet_address
    })

    if (!isValidResponse) return false

    const adminWallets = [
      process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS,
      process.env.NEXT_PUBLIC_TREASURY_ADDRESS,
      process.env.NEXT_PUBLIC_OPERATOR_ADDRESS
    ].filter(Boolean).map(addr => addr?.toLowerCase())

    return adminWallets.includes(payload.wallet_address.toLowerCase())
  } catch (error) {
    console.error('Admin validation failed:', error)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 OpenHouseRouter deployment request received')

    // fix: validate admin authentication (Cursor Rule 5)
    const cookieHeader = request.headers.get('cookie')
    const cookies = cookieHeader ? Object.fromEntries(
      cookieHeader.split('; ').map(c => c.split('='))
    ) : {}
    
    const jwt = cookies['openhouse-session']
    if (!jwt) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 })
    }

    const isAdmin = await validateAdminAccess(jwt)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // fix: check if router already deployed (Cursor Rule 4)
    const { data: existingRouter, error: routerError } = await supabaseAdmin
      .from('openhouse_router')
      .select('contract_address, is_active')
      .eq('is_active', true)
      .single()

    if (routerError && routerError.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Failed to check existing router' }, { status: 500 })
    }

    if (existingRouter) {
      return NextResponse.json({
        error: 'OpenHouseRouter already deployed',
        existing_address: existingRouter.contract_address
      }, { status: 400 })
    }

    // fix: get deployment parameters (Cursor Rule 4)
    const { router_fee_basis_points = 10 } = await request.json()

    if (router_fee_basis_points < 0 || router_fee_basis_points > 100) {
      return NextResponse.json({
        error: 'Router fee must be between 0 and 100 basis points (0-1%)'
      }, { status: 400 })
    }

    console.log('📋 Deployment parameters:', {
      router_fee_basis_points,
      deployer: process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS,
      treasury: process.env.NEXT_PUBLIC_TREASURY_ADDRESS,
      operator: process.env.NEXT_PUBLIC_OPERATOR_ADDRESS
    })

    // fix: deploy router via Hardhat script (Cursor Rule 4)
    console.log('⏳ Starting router deployment...')

    const deploymentProcess = spawn('npx', [
      'hardhat', 'run', 'scripts/deploy-openhouse-router.js',
      '--network', process.env.NODE_ENV === 'production' ? 'baseMainnet' : 'baseSepolia'
    ], {
      env: {
        ...process.env,
        ROUTER_FEE_BASIS_POINTS: router_fee_basis_points.toString()
      }
    })

    let deploymentOutput = ''
    let deploymentError = ''

    deploymentProcess.stdout.on('data', (data: Buffer) => {
      deploymentOutput += data.toString()
      console.log('📤 Deployment output:', data.toString())
    })

    deploymentProcess.stderr.on('data', (data: Buffer) => {
      deploymentError += data.toString()
      console.error('📥 Deployment error:', data.toString())
    })

    // fix: wait for deployment completion (Cursor Rule 4)
    const deploymentResult = await new Promise<{
      success: boolean
      contractAddress?: string
      deploymentHash?: string
      error?: string
    }>((resolve) => {
      deploymentProcess.on('close', (code) => {
        console.log(`🔚 Deployment process exited with code: ${code}`)
        
        if (code === 0) {
          // fix: extract contract address from output (Cursor Rule 4)
          const addressMatch = deploymentOutput.match(/Contract Address: (0x[a-fA-F0-9]{40})/)
          const hashMatch = deploymentOutput.match(/Deployment Hash: (0x[a-fA-F0-9]{64})/)
          
          if (addressMatch && hashMatch) {
            resolve({
              success: true,
              contractAddress: addressMatch[1],
              deploymentHash: hashMatch[1]
            })
          } else {
            resolve({
              success: false,
              error: 'Failed to extract contract address from deployment output'
            })
          }
        } else {
          resolve({
            success: false,
            error: deploymentError || 'Deployment process failed'
          })
        }
      })
    })

    if (!deploymentResult.success) {
      return NextResponse.json({
        error: 'Router deployment failed',
        details: deploymentResult.error,
        output: deploymentOutput
      }, { status: 500 })
    }

    console.log('✅ OpenHouseRouter deployed successfully:', {
      address: deploymentResult.contractAddress,
      hash: deploymentResult.deploymentHash
    })

    // fix: return deployment result (Cursor Rule 4)
    return NextResponse.json({
      success: true,
      message: 'OpenHouseRouter deployed successfully',
      contract_address: deploymentResult.contractAddress,
      deployment_hash: deploymentResult.deploymentHash,
      router_fee_basis_points,
      deployment_output: deploymentOutput
    })

  } catch (error) {
    console.error('❌ Router deployment error:', error)
    return NextResponse.json({
      error: 'Router deployment failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 