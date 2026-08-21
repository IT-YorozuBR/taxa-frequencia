import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySession(token) : null

  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 })
  }

  return NextResponse.json({ user: { username: session.username, role: session.role } })
}
