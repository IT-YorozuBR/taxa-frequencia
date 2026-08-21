import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { SESSION_COOKIE, verifySession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

// Excluded from middleware's blanket protection (matcher skips /api/auth/*),
// so this route authenticates itself instead of relying on it.
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySession(token) : null
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  try {
    const { currentPassword, newPassword } = await req.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Senha atual e nova senha são obrigatórias' }, { status: 400 })
    }
    if (String(newPassword).length < 6) {
      return NextResponse.json({ error: 'A nova senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.sub } })
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 401 })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

    await logAudit({
      userId: session.sub,
      username: session.username,
      action: 'user.change_password',
      target: session.username,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    console.error('[POST /api/auth/change-password]', error)
    return NextResponse.json({ error: 'Erro ao trocar senha' }, { status: 500 })
  }
}
