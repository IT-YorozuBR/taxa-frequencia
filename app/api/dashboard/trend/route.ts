import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const endDate = req.nextUrl.searchParams.get('endDate')
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)

  if (!endDate) return NextResponse.json({ error: 'endDate required' }, { status: 400 })

  const end = new Date(endDate + 'T00:00:00.000Z')
  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)

  const records = await prisma.dailyAttendance.findMany({
    where: {
      date: { gte: start, lte: end },
    },
    orderBy: { date: 'asc' },
  })

  // Group by date
  const byDate: Record<string, { quadro: number; planned: number; unplanned: number }> = {}
  for (const r of records) {
    const key = r.date.toISOString().split('T')[0]
    if (!byDate[key]) byDate[key] = { quadro: 0, planned: 0, unplanned: 0 }
    byDate[key].quadro += r.quadro
    byDate[key].planned += r.plannedAbsence
    byDate[key].unplanned += r.unplannedAbsence
  }

  // Build array of all calendar days in range (including days with no data)
  const result = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = cursor.toISOString().split('T')[0]
    const d = byDate[key]
    const rate = d && d.quadro > 0
      ? (d.quadro - d.planned - d.unplanned) / d.quadro
      : null  // null = no data recorded for that day

    result.push({
      date: key,
      attendanceRate: rate,
      totalQuadro: d?.quadro ?? 0,
      totalPlanned: d?.planned ?? 0,
      totalUnplanned: d?.unplanned ?? 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return NextResponse.json(result)
}
