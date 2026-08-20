import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chartShiftDates } from '@/lib/utils'
import { ALL_LEAF_KEYS } from '@/lib/structure'

export async function GET(req: NextRequest) {
  const startDate = req.nextUrl.searchParams.get('startDate')
  const endDate = req.nextUrl.searchParams.get('endDate')

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 })
  }

  const start = new Date(startDate + 'T00:00:00.000Z')
  const end = new Date(endDate + 'T00:00:00.000Z')

  // Busca um intervalo estendido (3 dias a mais pra trás) pra garantir que o
  // dia útil anterior de qualquer dia do período (ex.: segunda → sexta,
  // offset de 3 dias) já esteja carregado no mapa abaixo — mesma lógica do
  // /api/dashboard/trend.
  const fetchStart = new Date(start)
  fetchStart.setDate(fetchStart.getDate() - 3)

  const records = await prisma.dailyAttendance.findMany({
    where: { date: { gte: fetchStart, lte: end } },
    orderBy: { date: 'asc' },
  })

  const byDate: Record<string, typeof records> = {}
  for (const r of records) {
    const key = r.date.toISOString().split('T')[0]
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(r)
  }

  type Acc = { quadro: number; planned: number; unplanned: number; indeterminate: number; days: Set<string> }
  const byDept: Record<string, Acc> = {}
  for (const key of ALL_LEAF_KEYS) {
    byDept[key] = { quadro: 0, planned: 0, unplanned: 0, indeterminate: 0, days: new Set() }
  }

  const addRecs = (recs: typeof records | undefined, shift: string, displayDate: string) => {
    if (!recs) return
    for (const r of recs) {
      if (r.shift !== shift) continue
      if (!byDept[r.departmentKey]) continue // ignora chaves fora de ALL_LEAF_KEYS
      byDept[r.departmentKey].quadro += r.quadro
      byDept[r.departmentKey].planned += r.plannedAbsence
      byDept[r.departmentKey].unplanned += r.unplannedAbsence
      byDept[r.departmentKey].indeterminate += r.indeterminateAbsence
      byDept[r.departmentKey].days.add(displayDate)
    }
  }

  // Para cada dia exibido no período, resolve de qual data física cada turno
  // lê (1º turno cai pro dia útil anterior nos fins de semana; 2º/3º sempre
  // olham pro dia útil anterior) — igual ao /api/dashboard/summary e /trend.
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = cursor.toISOString().split('T')[0]
    const shiftDates = chartShiftDates(key)

    addRecs(byDate[shiftDates.day], 'day', key)
    addRecs(byDate[shiftDates.night], 'night', key)
    addRecs(byDate[shiftDates.zero], 'zero', key)

    cursor.setDate(cursor.getDate() + 1)
  }

  const result = ALL_LEAF_KEYS.map(key => {
    const acc = byDept[key]
    const avgQuadro = acc.days.size > 0 ? acc.quadro / acc.days.size : 0
    const rate = acc.quadro > 0 ? (acc.quadro - acc.planned - acc.unplanned - acc.indeterminate) / acc.quadro : null
    return {
      departmentKey: key,
      avgQuadro,
      totalPlanned: acc.planned,
      totalUnplanned: acc.unplanned,
      totalIndeterminate: acc.indeterminate,
      attendanceRate: rate,
    }
  })

  return NextResponse.json({ startDate, endDate, data: result })
}
