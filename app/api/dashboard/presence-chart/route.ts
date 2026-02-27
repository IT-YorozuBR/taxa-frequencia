import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Department groups shown in the Excel chart, in order
const GROUPS = [
  { label: 'OUTROS',  keys: ['adm', 'rh', 'fin', 'ti', 'sst'] },
  { label: 'PCP',     keys: ['log', 'comp', 'com'] },
  { label: 'ENG',     keys: ['eng', 'pint_int'] },
  { label: 'QA',      keys: ['qual'] },
  { label: 'PRENSA',  keys: ['prensa', 'cald', 'ferr'] },
  { label: 'PROD',    keys: ['mont', 'pint', 'pick'] },
  { label: 'MANUT',   keys: ['manut'] },
  { label: 'TOTAL',   keys: ['adm','rh','fin','ti','sst','log','comp','com','eng','pint_int','manut','qual','prensa','cald','ferr','mont','pint','pick'] },
]

type Rec = { departmentKey: string; shift: string; quadro: number; plannedAbsence: number; unplannedAbsence: number }

function rate(records: Rec[], keys: string[], shift: string | null): number | null {
  const filtered = records.filter(r =>
    keys.includes(r.departmentKey) && (shift == null || r.shift === shift)
  )
  const q = filtered.reduce((s, r) => s + r.quadro, 0)
  const a = filtered.reduce((s, r) => s + r.plannedAbsence + r.unplannedAbsence, 0)
  return q > 0 ? (q - a) / q : null
}

function getPrevWorkingDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dow = d.getUTCDay() // 0=Sun, 1=Mon
  d.setUTCDate(d.getUTCDate() - (dow === 1 ? 3 : 1))
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const prevDate = getPrevWorkingDay(date)

  const [todayRecs, prevRecs] = await Promise.all([
    prisma.dailyAttendance.findMany({ where: { date: new Date(date + 'T00:00:00.000Z') } }),
    prisma.dailyAttendance.findMany({ where: { date: new Date(prevDate + 'T00:00:00.000Z') } }),
  ])

  const build = (recs: Rec[], shift: string) =>
    GROUPS.map(g => ({
      label: g.label,
      rate: rate(recs, g.keys, shift),
    }))

  return NextResponse.json({
    date,
    prevDate,
    turno1: {
      today:    build(todayRecs, 'day'),
      previous: build(prevRecs,  'day'),
    },
    turno2: {
      today:    build(todayRecs, 'night'),
      previous: build(prevRecs,  'night'),
    },
  })
}
