import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/auth'

// Protects every route except: /login, /api/auth/* (login/logout/me handle
// their own auth internally), /api/cron/* (server-to-server, guarded by
// CRON_SECRET instead of a browser session), and Next.js internals/static
// assets. Everything else requires a valid session cookie; /admin and
// /api/admin/* additionally require the "admin" role.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySession(token) : null

  const isApi = pathname.startsWith('/api')

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if ((pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) && session.role !== 'admin') {
    if (isApi) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Forward the verified identity to route handlers via headers, so they
  // don't need to re-parse/verify the session cookie themselves. These
  // always overwrite whatever the client sent, so they can't be spoofed.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-user-id', session.sub)
  requestHeaders.set('x-user-username', session.username)
  requestHeaders.set('x-user-role', session.role)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/auth|api/cron).*)'],
}
