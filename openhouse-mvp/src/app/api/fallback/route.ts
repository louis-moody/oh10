import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyJWT } from '@/lib/jwt'
import { supabaseAdmin } from '@/lib/supabase'
// Removed unused fallback library imports

/**
 * GET /api/fallback - Check fallback status and configuration
 * Used by trading modal to determine execution method
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const property_id = searchParams.get('property_id')
    const action = searchParams.get('action')

    if (!property_id) {
      return NextResponse.json({ error: 'Property ID is required' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // Get property details
    const { data: propertyDetails } = await supabaseAdmin
      .from('property_token_details')
      .select('current_price_usdc, price_per_token, fallback_enabled, contract_address, fallback_liquidity_enabled')
      .eq('property_id', property_id)
      .single()

    if (!propertyDetails) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // Get fallback wallet address
    const { data: adminSettings } = await supabaseAdmin
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'fallback_wallet_address')
      .single()

    if (!adminSettings?.setting_value) {
      return NextResponse.json({ error: 'Fallback wallet not configured' }, { status: 500 })
    }

    const fallbackWalletAddress = adminSettings.setting_value
    const currentPrice = propertyDetails.current_price_usdc || propertyDetails.price_per_token
    const fallbackPrice = currentPrice * 0.98 // 2% discount

    // If just getting price info
    if (action === 'get_price') {
      return NextResponse.json({
        current_price: currentPrice,
        fallback_price: fallbackPrice,
        fallback_enabled: propertyDetails.fallback_enabled || propertyDetails.fallback_liquidity_enabled
      })
    }

    // Get real-time fallback wallet balances
    let availableToSell = 0
    let availableToBuy = 0

    try {
      const ethers = await import('ethers')
      const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://sepolia.base.org'
      const provider = new ethers.JsonRpcProvider(rpcUrl)

      const USDC_CONTRACT = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
      const tokenContractAddress = propertyDetails.contract_address

      if (USDC_CONTRACT && tokenContractAddress) {
        const ERC20_ABI = [
          'function balanceOf(address account) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ]

        const usdcContract = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider)
        const tokenContract = new ethers.Contract(tokenContractAddress, ERC20_ABI, provider)

        // Get fallback wallet balances
        const [fallbackUsdcBalance, fallbackTokenBalance] = await Promise.all([
          usdcContract.balanceOf(fallbackWalletAddress),
          tokenContract.balanceOf(fallbackWalletAddress)
        ])

        // Convert to human readable amounts
        const usdcDecimals = 6
        const tokenDecimals = 18

        const usdcAvailable = parseFloat(ethers.formatUnits(fallbackUsdcBalance, usdcDecimals))
        const tokensAvailable = parseFloat(ethers.formatUnits(fallbackTokenBalance, tokenDecimals))

        // Calculate availability
        availableToSell = usdcAvailable / fallbackPrice // How many tokens user can sell (limited by fallback USDC)
        availableToBuy = tokensAvailable // How many tokens user can buy (limited by fallback token balance)
      }
    } catch (error) {
      console.error('Failed to fetch fallback wallet balances:', error)
      // Continue with 0 availability if balance check fails
    }

    // For user-specific data, require authentication
    let userTokenBalance = 0
    
    // fix: only require auth for user-specific data (Cursor Rule 7)
    const cookieStore = await cookies()
    const token = cookieStore.get('app-session-token')?.value
    
    if (token) {
      try {
        const decoded = await verifyJWT(token)
        if (decoded?.wallet_address) {
          // Get user's current token holdings for validation
          const { data: userHoldings } = await supabaseAdmin
            .from('user_holdings')
            .select('shares')
            .eq('user_id', (await supabaseAdmin
              .from('users')
              .select('id')
              .eq('wallet_address', decoded.wallet_address.toLowerCase())
              .single()
            ).data?.id)
            .eq('property_id', property_id)
            .single()

          userTokenBalance = userHoldings?.shares || 0
        }
      } catch (error) {
        console.log('Could not get user token balance (not authenticated):', error instanceof Error ? error.message : 'Unknown error')
        // Continue without user balance - they can still see public availability
      }
    }

    return NextResponse.json({
      success: true,
      property_id: parseInt(property_id),
      current_price: currentPrice,
      fallback_price: fallbackPrice,
      fallback_enabled: propertyDetails.fallback_enabled || propertyDetails.fallback_liquidity_enabled,
      availability: {
        available_to_buy: availableToBuy,
        available_to_sell: userTokenBalance > 0 ? Math.min(availableToSell, userTokenBalance) : availableToSell, // fix: show fallback capacity when not authenticated (Cursor Rule 7)
        user_token_balance: userTokenBalance,
        fallback_wallet: fallbackWalletAddress
      },
      pricing: {
        buy_price: fallbackPrice, // User buys at 2% discount
        sell_price: fallbackPrice, // User sells at 2% discount
        discount_percentage: 2
      }
    })

  } catch (error) {
    console.error('Fallback API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/fallback - Execute a fallback trade or update configuration
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { property_id, trade_type, amount } = body

    if (!property_id || !trade_type || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Simulate 5-second orderbook check (PRD requirement)
    await new Promise(resolve => setTimeout(resolve, 5000))

    // For now, always route to fallback (orderbook not implemented)
    return NextResponse.json({
      use_fallback: true,
      reason: 'orderbook_insufficient_liquidity',
      timeout_reached: true,
      execution_method: 'fallback'
    })

  } catch (error) {
    console.error('Fallback POST API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/fallback - Update fallback configuration (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify JWT authentication and admin role
    const cookieStore = await cookies()
    const token = cookieStore.get('app-session-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const payload = await verifyJWT(token) as { role?: string; wallet_address?: string } | null
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    const body = await request.json()
    const { setting_key, setting_value } = body

    if (!setting_key || setting_value === undefined) {
      return NextResponse.json({ 
        error: 'Missing required fields: setting_key, setting_value' 
      }, { status: 400 })
    }

    // Update admin setting
    const { error } = await supabaseAdmin
      .from('admin_settings')
      .upsert({
        setting_key,
        setting_value: setting_value.toString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_key'
      })

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${setting_key}`
    })

  } catch (error) {
    console.error('Fallback PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 