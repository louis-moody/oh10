import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: validate admin session from JWT token (Cursor Rule 3)
async function validateAdminSession(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cookieHeader = request.headers.get('cookie')
    
    let token: string | null = null
    
    // Try to get token from Authorization header first
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    } 
    // Fallback to cookie
    else if (cookieHeader) {
      const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=')
        acc[key] = value
        return acc
      }, {} as Record<string, string>)
      
      token = cookies['openhouse-session']
    }
    
    if (!token) {
      return null
    }
    
    // Verify JWT token
    const payload = await verifyJWT(token)
    if (!payload) {
      return null
    }
    
    // Verify session is still valid in Supabase
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not available')
    }
    
    const { data: sessionValid } = await supabaseAdmin.rpc('is_valid_session', {
      p_wallet_address: payload.wallet_address,
      p_session_id: payload.session_id
    })
    
    if (!sessionValid) {
      return null
    }

    // fix: check if user has admin privileges using is_admin column (Cursor Rule 4)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('wallet_address', payload.wallet_address)
      .single()

    if (userError || !user || !user.is_admin) {
      console.error('Admin check failed:', { userError, user, wallet: payload.wallet_address })
      return null // Not an admin
    }
    
    return payload
  } catch (error) {
    console.error('Session validation error:', error)
    return null
  }
}

// fix: admin yield distribution API endpoint (Cursor Rule 4)
export async function POST(request: NextRequest) {
  try {
    // fix: validate admin session and JWT (Cursor Rule 3)
    const jwtPayload = await validateAdminSession(request)
    if (!jwtPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 })
    }

    const { property_id, usdc_amount, tx_hash, distribution_round } = await request.json()

    // fix: validate required parameters (Cursor Rule 6)
    if (!property_id || !usdc_amount || !tx_hash) {
      return NextResponse.json({ 
        error: 'Missing required fields: property_id, usdc_amount, tx_hash' 
      }, { status: 400 })
    }

    // fix: verify property exists and admin has access (Cursor Rule 4)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('id, name, status')
      .eq('id', property_id)
      .single()

    if (propertyError || !property) {
      return NextResponse.json({ 
        error: 'Property not found' 
      }, { status: 404 })
    }

    // fix: ensure property has a completed token deployment (Cursor Rule 4)
    const { data: tokenDetails, error: tokenError } = await supabaseAdmin
      .from('property_token_details')
      .select('yield_distributor_address, contract_address')
      .eq('property_id', property_id)
      .single()

    if (tokenError || !tokenDetails?.yield_distributor_address) {
      return NextResponse.json({ 
        error: 'Property does not have a deployed YieldDistributor contract' 
      }, { status: 400 })
    }

    // fix: insert yield distribution record into Supabase (Cursor Rule 4)
    const { data: distributionRecord, error: insertError } = await supabaseAdmin
      .from('rental_distributions')
      .insert({
        property_id,
        usdc_amount: parseFloat(usdc_amount),
        tx_hash,
        distributed_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting distribution record:', insertError)
      return NextResponse.json({ 
        error: 'Failed to record distribution in database' 
      }, { status: 500 })
    }

    // fix: record admin activity for audit trail (Cursor Rule 4)
    const { error: activityError } = await supabaseAdmin
      .from('property_activity')
      .insert({
        property_id,
        activity_type: 'yield_distributed',
        wallet_address: jwtPayload.wallet_address,
        amount: parseFloat(usdc_amount),
        transaction_hash: tx_hash,
        created_at: new Date().toISOString()
      })

    if (activityError) {
      console.warn('Failed to record activity:', activityError)
    }

    return NextResponse.json({
      success: true,
      distribution_id: distributionRecord.id,
      message: `Successfully recorded yield distribution of $${usdc_amount} for ${property.name}`
    })

  } catch (error) {
    console.error('Yield distribution API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
} 