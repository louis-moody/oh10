import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

export async function GET(request: NextRequest) {
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

    // fix: fetch user data using proper schema (Cursor Rule 4)
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, wallet_address, name, email, profile_completed, marketing_consent, created_at')
      .eq('wallet_address', walletAddress)
      .single()

    if (userError || !userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      user: userData
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 