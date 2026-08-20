import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPrevWorkingDayStr, chartShiftDates } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const prevDate = getPrevWorkingDayStr(date)
  const shiftDates = chartShiftDates(date)

  const [records, prevRecords] = await Promise.all([
    prisma.dailyAttendance.findMany({
      where: { date: new Date(date + 'T00:00:00.000Z') },
    }),
    prisma.dailyAttendance.findMany({
      where: { date: new Date(prevDate + 'T00:00:00.000Z') },
    }),
  ])

  // Per-shift breakdown.
  // 1º Turno (day) → dia selecionado, exceto sábado/domingo (que não têm
  // gráfico próprio e mostram sexta, igual ao 2º/3º turno).
  // 2º Turno (night) e 3º Turno (zero) → sempre o dia útil anterior.
  const byShift: Record<string, { quadro: number; planned: number; unplanned: number; indeterminate: number }> = {}

  const daySource = shiftDates.day === date ? records : prevRecords
  const dayRecs = daySource.filter(r => r.shift === 'day')
  const nightRecs = prevRecords.filter(r => r.shift === 'night')
  const zeroRecs = prevRecords.filter(r => r.shift === 'zero')

  for (const [key, recs] of [['day', dayRecs], ['night', nightRecs], ['zero', zeroRecs]] as const) {
    if (recs.length === 0) continue
    byShift[key] = { quadro: 0, planned: 0, unplanned: 0, indeterminate: 0 }
    for (const r of recs) {
      byShift[key].quadro += r.quadro
      byShift[key].planned += r.plannedAbsence
      byShift[key].unplanned += r.unplannedAbsence
      byShift[key].indeterminate += r.indeterminateAbsence
    }
  }

  // Totais e breakdown por departamento somam os três turnos já resolvidos
  // acima (não os registros crus de `records`), para bater com o
  // breakdown por turno mostrado na mesma página.
  const effectiveRecords = [...dayRecs, ...nightRecs, ...zeroRecs]

  const totalQuadro = effectiveRecords.reduce((s, r) => s + r.quadro, 0)
  const totalPlanned = effectiveRecords.reduce((s, r) => s + r.plannedAbsence, 0)
  const totalUnplanned = effectiveRecords.reduce((s, r) => s + r.unplannedAbsence, 0)
  const totalIndeterminate = effectiveRecords.reduce((s, r) => s + r.indeterminateAbsence, 0)
  const rate = totalQuadro > 0
    ? (totalQuadro - totalPlanned - totalUnplanned - totalIndeterminate) / totalQuadro
    : 0

  const byDept: Record<string, { quadro: number; planned: number; unplanned: number; indeterminate: number }> = {}
  for (const r of effectiveRecords) {
    if (!byDept[r.departmentKey]) byDept[r.departmentKey] = { quadro: 0, planned: 0, unplanned: 0, indeterminate: 0 }
    byDept[r.departmentKey].quadro += r.quadro
    byDept[r.departmentKey].planned += r.plannedAbsence
    byDept[r.departmentKey].unplanned += r.unplannedAbsence
    byDept[r.departmentKey].indeterminate += r.indeterminateAbsence
  }

  return NextResponse.json({
    date,
    prevDate,
    totalQuadro,
    totalPlanned,
    totalUnplanned,
    totalIndeterminate,
    attendanceRate: rate,
    byDept,
    byShift,
  })
}