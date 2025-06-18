import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/jwt'
import { supabase } from '@/lib/supabase'

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

  if (!payload || !supabase) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  try {
    // fix: validate session using Supabase RPC (Cursor Rule 3)
    const { data: isValid, error } = await supabase
      .rpc('is_valid_session', {
        session_id: payload.session_id,
        wallet_addr: payload.wallet_address
      })

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