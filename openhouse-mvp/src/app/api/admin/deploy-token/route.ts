import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'
import { createWalletClient, createPublicClient, http, parseUnits, keccak256, toBytes } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

interface DeployTokenRequest {
  property_id: string
}

// fix: PropertyShareToken contract bytecode and ABI for deployment (Cursor Rule 4)
const PROPERTY_SHARE_TOKEN_ABI = [
  {
    inputs: [
      { name: '_name', type: 'string' },
      { name: '_symbol', type: 'string' },
      { name: '_propertyId', type: 'uint256' },
      { name: '_totalShares', type: 'uint256' },
      { name: '_pricePerToken', type: 'uint256' },
      { name: '_fundingGoalUsdc', type: 'uint256' },
      { name: '_fundingDeadline', type: 'uint256' },
      { name: '_treasury', type: 'address' },
      { name: '_operator', type: 'address' }
    ],
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'mintTo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const

// fix: get environment-specific configuration (Cursor Rule 4)
function getDeployerPrivateKey(): `0x${string}` {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY environment variable is required')
  }
  return privateKey as `0x${string}`
}

function getTreasuryAddress(): `0x${string}` {
  const treasury = process.env.TREASURY_WALLET_ADDRESS
  if (!treasury) {
    throw new Error('TREASURY_WALLET_ADDRESS environment variable is required')
  }
  return treasury as `0x${string}`
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

    const { property_id }: DeployTokenRequest = await request.json()

    if (!property_id) {
      return NextResponse.json(
        { error: 'Property ID is required' },
        { status: 400 }
      )
    }

    // fix: validate property exists and funding goal is met (Cursor Rule 6)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('id, name, status, price_per_token, total_shares, funding_goal_usdc, funding_deadline, token_contract_address, token_symbol')
      .eq('id', property_id)
      .single()

    if (propertyError || !property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      )
    }

    // fix: prevent deployment on flagged properties (Cursor Rule 4)
    if (property.status.startsWith('flagged_')) {
      return NextResponse.json(
        { error: 'Cannot deploy token for flagged property. Property must be reviewed and cleared first.' },
        { status: 400 }
      )
    }

    // fix: PRD requirement - only allow token deployment when status is 'collected' (Cursor Rule 4)
    if (property.status !== 'collected') {
      return NextResponse.json(
        { error: 'Property must have status "collected" to deploy token contract. Current status: ' + property.status },
        { status: 400 }
      )
    }

    if (property.token_contract_address) {
      return NextResponse.json(
        { error: 'Token contract already deployed for this property' },
        { status: 400 }
      )
    }

    // fix: verify funding goal is met - check transferred payments (Cursor Rule 6)
    const { data: reservations, error: reservationsError } = await supabaseAdmin
      .from('payment_authorizations')
      .select('usdc_amount')
      .eq('property_id', property_id)
      .eq('payment_status', 'transferred')

    if (reservationsError) {
      return NextResponse.json(
        { error: 'Failed to validate funding progress' },
        { status: 500 }
      )
    }

    const totalFunding = reservations?.reduce((sum, res) => sum + parseFloat(res.usdc_amount.toString()), 0) || 0

    if (totalFunding < parseFloat(property.funding_goal_usdc.toString())) {
      return NextResponse.json(
        { error: 'Funding goal not yet reached' },
        { status: 400 }
      )
    }

    console.log(`🚀 Deploying PropertyShareToken for: ${property.name}`)
    console.log(`💰 Funding goal met: $${totalFunding.toLocaleString()}`)

    // fix: use token symbol from Supabase database (Cursor Rule 4)
    const tokenSymbol = property.token_symbol || `OH${property.name.replace(/\s+/g, '').toUpperCase().substring(0, 8)}`
    const tokenName = `${property.name} Shares`

    // fix: initialize blockchain client for deployment (Cursor Rule 4)
    const chainId = getChainId()
    const deployerPrivateKey = getDeployerPrivateKey()
    const treasuryAddress = getTreasuryAddress()
    
    const account = privateKeyToAccount(deployerPrivateKey)
    const chain = chainId === base.id ? base : baseSepolia
    
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http()
    })

    // fix: prepare contract constructor arguments (Cursor Rule 4)
    // Convert UUID to numeric hash for propertyId
    const tokenPropertyIdHash = property_id.replace(/-/g, '').split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0)
    }, 0)
    
    const constructorArgs = [
      tokenName, // _name
      tokenSymbol, // _symbol
      BigInt(tokenPropertyIdHash), // _propertyId (convert UUID to numeric hash)
      BigInt(property.total_shares), // _totalShares
      parseUnits(property.price_per_token.toString(), 6), // _pricePerToken (USDC has 6 decimals)
      parseUnits(property.funding_goal_usdc.toString(), 6), // _fundingGoalUsdc
      BigInt(Math.floor(new Date(property.funding_deadline).getTime() / 1000)), // _fundingDeadline (unix timestamp)
      treasuryAddress, // _treasury
      account.address // _operator (deployer as operator)
    ] as const

    console.log(`📝 Contract arguments:`, {
      name: tokenName,
      symbol: tokenSymbol,
      totalShares: property.total_shares,
      pricePerToken: property.price_per_token,
      treasury: treasuryAddress,
      operator: account.address
    })

    // fix: deploy PropertyShareToken contract using Hardhat script (Cursor Rule 4)
    console.log('🚀 Deploying PropertyShareToken via Hardhat...')
    
    // Use Hardhat deployment script instead of direct bytecode
    const { spawn } = require('child_process')
    
    const deploymentProcess = spawn('npx', [
      'hardhat', 'run', 'scripts/deploy-property-token.js', 
      '--network', chainId === base.id ? 'baseMainnet' : 'baseSepolia'
    ], {
      env: {
        ...process.env,
        PROPERTY_ID: property_id,
        TOKEN_NAME: tokenName,
        TOKEN_SYMBOL: tokenSymbol,
        TOTAL_SHARES: property.total_shares.toString(),
        PRICE_PER_TOKEN: property.price_per_token.toString(),
        FUNDING_GOAL_USDC: property.funding_goal_usdc.toString(),
        FUNDING_DEADLINE: property.funding_deadline,
        TREASURY_ADDRESS: treasuryAddress,
        OPERATOR_ADDRESS: account.address
      }
    })

    let deploymentOutput = ''
    let deploymentError = ''

    deploymentProcess.stdout.on('data', (data: Buffer) => {
      deploymentOutput += data.toString()
    })

    deploymentProcess.stderr.on('data', (data: Buffer) => {
      deploymentError += data.toString()
    })

    const deploymentResult = await new Promise<{success: boolean, contractAddress?: string, deploymentHash?: string}>((resolve) => {
      deploymentProcess.on('close', (code: number) => {
        if (code === 0) {
          // Parse contract address and deployment hash from output
          const addressMatch = deploymentOutput.match(/Contract deployed at: (0x[a-fA-F0-9]{40})/)
          const hashMatch = deploymentOutput.match(/Deployment hash: (0x[a-fA-F0-9]{64})/)
          
          if (addressMatch && hashMatch) {
            resolve({
              success: true,
              contractAddress: addressMatch[1],
              deploymentHash: hashMatch[1]
            })
          } else {
            resolve({ success: false })
          }
        } else {
          console.error('Hardhat deployment failed:', deploymentError)
          resolve({ success: false })
        }
      })
    })

    if (!deploymentResult.success || !deploymentResult.contractAddress) {
      throw new Error(`PropertyShareToken deployment failed: ${deploymentError}`)
    }

    const contractAddress = deploymentResult.contractAddress as `0x${string}`
    const deploymentHash = deploymentResult.deploymentHash as `0x${string}`
    
    console.log(`✅ PropertyShareToken deployed at: ${contractAddress}`)
    console.log(`⏳ Deployment transaction: ${deploymentHash}`)

    // fix: wait for deployment confirmation using publicClient (Cursor Rule 4)
    const publicClient = createPublicClient({
      chain,
      transport: http()
    })
    
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: deploymentHash
    })

    if (!receipt.contractAddress) {
      throw new Error('Contract deployment failed - no contract address returned')
    }
    console.log(`✅ PropertyShareToken deployed at: ${contractAddress}`)

    // fix: update property with real contract address and status (Cursor Rule 4)
    const { error: propertyUpdateError } = await supabaseAdmin
      .from('properties')
      .update({
        token_contract_address: contractAddress,
        token_symbol: tokenSymbol,
        token_deployment_hash: deploymentHash,
        status: 'live' // fix: PRD requirement - change status to 'live' after token and orderbook deployment (Cursor Rule 4)
      })
      .eq('id', property_id)

    if (propertyUpdateError) {
      return NextResponse.json(
        { error: 'Failed to update property with token details' },
        { status: 500 }
      )
    }

    // fix: AUTO-DEPLOY ORDERBOOK AFTER TOKEN DEPLOYMENT (Cursor Rule 4)
    console.log('🚀 Auto-deploying OrderBookExchange...')
    
    // Convert property ID to numeric for contract
    const orderbookPropertyIdHash = keccak256(toBytes(property_id))
    const propertyIdNumeric = BigInt(orderbookPropertyIdHash) % (BigInt(2) ** BigInt(256))
    
    // Deploy OrderBookExchange via Hardhat
    console.log('🚀 Deploying OrderBookExchange via Hardhat...')
    
    const orderbookDeploymentProcess = spawn('npx', [
      'hardhat', 'run', 'scripts/deploy-orderbook-exchange.js',
      '--network', chainId === base.id ? 'baseMainnet' : 'baseSepolia'
    ], {
      env: {
        ...process.env,
        PROPERTY_ID: propertyIdNumeric.toString(),
        PROPERTY_TOKEN_ADDRESS: contractAddress,
        USDC_TOKEN_ADDRESS: chainId === base.id ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' : '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        TREASURY_ADDRESS: treasuryAddress,
        OPERATOR_ADDRESS: account.address,
        PROTOCOL_FEE_BASIS_POINTS: '50'
      }
    })

    let orderbookOutput = ''
    let orderbookError = ''

    orderbookDeploymentProcess.stdout.on('data', (data: Buffer) => {
      orderbookOutput += data.toString()
    })

    orderbookDeploymentProcess.stderr.on('data', (data: Buffer) => {
      orderbookError += data.toString()
    })

    const orderbookResult = await new Promise<{success: boolean, contractAddress?: string, deploymentHash?: string}>((resolve) => {
      orderbookDeploymentProcess.on('close', (code: number) => {
        if (code === 0) {
          const addressMatch = orderbookOutput.match(/Contract deployed at: (0x[a-fA-F0-9]{40})/)
          const hashMatch = orderbookOutput.match(/Deployment hash: (0x[a-fA-F0-9]{64})/)
          
          if (addressMatch && hashMatch) {
            resolve({
              success: true,
              contractAddress: addressMatch[1],
              deploymentHash: hashMatch[1]
            })
          } else {
            resolve({ success: false })
          }
        } else {
          console.error('OrderBook deployment failed:', orderbookError)
          resolve({ success: false })
        }
      })
    })

    if (!orderbookResult.success || !orderbookResult.contractAddress) {
      throw new Error(`OrderBookExchange deployment failed: ${orderbookError}`)
    }

    const orderbookAddress = orderbookResult.contractAddress as `0x${string}`
    const orderbookDeploymentHash = orderbookResult.deploymentHash as `0x${string}`

    console.log(`✅ OrderBookExchange deployed at: ${orderbookAddress}`)

    // Wait for orderbook deployment confirmation
    const orderbookReceipt = await publicClient.waitForTransactionReceipt({
      hash: orderbookDeploymentHash
    })

    if (!orderbookReceipt.contractAddress) {
      throw new Error('OrderBook deployment failed - no contract address returned')
    }
    console.log(`✅ OrderBookExchange deployed at: ${orderbookAddress}`)

    // fix: populate property_token_details table for trading interface (Cursor Rule 4)
    const { error: tokenDetailsError } = await supabaseAdmin
      .from('property_token_details')
      .insert({
        property_id: property_id,
        contract_address: contractAddress,
        orderbook_contract_address: orderbookAddress, // fix: include orderbook address (Cursor Rule 4)
        token_name: tokenName,
        token_symbol: tokenSymbol,
        total_shares: property.total_shares,
        available_shares: property.total_shares,
        price_per_token: property.price_per_token,
        price_source: 'openhouse',
        deployment_hash: deploymentHash,
        treasury_address: treasuryAddress,
        operator_address: account.address,
        funding_goal_usdc: property.funding_goal_usdc,
        funding_deadline: property.funding_deadline,
        deployment_timestamp: new Date().toISOString()
      })

    if (tokenDetailsError) {
      console.warn('⚠️ Failed to insert token details:', tokenDetailsError.message)
      // Don't fail the deployment if this insert fails - property is still updated
    } else {
      console.log('✅ Token details saved to property_token_details table')
    }

    // fix: also update properties table with orderbook address (Cursor Rule 4)
    const { error: orderbookUpdateError } = await supabaseAdmin
      .from('properties')
      .update({
        orderbook_contract_address: orderbookAddress
      })
      .eq('id', property_id)

    if (orderbookUpdateError) {
      console.warn('⚠️ Failed to update properties with orderbook address:', orderbookUpdateError.message)
    } else {
      console.log('✅ Properties table updated with orderbook address')
    }

    // fix: PRD requirement - mint tokens to users after deployment (Cursor Rule 4)
    console.log('🎯 Minting tokens to investors...')
    
    // fix: fetch payment authorizations with 'transferred' status (USDC already collected) (Cursor Rule 4)
    const { data: paymentAuthorizations, error: authError } = await supabaseAdmin
      .from('payment_authorizations')
      .select('id, wallet_address, usdc_amount, token_amount, payment_status')
      .eq('property_id', property_id)
      .eq('payment_status', 'transferred')

    if (authError) {
      console.warn('⚠️ Failed to fetch payment authorizations for minting:', authError.message)
    } else if (paymentAuthorizations && paymentAuthorizations.length > 0) {
      let mintSuccessCount = 0
      let mintFailureCount = 0

      for (const auth of paymentAuthorizations) {
        try {
          console.log(`🎯 Minting ${auth.token_amount} tokens to ${auth.wallet_address}`)

          // fix: convert token amount to 18 decimals for ERC20 standard (Cursor Rule 4)
          const tokenAmountWithDecimals = parseUnits(auth.token_amount.toString(), 18)
          
          const mintHash = await walletClient.writeContract({
            address: contractAddress,
            abi: PROPERTY_SHARE_TOKEN_ABI,
            functionName: 'mintTo',
            args: [
              auth.wallet_address as `0x${string}`,
              tokenAmountWithDecimals
            ]
          })

          console.log(`⏳ Token mint submitted: ${mintHash}`)

          // fix: wait for mint confirmation (Cursor Rule 4)
          const mintReceipt = await publicClient.waitForTransactionReceipt({
            hash: mintHash
          })

          if (mintReceipt.status !== 'success') {
            throw new Error('Token minting failed on-chain')
          }

          console.log(`✅ Token mint confirmed: ${mintHash}`)

          // fix: token minting is tracked via transactions table and user_holdings table (Cursor Rule 4)
          // payment_authorizations table doesn't have mint tracking columns in current schema

          // fix: create user holding record (Cursor Rule 4)
          const { data: user } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('wallet_address', auth.wallet_address)
            .single()

          if (user) {
            await supabaseAdmin
              .from('user_holdings')
              .upsert({
                user_id: user.id,
                property_id: property_id,
                token_contract: contractAddress,
                shares: auth.token_amount
              }, {
                onConflict: 'user_id,property_id'
              })
          }

          // fix: create token mint transaction record (Cursor Rule 4)
          await supabaseAdmin
            .from('transactions')
            .insert({
              user_address: auth.wallet_address,
              property_id: property_id,
              type: 'token_mint',
              amount: auth.token_amount,
              tx_hash: mintHash,
              created_at: new Date().toISOString()
            })

          mintSuccessCount++

        } catch (mintError) {
          const errorMessage = mintError instanceof Error ? mintError.message : 'Unknown minting error'
          console.error(`❌ Failed to mint tokens to ${auth.wallet_address}:`, errorMessage)
          mintFailureCount++
        }
      }

      console.log(`🎯 Token minting results: ${mintSuccessCount} successful, ${mintFailureCount} failed`)
    } else {
      console.log('ℹ️ No payment authorizations found for token minting')
    }

    return NextResponse.json({
      success: true,
      message: 'PropertyShareToken contract deployed successfully',
      deployment: {
        property_id: property_id,
        property_name: property.name,
        contract_address: contractAddress,
        token_name: tokenName,
        token_symbol: tokenSymbol,
        total_shares: property.total_shares,
        price_per_token: property.price_per_token,
        deployment_hash: deploymentHash,
        treasury_address: treasuryAddress,
        operator_address: account.address,
        chain_id: chainId,
        explorer_url: chainId === base.id 
          ? `https://basescan.org/tx/${deploymentHash}`
          : `https://sepolia.basescan.org/tx/${deploymentHash}`
      }
    })

  } catch (error) {
    console.error('❌ Contract deployment failed:', error)
    return NextResponse.json(
      { error: `Contract deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
} 