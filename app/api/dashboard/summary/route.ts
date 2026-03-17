import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getPrevWorkingDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dow = d.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = dow === 1 ? 3 : 1 // Monday → go back 3 days (Friday), else 1 day
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const prevDate = getPrevWorkingDay(date)

  const [records, prevRecords] = await Promise.all([
    prisma.dailyAttendance.findMany({
      where: { date: new Date(date + 'T00:00:00.000Z') },
    }),
    prisma.dailyAttendance.findMany({
      where: { date: new Date(prevDate + 'T00:00:00.000Z') },
    }),
  ])

  const totalQuadro = records.reduce((s: any, r: any) => s + r.quadro, 0)
  const totalPlanned = records.reduce((s: any, r: any) => s + r.plannedAbsence, 0)
  const totalUnplanned = records.reduce((s: any, r: any) => s + r.unplannedAbsence, 0)
  const rate = totalQuadro > 0
    ? (totalQuadro - totalPlanned - totalUnplanned) / totalQuadro
    : 0

  // Per-department breakdown (summed across shifts)
  const byDept: Record<string, { quadro: number; planned: number; unplanned: number }> = {}
  for (const r of records) {
    if (!byDept[r.departmentKey]) byDept[r.departmentKey] = { quadro: 0, planned: 0, unplanned: 0 }
    byDept[r.departmentKey].quadro += r.quadro
    byDept[r.departmentKey].planned += r.plannedAbsence
    byDept[r.departmentKey].unplanned += r.unplannedAbsence
  }

  // Per-shift breakdown
  // 1º Turno (day) e 3º Turno (zero) → usa registros do dia atual
  // 2º Turno (night) → usa registros do dia anterior
  const byShift: Record<string, { quadro: number; planned: number; unplanned: number }> = {}
  
  // 1º Turno - dia atual
  for (const r of records.filter(r => r.shift === 'day')) {
    if (!byShift['day']) byShift['day'] = { quadro: 0, planned: 0, unplanned: 0 }
    byShift['day'].quadro += r.quadro
    byShift['day'].planned += r.plannedAbsence
    byShift['day'].unplanned += r.unplannedAbsence
  }

  // 2º Turno - dia anterior (seguindo a mesma lógica da tabela de presença)
  for (const r of prevRecords.filter(r => r.shift === 'night')) {
    if (!byShift['night']) byShift['night'] = { quadro: 0, planned: 0, unplanned: 0 }
    byShift['night'].quadro += r.quadro
    byShift['night'].planned += r.plannedAbsence
    byShift['night'].unplanned += r.unplannedAbsence
  }

  // 3º Turno - dia atual
  for (const r of records.filter(r => r.shift === 'zero')) {
    if (!byShift['zero']) byShift['zero'] = { quadro: 0, planned: 0, unplanned: 0 }
    byShift['zero'].quadro += r.quadro
    byShift['zero'].planned += r.plannedAbsence
    byShift['zero'].unplanned += r.unplannedAbsence
  }

  return NextResponse.json({
    date,
    prevDate,
    totalQuadro,
    totalPlanned,
    totalUnplanned,
    attendanceRate: rate,
    byDept,
    byShift,
  })
}