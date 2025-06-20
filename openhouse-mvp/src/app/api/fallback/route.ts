import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/jwt'
import { supabaseAdmin } from '@/lib/supabase'
import { 
  getFallbackConfig, 
  getCurrentTradingPrice, 
  shouldUseFallback, 
  calculateTradeEstimate,
  updateOrderBookState 
} from '@/lib/fallback'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/fallback - Check fallback status and configuration
 * Used by trading modal to determine execution method
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('property_id')
    const action = searchParams.get('action')

    if (!propertyId) {
      return NextResponse.json({ error: 'Property ID is required' }, { status: 400 })
    }

    if (!supabase) {
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    // Get current OpenHouse price
    if (action === 'get_price') {
      const { data: priceData } = await supabase
        .rpc('get_current_openhouse_price', { target_property_id: propertyId })

      return NextResponse.json({
        current_price: priceData || null,
        price_source: 'openhouse'
      })
    }

    // Get fallback status
    if (action === 'get_status') {
      const { data: fallbackData } = await supabase
        .from('admin_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['fallback_wallet_address', 'fallback_max_slippage_bps', 'fallback_timeout_seconds'])

      const settings = fallbackData?.reduce((acc: any, item) => {
        acc[item.setting_key] = item.setting_value
        return acc
      }, {})

      return NextResponse.json({
        fallback_enabled: !!settings?.fallback_wallet_address,
        fallback_wallet: settings?.fallback_wallet_address || null,
        max_slippage_bps: parseInt(settings?.fallback_max_slippage_bps || '100'),
        timeout_seconds: parseInt(settings?.fallback_timeout_seconds || '5')
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Fallback GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/fallback - Execute a fallback trade or update configuration
 */
export async function POST(request: NextRequest) {
  try {
    // Verify JWT authentication
    const token = request.cookies.get('openhouse-session')?.value
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const payload = await verifyJWT(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    if (!supabase) {
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    const body = await request.json()
    const { property_id, trade_type, amount_usdc } = body

    if (!property_id || !trade_type || !amount_usdc) {
      return NextResponse.json({ 
        error: 'Missing required fields: property_id, trade_type, amount_usdc' 
      }, { status: 400 })
    }

    // Check if fallback should be used (PRD: always use fallback for now)
    const { data: shouldUseFallback } = await supabase
      .rpc('should_use_fallback', {
        target_property_id: property_id,
        trade_type: trade_type,
        amount_usdc: parseFloat(amount_usdc.toString())
      })

    // Get current price for trade estimation
    const { data: currentPrice } = await supabase
      .rpc('get_current_openhouse_price', { target_property_id: property_id })

    // Calculate trade amounts (no fees for fallback trades per PRD)
    let estimatedOutput = 0
    if (trade_type === 'buy') {
      estimatedOutput = amount_usdc / (currentPrice || 1)
    } else {
      estimatedOutput = amount_usdc * (currentPrice || 1)
    }

    return NextResponse.json({
      should_use_fallback: shouldUseFallback ?? true, // Default to fallback
      current_price: currentPrice,
      estimated_output: estimatedOutput,
      no_protocol_fees: true, // PRD requirement for fallback trades
      execution_guaranteed: true,
      liquidity_source: 'openhouse'
    })

  } catch (error) {
    console.error('Fallback POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/fallback - Update fallback configuration (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify JWT authentication and admin role
    const token = request.cookies.get('openhouse-session')?.value
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const payload = await verifyJWT(token) as any // Handle role property
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    if (!supabase) {
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
    const { error } = await supabase
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