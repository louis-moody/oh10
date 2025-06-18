import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/jwt'
import { supabaseAdmin } from '@/lib/supabase'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // fix: only protect routes that require authentication (Cursor Rule 9)
  const protectedRoutes = ['/dashboard', '/profile', '/admin']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  if (!isProtectedRoute) {
    return NextResponse.next()
  }

  const token = request.cookies.get('app-session-token')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const payload = verifyJWT(token)

  if (!payload || !supabaseAdmin) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  try {
    // fix: validate session using direct table lookup (Cursor Rule 3)
    const { data: sessionData, error } = await supabaseAdmin
      .from('active_sessions')
      .select('*')
      .eq('id', payload.session_id)
      .eq('wallet_address', payload.wallet_address)
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    const isValid = !error && sessionData

    if (error || !isValid) {
      // fix: clear invalid session cookie (Cursor Rule 3)
      const response = NextResponse.redirect(new URL('/', request.url))
      response.cookies.set('app-session-token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
      })
      return response
    }

    return NextResponse.next()

  } catch (error) {
    console.error('Session validation error:', error)
    return NextResponse.redirect(new URL('/', request.url))
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
} 