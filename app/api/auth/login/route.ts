import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Usuário e senha são obrigatórios' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 })
    }

    const token = await signSession({ sub: user.id, username: user.username, role: user.role as 'admin' | 'user' })

    const res = NextResponse.json({ username: user.username, role: user.role })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
    return res
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    console.error('[POST /api/auth/login]', error)
    return NextResponse.json({ error: 'Erro ao autenticar' }, { status: 500 })
  }
}
