import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

// Reached only through middleware, which already enforced role === 'admin'
// for every /api/admin/* path — no extra check needed here.

export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, role } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Usuário e senha são obrigatórios' }, { status: 400 })
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    }
    const normalizedRole = role === 'admin' ? 'admin' : 'user'

    const existing = await prisma.user.findUnique({ where: { username } })
    if (existing) {
      return NextResponse.json({ error: 'Já existe um usuário com esse nome' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { username, passwordHash, role: normalizedRole },
      select: { id: true, username: true, role: true, createdAt: true },
    })

    await logAudit({
      userId: req.headers.get('x-user-id'),
      username: req.headers.get('x-user-username') ?? 'desconhecido',
      action: 'user.create',
      target: username,
      details: { role: normalizedRole },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    console.error('[POST /api/admin/users]', error)
    return NextResponse.json({ error: 'Erro ao criar usuário' }, { status: 500 })
  }
}
