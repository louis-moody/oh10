import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/jwt'
import { supabaseAdmin } from '@/lib/supabase'

interface FallbackLiquidityRequest {
  property_id: string
  action: 'enable' | 'disable'
  fallback_buy_price?: number
  liquidity_pool_usdc?: number
  daily_limit_usdc?: number
  transaction_limit_usdc?: number
  discount_percent?: number
}

// fix: GET - fetch fallback liquidity status for property (PRD Requirement #4)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('property_id')

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 })
  }

  try {
    // fix: verify JWT token from cookie (Cursor Rule 3)
    const token = request.cookies.get('app-session-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const payload = await verifyJWT(token)
    if (!payload || !payload.wallet_address) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

    const walletAddress = payload.wallet_address.toLowerCase()

    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    // fix: validate session via Supabase RPC (Cursor Rule 3)
    const { data: sessionValid, error: sessionError } = await supabaseAdmin
      .rpc('is_valid_session', { 
        wallet_addr: walletAddress 
      })

    if (sessionError || !sessionValid) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // fix: verify user is admin (Cursor Rule 3)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('wallet_address', walletAddress)
      .single()

    if (userError || !user?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get current property token details
    const { data: tokenDetails, error: tokenError } = await supabaseAdmin
      .from('property_token_details')
      .select('current_price_usdc, fallback_enabled, price_source')
      .eq('property_id', propertyId)
      .single()

    if (tokenError) {
      console.error('Error fetching token details:', tokenError)
      return NextResponse.json({ error: 'Failed to fetch token details' }, { status: 500 })
    }

    if (!tokenDetails) {
      return NextResponse.json({ error: 'Property token details not found' }, { status: 404 })
    }

    // fix: Get admin settings using fallback_wallet_address column (PRD Requirement #2)
    const { data: adminSettings, error: settingsError } = await supabaseAdmin
      .from('admin_settings')
      .select('fallback_wallet_address')
      .eq('setting_key', 'fallback_wallet_address')
      .single()

    if (settingsError) {
      console.error('Error fetching admin settings:', settingsError)
      // PRD Requirement #4: Return 404 if record not found, not crash
      if (settingsError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Fallback wallet not configured' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch admin settings' }, { status: 500 })
    }

    // Check if fallback liquidity is currently enabled
    const { data: liquidityStatus, error: liquidityError } = await supabaseAdmin
      .from('fallback_liquidity')
      .select('enabled, buy_price_usdc, liquidity_pool_usdc, daily_limit_usdc, transaction_limit_usdc, discount_percent')
      .eq('property_id', propertyId)
      .eq('status', 'active')
      .maybeSingle()

    if (liquidityError) {
      console.error('Error fetching liquidity status:', liquidityError)
      return NextResponse.json({ error: 'Failed to fetch liquidity status' }, { status: 500 })
    }

    // Calculate fallback buy price (use stored discount or default 2%)
    const discountPercent = liquidityStatus?.discount_percent || 2
    const fallbackBuyPrice = tokenDetails.current_price_usdc * (1 - discountPercent / 100)
    const discountPercentage = `${discountPercent}%`

    const response = {
      current_status: {
        fallback_enabled: tokenDetails.fallback_enabled || false,
        liquidity_enabled: liquidityStatus?.enabled || false,
        current_price_usdc: tokenDetails.current_price_usdc
      },
      fallback_wallet: adminSettings?.fallback_wallet_address || 'Not configured',
      fallback_buy_price: fallbackBuyPrice,
      discount_percentage: discountPercentage,
      liquidity_pool_usdc: liquidityStatus?.liquidity_pool_usdc || 0,
      daily_limit_usdc: liquidityStatus?.daily_limit_usdc || 10000,
      transaction_limit_usdc: liquidityStatus?.transaction_limit_usdc || 1000
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Error in fallback liquidity GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// fix: POST - enable/disable fallback liquidity for property (Cursor Rule 4)
export async function POST(request: NextRequest) {
  try {
    // fix: verify JWT token from cookie (Cursor Rule 3)
    const token = request.cookies.get('app-session-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const payload = await verifyJWT(token)
    if (!payload || !payload.wallet_address) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

    const walletAddress = payload.wallet_address.toLowerCase()

    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    // fix: validate session via Supabase RPC (Cursor Rule 3)
    const { data: sessionValid, error: sessionError } = await supabaseAdmin
      .rpc('is_valid_session', { 
        wallet_addr: walletAddress 
      })

    if (sessionError || !sessionValid) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // fix: verify user is admin (Cursor Rule 3)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('wallet_address', walletAddress)
      .single()

    if (userError || !user?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body: FallbackLiquidityRequest = await request.json()
    const { 
      property_id, 
      action, 
      fallback_buy_price,
      liquidity_pool_usdc,
      daily_limit_usdc,
      transaction_limit_usdc,
      discount_percent
    } = body

    if (!property_id || !action) {
      return NextResponse.json({ error: 'Property ID and action are required' }, { status: 400 })
    }

    if (action === 'enable') {
      if (!fallback_buy_price || !liquidity_pool_usdc) {
        return NextResponse.json({ 
          error: 'Fallback buy price and liquidity pool size are required when enabling' 
        }, { status: 400 })
      }
      if (liquidity_pool_usdc <= 0) {
        return NextResponse.json({ 
          error: 'Liquidity pool must be greater than 0' 
        }, { status: 400 })
      }
    }

    if (action === 'enable') {
      // Enable fallback liquidity with configuration
      const { error: insertError } = await supabaseAdmin
        .from('fallback_liquidity')
        .upsert({
          property_id,
          enabled: true,
          buy_price_usdc: fallback_buy_price,
          liquidity_pool_usdc: liquidity_pool_usdc || 0,
          daily_limit_usdc: daily_limit_usdc || 10000,
          transaction_limit_usdc: transaction_limit_usdc || 1000,
          discount_percent: discount_percent || 2,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'property_id'
        })

      if (insertError) {
        console.error('Error enabling fallback liquidity:', insertError)
        return NextResponse.json({ error: 'Failed to enable fallback liquidity' }, { status: 500 })
      }

      // Also update property_token_details to enable fallback
      const { error: updateError } = await supabaseAdmin
        .from('property_token_details')
        .update({ 
          fallback_enabled: true,
          updated_at: new Date().toISOString()
        })
        .eq('property_id', property_id)

      if (updateError) {
        console.error('Error updating token details:', updateError)
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Fallback liquidity enabled successfully' 
      })

    } else {
      // Disable fallback liquidity
      const { error: updateError } = await supabaseAdmin
        .from('fallback_liquidity')
        .update({
          enabled: false,
          status: 'inactive',
          updated_at: new Date().toISOString()
        })
        .eq('property_id', property_id)

      if (updateError) {
        console.error('Error disabling fallback liquidity:', updateError)
        return NextResponse.json({ error: 'Failed to disable fallback liquidity' }, { status: 500 })
      }

      // Also update property_token_details to disable fallback
      const { error: tokenUpdateError } = await supabaseAdmin
        .from('property_token_details')
        .update({ 
          fallback_enabled: false,
          updated_at: new Date().toISOString()
        })
        .eq('property_id', property_id)

      if (tokenUpdateError) {
        console.error('Error updating token details:', tokenUpdateError)
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Fallback liquidity disabled successfully' 
      })
    }

  } catch (error) {
    console.error('Error in fallback liquidity POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 