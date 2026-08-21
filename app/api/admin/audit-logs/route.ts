import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Reached only through middleware, which already enforced role === 'admin'
// for every /api/admin/* path — no extra check needed here.

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)
  const cursor = searchParams.get('cursor')
  const action = searchParams.get('action')
  const username = searchParams.get('username')

  const where: Record<string, unknown> = {}
  if (action) where.action = action
  if (username) where.username = { contains: username, mode: 'insensitive' }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = logs.length > limit
  const items = hasMore ? logs.slice(0, limit) : logs

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  })
}
