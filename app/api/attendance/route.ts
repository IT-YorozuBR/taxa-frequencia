import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getPrevWorkingDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dow = d.getUTCDay() // 0=Sun, 1=Mon
  const offset = dow === 0 ? 2 : dow === 1 ? 3 : 1
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) {
    return NextResponse.json({ error: 'date required' }, { status: 400 })
  }

  // Optional shift filter: ?shift=day | night | zero
  const shiftFilter = req.nextUrl.searchParams.get('shift')

  const where: Record<string, unknown> = {
    date: new Date(date + 'T00:00:00.000Z'),
  }
  if (shiftFilter) where.shift = shiftFilter

  const records = await prisma.dailyAttendance.findMany({ where })
  return NextResponse.json(records)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, departmentKey, shift, quadro, plannedAbsence, unplannedAbsence } = body

  if (!date || !departmentKey || !shift) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Noturno is always stored under the PREVIOUS working day
  const storeDate = shift === 'night' ? getPrevWorkingDayStr(date) : date

  const record = await prisma.dailyAttendance.upsert({
    where: {
      date_departmentKey_shift: {
        date: new Date(storeDate + 'T00:00:00.000Z'),
        departmentKey,
        shift,
      },
    },
    update: {
      quadro: quadro ?? 0,
      plannedAbsence: plannedAbsence ?? 0,
      unplannedAbsence: unplannedAbsence ?? 0,
    },
    create: {
      date: new Date(storeDate + 'T00:00:00.000Z'),
      departmentKey,
      shift,
      quadro: quadro ?? 0,
      plannedAbsence: plannedAbsence ?? 0,
      unplannedAbsence: unplannedAbsence ?? 0,
    },
  })

  return NextResponse.json(record)
}
