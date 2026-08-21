import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

// Reached only through middleware, which already enforced role === 'admin'.

// Admin resets another user's password — write-only, there's no endpoint
// that returns a user's password or hash anywhere in the app.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { password } = await req.json()

    if (!password || String(password).length < 6) {
      return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({ where: { id: params.id } })
    if (!target) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.update({ where: { id: params.id }, data: { passwordHash } })

    await logAudit({
      userId: req.headers.get('x-user-id'),
      username: req.headers.get('x-user-username') ?? 'desconhecido',
      action: 'user.password_reset',
      target: target.username,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    console.error('[PATCH /api/admin/users/[id]]', error)
    return NextResponse.json({ error: 'Erro ao trocar senha' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const requesterId = req.headers.get('x-user-id')

  if (params.id === requesterId) {
    return NextResponse.json({ error: 'Você não pode excluir sua própria conta' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  if (target.role === 'admin') {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } })
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Não é possível excluir o último administrador' }, { status: 400 })
    }
  }

  await prisma.user.delete({ where: { id: params.id } })

  await logAudit({
    userId: requesterId,
    username: req.headers.get('x-user-username') ?? 'desconhecido',
    action: 'user.delete',
    target: target.username,
    details: { role: target.role },
  })

  return NextResponse.json({ ok: true })
}
