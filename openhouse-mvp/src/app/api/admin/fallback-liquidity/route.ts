import { NextResponse } from 'next/server'
import { validateAdminSession } from '@/lib/jwt'
import { createClient } from '@/lib/supabase'

interface FallbackLiquidityRequest {
  property_id: string
  action: 'enable' | 'disable'
  fallback_buy_price?: number
}

// fix: GET - fetch fallback liquidity status for property (Cursor Rule 4)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('property_id')

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 })
  }

  try {
    // Validate admin session
    const sessionValidation = await validateAdminSession(request)
    if (!sessionValidation.isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient()

    // Get current property token details
    const { data: tokenDetails, error: tokenError } = await supabase
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

    // Get admin settings (fallback wallet)
    const { data: adminSettings, error: settingsError } = await supabase
      .from('admin_settings')
      .select('fallback_wallet_address')
      .single()

    if (settingsError) {
      console.error('Error fetching admin settings:', settingsError)
      return NextResponse.json({ error: 'Failed to fetch admin settings' }, { status: 500 })
    }

    // Check if fallback liquidity is currently enabled
    const { data: liquidityStatus, error: liquidityError } = await supabase
      .from('fallback_liquidity')
      .select('enabled, buy_price_usdc')
      .eq('property_id', propertyId)
      .eq('status', 'active')
      .maybeSingle()

    if (liquidityError) {
      console.error('Error fetching liquidity status:', liquidityError)
    }

    // Calculate fallback buy price (98% of current price)
    const fallbackBuyPrice = tokenDetails.current_price_usdc * 0.98
    const discountPercentage = '2%'

    const response = {
      current_status: {
        fallback_enabled: tokenDetails.fallback_enabled || false,
        liquidity_enabled: liquidityStatus?.enabled || false,
        current_price_usdc: tokenDetails.current_price_usdc
      },
      fallback_wallet: adminSettings.fallback_wallet_address || 'Not configured',
      fallback_buy_price: fallbackBuyPrice,
      discount_percentage: discountPercentage
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Error in fallback liquidity GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// fix: POST - enable/disable fallback liquidity for property (Cursor Rule 4)
export async function POST(request: Request) {
  try {
    // Validate admin session
    const sessionValidation = await validateAdminSession(request)
    if (!sessionValidation.isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: FallbackLiquidityRequest = await request.json()
    const { property_id, action, fallback_buy_price } = body

    if (!property_id || !action) {
      return NextResponse.json({ error: 'Property ID and action are required' }, { status: 400 })
    }

    if (action === 'enable' && !fallback_buy_price) {
      return NextResponse.json({ error: 'Fallback buy price is required when enabling' }, { status: 400 })
    }

    const supabase = createClient()

    if (action === 'enable') {
      // Enable fallback liquidity
      const { error: insertError } = await supabase
        .from('fallback_liquidity')
        .upsert({
          property_id,
          enabled: true,
          buy_price_usdc: fallback_buy_price,
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
      const { error: updateError } = await supabase
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

    } else if (action === 'disable') {
      // Disable fallback liquidity
      const { error: updateError } = await supabase
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
      const { error: tokenUpdateError } = await supabase
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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Error in fallback liquidity POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 