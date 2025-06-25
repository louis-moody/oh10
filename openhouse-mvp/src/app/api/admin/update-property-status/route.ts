import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { verifyJWT } from '@/lib/jwt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // fix: validate admin session using same pattern as other admin endpoints (Cursor Rule 4)
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('app-session-token')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: 'No session token' }, { status: 401 })
    }

    const payload = await verifyJWT(sessionToken)
    if (!payload?.wallet_address) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // fix: verify admin status (Cursor Rule 4)
    const { data: sessionData, error: sessionError } = await supabaseAdmin.rpc(
      'is_valid_session',
      { wallet_addr: payload.wallet_address.toLowerCase() }
    )

    if (sessionError || !sessionData) {
      return NextResponse.json({ error: 'Session validation failed' }, { status: 401 })
    }

    const { property_id } = await request.json()

    if (!property_id) {
      return NextResponse.json({ error: 'Property ID is required' }, { status: 400 })
    }

    // fix: get property details (Cursor Rule 4)
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('id, name, status, funding_goal_usdc')
      .eq('id', property_id)
      .single()

    if (propertyError || !property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // fix: only update if property is currently active (Cursor Rule 4)
    if (property.status !== 'active') {
      console.log('❌ Property status update rejected:', {
        property_id,
        name: property.name,
        current_status: property.status,
        attempted_action: 'update to funded'
      })
      return NextResponse.json({ 
        error: `Property status is '${property.status}', can only update 'active' properties to 'funded'` 
      }, { status: 400 })
    }

    // fix: calculate funding progress from payment_authorizations (Cursor Rule 4)
    const { data: authData, error: authError } = await supabaseAdmin
      .from('payment_authorizations')
      .select('usdc_amount')
      .eq('property_id', property_id)
      .in('payment_status', ['approved', 'transferred'])

    if (authError) {
      return NextResponse.json({ error: 'Failed to fetch funding data' }, { status: 500 })
    }

    const raisedAmount = authData?.reduce((sum, auth) => sum + parseFloat(auth.usdc_amount), 0) || 0
    // fix: match admin dashboard calculation exactly (Cursor Rule 4)
    const progressPercentage = Math.min((raisedAmount / property.funding_goal_usdc) * 100, 100)

    console.log('📊 Property funding check:', {
      property_id,
      name: property.name,
      raisedAmount,
      fundingGoal: property.funding_goal_usdc,
      progressPercentage: progressPercentage.toFixed(2) + '%'
    })

    // fix: only update to 'funded' if at least 100% funded (allow slight overfunding) (Cursor Rule 4)
    if (progressPercentage < 100) {
      return NextResponse.json({ 
        error: `Property is only ${progressPercentage.toFixed(1)}% funded, cannot update to 'funded' status`,
        current_progress: progressPercentage,
        raised_amount: raisedAmount,
        funding_goal: property.funding_goal_usdc
      }, { status: 400 })
    }

    // fix: update property status to 'funded' (Cursor Rule 4)
    const { error: updateError } = await supabaseAdmin
      .from('properties')
      .update({ 
        status: 'funded',
        updated_at: new Date().toISOString()
      })
      .eq('id', property_id)

    if (updateError) {
      console.error('❌ Database update error:', updateError)
      return NextResponse.json({ error: 'Failed to update property status' }, { status: 500 })
    }

    console.log('✅ Property status updated:', {
      property_id,
      name: property.name,
      old_status: 'active',
      new_status: 'funded',
      progress_percentage: progressPercentage.toFixed(2) + '%'
    })

    return NextResponse.json({
      success: true,
      message: `Property '${property.name}' status updated to 'funded'`,
      property_id,
      old_status: 'active',
      new_status: 'funded',
      progress_percentage: progressPercentage,
      raised_amount: raisedAmount,
      funding_goal: property.funding_goal_usdc
    })

  } catch (error) {
    console.error('❌ Update property status error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 