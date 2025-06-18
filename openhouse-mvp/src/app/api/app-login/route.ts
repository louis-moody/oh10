import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { signJWT } from '@/lib/jwt'
import { SiweMessage } from 'siwe'
import { randomUUID } from 'crypto'

interface LoginRequest {
  message: string
  signature: string
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 API Login Route Called')
    
    const { message, signature }: LoginRequest = await request.json()
    console.log('📝 Request payload:', { messageLength: message?.length, signatureLength: signature?.length })

    if (!message || !signature) {
      console.log('❌ Missing message or signature')
      return NextResponse.json(
        { error: 'Message and signature are required' },
        { status: 400 }
      )
    }

    // fix: verify SIWE message signature (Cursor Rule 5)
    console.log('🔍 Verifying SIWE message...')
    const siweMessage = new SiweMessage(message)
    console.log('🔍 SIWE message parsed:', {
      address: siweMessage.address,
      domain: siweMessage.domain,
      chainId: siweMessage.chainId
    })
    
    const fields = await siweMessage.verify({ signature })
    console.log('🔍 SIWE verification result:', fields.success)

    if (!fields.success) {
      console.log('❌ SIWE verification failed')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    const walletAddress = siweMessage.address.toLowerCase()
    console.log('🎯 Extracted wallet address:', walletAddress)

    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      console.log('❌ Supabase admin client not initialized - missing SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }
    console.log('✅ Supabase admin client available')

    // fix: create or update user record with updated_at support (Cursor Rule 4)
    console.log('📊 Attempting to upsert user record...')
    const { error: userError, data: userData } = await supabaseAdmin
      .from('users')
      .upsert({
        wallet_address: walletAddress,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'wallet_address'
      })
      .select()

    if (userError) {
      console.error('❌ User upsert error:', userError)
      return NextResponse.json(
        { error: 'Failed to create user record' },
        { status: 500 }
      )
    }
    console.log('✅ User record upserted:', userData)

    if (!userData || userData.length === 0) {
      console.error('❌ No user data returned from upsert')
      return NextResponse.json(
        { error: 'Failed to retrieve user record' },
        { status: 500 }
      )
    }

    const userId = userData[0].id
    console.log('🎯 User ID for session:', userId)

    // fix: create session record with enhanced schema (Cursor Rule 4)
    const sessionId = randomUUID()
    const jwtId = randomUUID() // JWT identifier for session tracking
    console.log('🎫 Creating session with ID:', sessionId)
    
    const { error: sessionError, data: sessionData } = await supabaseAdmin
      .from('active_sessions')
      .insert({
        id: sessionId,
        user_id: userId,
        jwt_id: jwtId,
        wallet_address: walletAddress, // Direct wallet address for efficient lookup
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        created_at: new Date().toISOString(),
        revoked: false
      })
      .select()

    if (sessionError) {
      console.error('❌ Session creation error:', sessionError)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }
    console.log('✅ Session created:', sessionData)

    // fix: sign JWT with session data (Cursor Rule 3)
    console.log('🔐 Signing JWT...')
    const token = signJWT({
      wallet_address: walletAddress,
      session_id: sessionId
    })
    console.log('✅ JWT signed successfully')

    // fix: set secure HttpOnly cookie (Cursor Rule 3)
    const response = NextResponse.json({ 
      success: true,
      wallet_address: walletAddress 
    })

    response.cookies.set('app-session-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours in seconds
      path: '/'
    })

    console.log('🍪 Cookie set, authentication complete')
    console.log('✅ Login successful for:', walletAddress)
    
    return response

  } catch (error) {
    console.error('💥 Login error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
} 