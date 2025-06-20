import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: clean trading API for fallback and orderbook execution (Cursor Rule 4)
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const cookieStore = await cookies()
    const token = cookieStore.get('openhouse-session')?.value

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
      execution_method,
      price_per_token
    } = body

    // Validate required fields
    if (!property_id || !trade_type || !amount || !execution_method || !price_per_token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['buy', 'sell'].includes(trade_type)) {
      return NextResponse.json({ error: 'Invalid trade type' }, { status: 400 })
    }

    // Execute fallback trade (guaranteed liquidity)
    if (execution_method === 'fallback') {
      return await executeFallbackTrade({
        user_wallet: decoded.wallet_address,
        property_id,
        trade_type,
        amount,
        price_per_token
      })
    }

    // Handle order book trades (future implementation)
    return NextResponse.json({ error: 'Order book trading not yet implemented' }, { status: 501 })

  } catch (error) {
    console.error('Trading API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// fix: execute REAL ON-CHAIN fallback trade using fallback wallet (Cursor Rule 4)
async function executeFallbackTrade(params: {
  user_wallet: string
  property_id: string
  trade_type: 'buy' | 'sell'
  amount: number
  price_per_token: number
}) {
  const { user_wallet, property_id, trade_type, amount, price_per_token } = params

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    // Get property details and fallback settings
    const { data: propertyDetails } = await supabaseAdmin
      .from('property_token_details')
      .select('current_price_usdc, price_per_token, fallback_enabled, contract_address')
      .eq('property_id', property_id)
      .single()

    if (!propertyDetails) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    if (!propertyDetails.fallback_enabled) {
      return NextResponse.json({ error: 'Fallback trading disabled for this property' }, { status: 403 })
    }

    // Get fallback wallet from admin settings
    const { data: adminSettings } = await supabaseAdmin
      .from('admin_settings')
      .select('fallback_wallet_address')
      .single()

    if (!adminSettings?.fallback_wallet_address) {
      return NextResponse.json({ error: 'Fallback wallet not configured' }, { status: 500 })
    }

    // Get fallback buy price (98% of current price)
    const { data: fallbackLiquidity } = await supabaseAdmin
      .from('fallback_liquidity')
      .select('enabled, buy_price_usdc')
      .eq('property_id', property_id)
      .eq('status', 'active')
      .single()

    if (!fallbackLiquidity?.enabled) {
      return NextResponse.json({ error: 'Fallback liquidity not enabled for this property' }, { status: 403 })
    }

    const fallbackPrice = fallbackLiquidity.buy_price_usdc

    // Calculate trade amounts using fallback price
    let token_amount: number
    let usdc_amount: number

    if (trade_type === 'buy') {
      // For buying, user pays current market price to fallback wallet
      usdc_amount = amount
      token_amount = amount / fallbackPrice
    } else {
      // For selling, user sells tokens at 98% price to fallback wallet
      token_amount = amount
      usdc_amount = amount * fallbackPrice
    }

    // PHASE 1: Execute on-chain transfers using ethers and wagmi
    const ethers = await import('ethers')
    const fallbackPrivateKey = process.env.FALLBACK_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY

    if (!fallbackPrivateKey) {
      return NextResponse.json({ error: 'Fallback wallet private key not configured' }, { status: 500 })
    }

    // Create wallet signer for fallback wallet
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const fallbackWallet = new ethers.Wallet(fallbackPrivateKey, provider)

    // Contract addresses
    const USDC_CONTRACT = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
    const tokenContractAddress = propertyDetails.contract_address

    if (!USDC_CONTRACT || !tokenContractAddress) {
      return NextResponse.json({ error: 'Contract addresses not configured' }, { status: 500 })
    }

    // Contract ABIs (minimal for transfers)
    const ERC20_ABI = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function transferFrom(address from, address to, uint256 amount) returns (bool)',
      'function balanceOf(address account) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ]

    const usdcContract = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, fallbackWallet)
    const tokenContract = new ethers.Contract(tokenContractAddress, ERC20_ABI, fallbackWallet)

    let txHash: string

    if (trade_type === 'sell') {
      // SELL: User sells tokens to fallback wallet for USDC
      // 1. Fallback wallet sends USDC to user
      // 2. User transfers tokens to fallback wallet (handled separately)
      
      // Convert amounts to proper decimals
      const usdcDecimals = 6 // USDC has 6 decimals
      const usdcAmountWei = ethers.parseUnits(usdc_amount.toString(), usdcDecimals)

      // Check fallback wallet has enough USDC
      const fallbackUsdcBalance = await usdcContract.balanceOf(fallbackWallet.address)
      if (fallbackUsdcBalance < usdcAmountWei) {
        return NextResponse.json({ 
          error: `Insufficient USDC in fallback wallet. Required: ${usdc_amount}, Available: ${ethers.formatUnits(fallbackUsdcBalance, usdcDecimals)}` 
        }, { status: 400 })
      }

      // Execute USDC transfer from fallback wallet to user
      const usdcTx = await usdcContract.transfer(user_wallet, usdcAmountWei)
      await usdcTx.wait()
      txHash = usdcTx.hash

      // Update user holdings (reduce tokens)
      const { data: existingHoldings } = await supabaseAdmin
        .from('user_holdings')
        .select('shares')
        .eq('user_address', user_wallet)
        .eq('property_id', parseInt(property_id))
        .single()

      if (!existingHoldings || existingHoldings.shares < token_amount) {
        return NextResponse.json({ 
          error: 'Insufficient token balance for sale' 
        }, { status: 400 })
      }

      const newShares = existingHoldings.shares - token_amount

      await supabaseAdmin
        .from('user_holdings')
        .update({ shares: newShares })
        .eq('user_address', user_wallet)
        .eq('property_id', parseInt(property_id))

    } else {
      // BUY: Not typically used in fallback (users don't buy from fallback wallet)
      return NextResponse.json({ 
        error: 'Buying from fallback wallet not supported. Use crowdfunding instead.' 
      }, { status: 400 })
    }

    // Record transaction with real tx hash
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_address: user_wallet,
        property_id: parseInt(property_id),
        type: trade_type,
        amount: usdc_amount,
        tx_hash: txHash,
        execution_source: 'fallback',
        fallback_reason: 'guaranteed_liquidity',
        original_price_usdc: fallbackPrice,
        executed_price_usdc: fallbackPrice,
        slippage_bps: 0, // No slippage for fallback
        block_number: null // Will be updated when tx is confirmed
      })
      .select()
      .single()

    if (error) {
      console.error('Error recording fallback transaction:', error)
      // Transaction succeeded on-chain but failed to record - this is critical
      return NextResponse.json({ 
        error: 'Transaction executed but failed to record in database',
        tx_hash: txHash,
        success: true // Still consider it successful since on-chain worked
      }, { status: 200 })
    }

    return NextResponse.json({
      success: true,
      transaction_id: transaction?.id,
      execution_method: 'fallback',
      token_amount,
      usdc_amount,
      price_used: fallbackPrice,
      no_fees: true,
      tx_hash: txHash,
      message: 'Trade executed ON-CHAIN via OpenHouse fallback wallet'
    })

  } catch (error) {
    console.error('Fallback trade execution failed:', error)
    
    // Check if error is related to insufficient funds or other on-chain issues
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        return NextResponse.json({ 
          error: 'Insufficient funds in fallback wallet or user account' 
        }, { status: 400 })
      }
      if (error.message.includes('revert')) {
        return NextResponse.json({ 
          error: 'Smart contract execution failed: ' + error.message 
        }, { status: 400 })
      }
    }

    return NextResponse.json({ error: 'On-chain trade execution failed' }, { status: 500 })
  }
}

// fix: GET endpoint for user holdings (Cursor Rule 4)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('openhouse-session')?.value
    
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
      .eq('user_address', decoded.wallet_address)
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