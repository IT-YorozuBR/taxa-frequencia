import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chartShiftDates } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const endDate = req.nextUrl.searchParams.get('endDate')
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)

  if (!endDate) return NextResponse.json({ error: 'endDate required' }, { status: 400 })

  const end = new Date(endDate + 'T00:00:00.000Z')
  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)

  // Busca um intervalo estendido (3 dias a mais pra trás) pra garantir que
  // o dia útil anterior de qualquer dia do range (ex.: segunda → sexta,
  // offset de 3 dias) já esteja carregado no mapa abaixo.
  const fetchStart = new Date(start)
  fetchStart.setDate(fetchStart.getDate() - 3)

  const records = await prisma.dailyAttendance.findMany({
    where: {
      date: { gte: fetchStart, lte: end },
    },
    orderBy: { date: 'asc' },
  })

  // Group by date
  const byDate: Record<string, typeof records> = {}
  for (const r of records) {
    const key = r.date.toISOString().split('T')[0]
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(r)
  }

  const sum = (recs: typeof records | undefined, shift: string) => {
    if (!recs) return { quadro: 0, planned: 0, unplanned: 0 }
    return recs
      .filter(r => r.shift === shift)
      .reduce((acc, r) => ({
        quadro: acc.quadro + r.quadro,
        planned: acc.planned + r.plannedAbsence,
        unplanned: acc.unplanned + r.unplannedAbsence,
      }), { quadro: 0, planned: 0, unplanned: 0 })
  }

  // Build array of all calendar days in range (including days with no data)
  const result = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = cursor.toISOString().split('T')[0]
    const shiftDates = chartShiftDates(key)

    // 1º turno vem do próprio dia (ou de sexta, se `key` for fim de semana);
    // 2º/3º turno sempre do dia útil anterior — igual ao /api/dashboard/summary.
    const day = sum(byDate[shiftDates.day], 'day')
    const night = sum(byDate[shiftDates.night], 'night')
    const zero = sum(byDate[shiftDates.zero], 'zero')

    const quadro = day.quadro + night.quadro + zero.quadro
    const planned = day.planned + night.planned + zero.planned
    const unplanned = day.unplanned + night.unplanned + zero.unplanned

    const rate = quadro > 0
      ? (quadro - planned - unplanned) / quadro
      : null  // null = no data recorded for that day

    result.push({
      date: key,
      attendanceRate: rate,
      totalQuadro: quadro,
      totalPlanned: planned,
      totalUnplanned: unplanned,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return NextResponse.json(result)
}
