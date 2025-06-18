import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

export async function GET(request: NextRequest) {
  try {
    console.log('🔐 User Profile Route Called')
    
    // fix: validate JWT token from cookie (Cursor Rule 3)
    const token = request.cookies.get('app-session-token')?.value

    if (!token) {
      console.log('❌ No session token found')
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const payload = verifyJWT(token)
    if (!payload) {
      console.log('❌ Invalid session token')
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    const walletAddress = payload.wallet_address
    console.log('🎯 Fetching profile for wallet:', walletAddress)

    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      console.log('❌ Supabase admin client not initialized')
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    // fix: fetch user profile from database (Cursor Rule 4)
    console.log('📊 Querying user profile...')
    const { error: fetchError, data: userData } = await supabaseAdmin
      .from('users')
      .select('id, wallet_address, name, email, profile_completed, marketing_consent, created_at, updated_at')
      .eq('wallet_address', walletAddress)
      .single()

    if (fetchError) {
      console.error('❌ Profile fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      )
    }

    if (!userData) {
      console.log('❌ User not found for wallet:', walletAddress)
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    console.log('✅ Profile fetched successfully:', {
      id: userData.id,
      wallet_address: userData.wallet_address,
      profile_completed: userData.profile_completed,
      has_name: !!userData.name,
      has_email: !!userData.email
    })

    return NextResponse.json({
      success: true,
      user: {
        id: userData.id,
        wallet_address: userData.wallet_address,
        name: userData.name,
        email: userData.email,
        profile_completed: userData.profile_completed || false,
        marketing_consent: userData.marketing_consent || false,
        created_at: userData.created_at,
        updated_at: userData.updated_at
      }
    })

  } catch (error) {
    console.error('💥 Profile fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 