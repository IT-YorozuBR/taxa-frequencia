import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Department groups: each entry maps a chart label to the leaf department keys
const GROUPS: { label: string; keys: string[] }[] = [
  {
    label: 'PRESENÇA',
    keys: ['adm','rh','fin','ti','sst','log','comp','com','eng','pint_int','manut','qual','prensa','cald','ferr','mont','pint','pick'],
  },
  { label: 'Q/A',    keys: ['qual'] },
  { label: 'ENG',    keys: ['eng', 'pint_int'] },
  { label: 'MANUT',  keys: ['manut'] },
  { label: 'PROD',   keys: ['mont', 'pint', 'pick'] },
  { label: 'OUTROS', keys: ['adm', 'rh', 'fin', 'ti', 'sst'] },
  { label: 'PCP',    keys: ['log', 'comp', 'com'] },
  { label: 'PRENSA', keys: ['prensa', 'cald', 'ferr'] },
]

function calcRate(records: { quadro: number; plannedAbsence: number; unplannedAbsence: number }[], keys: string[], allRecords: typeof records & { departmentKey: string }[]) {
  const filtered = (allRecords as (typeof records[0] & { departmentKey: string })[]).filter(r => keys.includes(r.departmentKey))
  const totalQ = filtered.reduce((s, r) => s + r.quadro, 0)
  const totalA = filtered.reduce((s, r) => s + r.plannedAbsence + r.unplannedAbsence, 0)
  return totalQ > 0 ? (totalQ - totalA) / totalQ : null
}

function getPrevWorkingDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  // getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat
  const dow = d.getUTCDay()
  const offset = dow === 1 ? 3 : 1 // Monday → go back 3 days (Friday), else 1 day
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const prevDate = getPrevWorkingDay(date)

  const [todayRecords, prevRecords] = await Promise.all([
    prisma.dailyAttendance.findMany({ where: { date: new Date(date + 'T00:00:00.000Z') } }),
    prisma.dailyAttendance.findMany({ where: { date: new Date(prevDate + 'T00:00:00.000Z') } }),
  ])

  const result = GROUPS.map(g => ({
    department: g.label,
    today: calcRate([], g.keys, todayRecords as (typeof todayRecords[0] & { departmentKey: string })[]),
    yesterday: calcRate([], g.keys, prevRecords as (typeof prevRecords[0] & { departmentKey: string })[]),
  }))

  return NextResponse.json({ date, prevDate, data: result })
}
