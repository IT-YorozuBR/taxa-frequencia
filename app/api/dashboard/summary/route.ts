import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const records = await prisma.dailyAttendance.findMany({
    where: { date: new Date(date + 'T00:00:00.000Z') },
  })

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
  const byShift: Record<string, { quadro: number; planned: number; unplanned: number }> = {}
  for (const r of records) {
    if (!byShift[r.shift]) byShift[r.shift] = { quadro: 0, planned: 0, unplanned: 0 }
    byShift[r.shift].quadro += r.quadro
    byShift[r.shift].planned += r.plannedAbsence
    byShift[r.shift].unplanned += r.unplannedAbsence
  }

  return NextResponse.json({
    date,
    totalQuadro,
    totalPlanned,
    totalUnplanned,
    attendanceRate: rate,
    byDept,
    byShift,
  })
}
