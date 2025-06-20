import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: REAL ON-CHAIN TRADING - NO SIMULATION (Cursor Rule 4)
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

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    const body = await req.json()
    const {
      property_id,
      trade_type,
      amount,
      execution_method
    } = body

    // Validate required fields
    if (!property_id || !trade_type || !amount || !execution_method) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['buy', 'sell'].includes(trade_type)) {
      return NextResponse.json({ error: 'Invalid trade type' }, { status: 400 })
    }

    // Execute REAL fallback trade (on-chain smart contracts)
    if (execution_method === 'fallback') {
      return await executeRealFallbackTrade({
        user_wallet: decoded.wallet_address,
        property_id,
        trade_type,
        amount
      })
    }

    // Handle order book trades (future implementation)
    return NextResponse.json({ error: 'Order book trading not yet implemented' }, { status: 501 })

  } catch (error) {
    console.error('Trading API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// fix: REAL ON-CHAIN FALLBACK EXECUTION - NO DATABASE SIMULATION (Cursor Rule 4)
async function executeRealFallbackTrade(params: {
  user_wallet: string
  property_id: string
  trade_type: 'buy' | 'sell'
  amount: number
}) {
  const { user_wallet, property_id, trade_type, amount } = params

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    // Get property details and validate fallback is enabled
    const { data: propertyDetails } = await supabaseAdmin
      .from('property_token_details')
      .select('current_price_usdc, price_per_token, fallback_enabled, contract_address, fallback_liquidity_enabled')
      .eq('property_id', property_id)
      .single()

    if (!propertyDetails) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    if (!propertyDetails.fallback_enabled && !propertyDetails.fallback_liquidity_enabled) {
      return NextResponse.json({ error: 'Fallback trading disabled for this property' }, { status: 403 })
    }

    if (!propertyDetails.contract_address) {
      return NextResponse.json({ error: 'Token contract not deployed' }, { status: 400 })
    }

    // Get fallback wallet configuration
    const { data: adminSettings } = await supabaseAdmin
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'fallback_wallet_address')
      .single()

    if (!adminSettings?.setting_value) {
      return NextResponse.json({ error: 'Fallback wallet not configured' }, { status: 500 })
    }

    const fallbackWalletAddress = adminSettings.setting_value

    // Calculate trade pricing (2% discount for fallback)
    const currentPrice = propertyDetails.current_price_usdc || propertyDetails.price_per_token
    const fallbackPrice = currentPrice * 0.98 // 2% discount for both buy and sell

    // Calculate trade amounts
    let tokenAmount: number
    let usdcAmount: number

    if (trade_type === 'buy') {
      // User buys tokens: pays USDC, receives tokens
      usdcAmount = amount // User pays this much USDC
      tokenAmount = amount / fallbackPrice // User receives this many tokens
    } else {
      // User sells tokens: gives tokens, receives USDC
      tokenAmount = amount // User sells this many tokens
      usdcAmount = amount * fallbackPrice // User receives this much USDC
    }

    // Initialize ethers for REAL on-chain operations
    const ethers = await import('ethers')
    
    // Get private key for fallback wallet - check multiple possible env vars
    const fallbackPrivateKey = process.env.FALLBACK_PRIVATE_KEY || 
                              process.env.TREASURY_PRIVATE_KEY ||
                              process.env.DEPLOYER_PRIVATE_KEY ||
                              process.env.PRIVATE_KEY

    if (!fallbackPrivateKey) {
      return NextResponse.json({ 
        error: 'Fallback wallet private key not configured in environment' 
      }, { status: 500 })
    }

    // Create provider and wallet signer
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://sepolia.base.org'
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const fallbackWallet = new ethers.Wallet(fallbackPrivateKey, provider)

    // Verify fallback wallet address matches configuration
    if (fallbackWallet.address.toLowerCase() !== fallbackWalletAddress.toLowerCase()) {
      return NextResponse.json({ 
        error: 'Fallback wallet private key does not match configured address' 
      }, { status: 500 })
    }

    // Contract addresses
    const USDC_CONTRACT = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
    const tokenContractAddress = propertyDetails.contract_address

    if (!USDC_CONTRACT) {
      return NextResponse.json({ error: 'USDC contract address not configured' }, { status: 500 })
    }

    // ERC20 ABI for token operations
    const ERC20_ABI = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function transferFrom(address from, address to, uint256 amount) returns (bool)',
      'function balanceOf(address account) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)'
    ]

    const usdcContract = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider)
    const tokenContract = new ethers.Contract(tokenContractAddress, ERC20_ABI, provider)

    // Get decimals for proper conversion
    const usdcDecimals = 6 // USDC standard
    const tokenDecimals = 18 // Property token standard

    let txHash: string
    let blockNumber: number

    if (trade_type === 'sell') {
      // SELL: User sells tokens to fallback wallet for USDC
      
      // Convert amounts to blockchain units
      const usdcAmountWei = ethers.parseUnits(usdcAmount.toString(), usdcDecimals)
      const tokenAmountWei = ethers.parseUnits(tokenAmount.toString(), tokenDecimals)

      // PRE-VALIDATION: Check fallback wallet has sufficient USDC
      const fallbackUsdcBalance = await usdcContract.balanceOf(fallbackWalletAddress)
      if (fallbackUsdcBalance < usdcAmountWei) {
        const availableUsdc = ethers.formatUnits(fallbackUsdcBalance, usdcDecimals)
        return NextResponse.json({ 
          error: `Insufficient USDC in fallback wallet. Required: $${usdcAmount.toFixed(2)}, Available: $${parseFloat(availableUsdc).toFixed(2)}`,
          available_usdc: parseFloat(availableUsdc),
          required_usdc: usdcAmount
        }, { status: 400 })
      }

      // PRE-VALIDATION: Check user owns sufficient tokens
      const userTokenBalance = await tokenContract.balanceOf(user_wallet)
      if (userTokenBalance < tokenAmountWei) {
        const availableTokens = ethers.formatUnits(userTokenBalance, tokenDecimals)
        return NextResponse.json({ 
          error: `Insufficient token balance. Required: ${tokenAmount.toFixed(2)}, Available: ${parseFloat(availableTokens).toFixed(2)}`,
          available_tokens: parseFloat(availableTokens),
          required_tokens: tokenAmount
        }, { status: 400 })
      }

      // PRE-VALIDATION: Check user has approved fallback wallet to spend tokens
      const tokenAllowance = await tokenContract.allowance(user_wallet, fallbackWalletAddress)
      if (tokenAllowance < tokenAmountWei) {
        return NextResponse.json({ 
          error: `Insufficient token allowance. User must approve fallback wallet to spend ${tokenAmount.toFixed(2)} tokens`,
          required_approval: tokenAmount,
          current_allowance: parseFloat(ethers.formatUnits(tokenAllowance, tokenDecimals))
        }, { status: 400 })
      }

      // EXECUTE REAL ON-CHAIN TRANSACTION 1: Transfer tokens from user to fallback
      const fallbackWalletSigner = fallbackWallet
      const tokenTx = await (tokenContract.connect(fallbackWalletSigner) as any).transferFrom(
        user_wallet,
        fallbackWalletAddress,
        tokenAmountWei
      )
      
      const tokenReceipt = await tokenTx.wait()
      if (!tokenReceipt || tokenReceipt.status !== 1) {
        return NextResponse.json({ 
          error: 'Token transfer failed on blockchain' 
        }, { status: 500 })
      }

      // EXECUTE REAL ON-CHAIN TRANSACTION 2: Transfer USDC from fallback to user
      const usdcTx = await (usdcContract.connect(fallbackWalletSigner) as any).transfer(
        user_wallet,
        usdcAmountWei
      )
      
      const usdcReceipt = await usdcTx.wait()
      if (!usdcReceipt || usdcReceipt.status !== 1) {
        return NextResponse.json({ 
          error: 'USDC transfer failed on blockchain' 
        }, { status: 500 })
      }

      txHash = usdcTx.hash
      blockNumber = usdcReceipt.blockNumber

    } else {
      // BUY: User buys tokens from fallback wallet with USDC
      
      // Convert amounts to blockchain units
      const usdcAmountWei = ethers.parseUnits(usdcAmount.toString(), usdcDecimals)
      const tokenAmountWei = ethers.parseUnits(tokenAmount.toString(), tokenDecimals)

      // PRE-VALIDATION: Check fallback wallet has sufficient tokens
      const fallbackTokenBalance = await tokenContract.balanceOf(fallbackWalletAddress)
      if (fallbackTokenBalance < tokenAmountWei) {
        const availableTokens = ethers.formatUnits(fallbackTokenBalance, tokenDecimals)
        return NextResponse.json({ 
          error: `Insufficient tokens in fallback wallet. Required: ${tokenAmount.toFixed(2)}, Available: ${parseFloat(availableTokens).toFixed(2)}`,
          available_tokens: parseFloat(availableTokens),
          required_tokens: tokenAmount
        }, { status: 400 })
      }

      // PRE-VALIDATION: Check user has sufficient USDC
      const userUsdcBalance = await usdcContract.balanceOf(user_wallet)
      if (userUsdcBalance < usdcAmountWei) {
        const availableUsdc = ethers.formatUnits(userUsdcBalance, usdcDecimals)
        return NextResponse.json({ 
          error: `Insufficient USDC balance. Required: $${usdcAmount.toFixed(2)}, Available: $${parseFloat(availableUsdc).toFixed(2)}`,
          available_usdc: parseFloat(availableUsdc),
          required_usdc: usdcAmount
        }, { status: 400 })
      }

      // PRE-VALIDATION: Check user has approved fallback wallet to spend USDC
      const usdcAllowance = await usdcContract.allowance(user_wallet, fallbackWalletAddress)
      if (usdcAllowance < usdcAmountWei) {
        return NextResponse.json({ 
          error: `Insufficient USDC allowance. User must approve fallback wallet to spend $${usdcAmount.toFixed(2)}`,
          required_approval: usdcAmount,
          current_allowance: parseFloat(ethers.formatUnits(usdcAllowance, usdcDecimals))
        }, { status: 400 })
      }

      // EXECUTE REAL ON-CHAIN TRANSACTION 1: Transfer USDC from user to fallback
      const fallbackWalletSigner = fallbackWallet
      const usdcTx = await (usdcContract.connect(fallbackWalletSigner) as any).transferFrom(
        user_wallet,
        fallbackWalletAddress,
        usdcAmountWei
      )
      
      const usdcReceipt = await usdcTx.wait()
      if (!usdcReceipt || usdcReceipt.status !== 1) {
        return NextResponse.json({ 
          error: 'USDC transfer failed on blockchain' 
        }, { status: 500 })
      }

      // EXECUTE REAL ON-CHAIN TRANSACTION 2: Transfer tokens from fallback to user
      const tokenTx = await (tokenContract.connect(fallbackWalletSigner) as any).transfer(
        user_wallet,
        tokenAmountWei
      )
      
      const tokenReceipt = await tokenTx.wait()
      if (!tokenReceipt || tokenReceipt.status !== 1) {
        return NextResponse.json({ 
          error: 'Token transfer failed on blockchain' 
        }, { status: 500 })
      }

      txHash = tokenTx.hash
      blockNumber = tokenReceipt.blockNumber
    }

    // Update user holdings in Supabase to reflect on-chain state
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('wallet_address', user_wallet.toLowerCase())
      .single()

    if (!user) {
      return NextResponse.json({ 
        error: 'User not found in database' 
      }, { status: 400 })
    }

    const { data: existingHoldings } = await supabaseAdmin
      .from('user_holdings')
      .select('shares')
      .eq('user_id', user.id)
      .eq('property_id', property_id)
      .single()

    const currentShares = existingHoldings?.shares || 0
    let newShares: number

    if (trade_type === 'sell') {
      newShares = currentShares - tokenAmount
    } else {
      newShares = currentShares + tokenAmount
    }

    // Update or insert user holdings
    if (existingHoldings) {
      await supabaseAdmin
        .from('user_holdings')
        .update({ 
          shares: newShares,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('property_id', property_id)
    } else {
      await supabaseAdmin
        .from('user_holdings')
        .insert({
          user_id: user.id,
          property_id: property_id,
          shares: newShares,
          token_contract: tokenContractAddress,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
    }

    // Record transaction in database
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_address: user_wallet.toLowerCase(),
        property_id: parseInt(property_id),
        type: trade_type,
        amount: usdcAmount,
        tx_hash: txHash,
        execution_source: 'fallback',
        fallback_reason: 'guaranteed_liquidity',
        original_price_usdc: fallbackPrice,
        executed_price_usdc: fallbackPrice,
        slippage_bps: 0, // No slippage for fallback
        is_fallback_trade: true,
        block_number: blockNumber,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (txError) {
      console.error('Error recording transaction:', txError)
      // Transaction succeeded on-chain but failed to record - log but don't fail
    }

    return NextResponse.json({
      success: true,
      transaction_id: transaction?.id,
      execution_method: 'fallback',
      trade_type,
      token_amount: tokenAmount,
      usdc_amount: usdcAmount,
      price_used: fallbackPrice,
      no_fees: true,
      tx_hash: txHash,
      block_number: blockNumber,
      message: `${trade_type.toUpperCase()} executed ON-CHAIN via OpenHouse fallback wallet`,
      on_chain_confirmed: true
    })

  } catch (error) {
    console.error('Real fallback trade execution failed:', error)
    
    // Provide specific error messages for common blockchain issues
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        return NextResponse.json({ 
          error: 'Insufficient funds or allowance for trade execution' 
        }, { status: 400 })
      }
      if (error.message.includes('revert')) {
        return NextResponse.json({ 
          error: 'Smart contract execution reverted: ' + error.message 
        }, { status: 400 })
      }
      if (error.message.includes('nonce')) {
        return NextResponse.json({ 
          error: 'Transaction nonce error - please try again' 
        }, { status: 400 })
      }
    }

    return NextResponse.json({ 
      error: 'On-chain trade execution failed',
      details: error instanceof Error ? error.message : 'Unknown blockchain error'
    }, { status: 500 })
  }
}

// fix: GET endpoint for user holdings (Cursor Rule 4)
export async function GET() {
  try {
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

    // Fetch user holdings
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('wallet_address', decoded.wallet_address.toLowerCase())
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: holdings, error } = await supabaseAdmin
      .from('user_holdings')
      .select(`
        *,
        properties:property_id (
          id,
          name,
          status,
          price_per_token
        )
      `)
      .eq('user_id', user.id)
      .gt('shares', 0)

    if (error) {
      console.error('Failed to fetch user holdings:', error)
      return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      holdings: holdings || []
    })

  } catch (error) {
    console.error('Holdings API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 