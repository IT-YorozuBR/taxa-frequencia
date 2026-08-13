import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPrevWorkingDayStr, chartShiftDates } from '@/lib/utils'

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

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const prevDate = getPrevWorkingDayStr(date)
  const shiftDates = chartShiftDates(date)

  const [todayRecs, prevRecs] = await Promise.all([
    prisma.dailyAttendance.findMany({ where: { date: new Date(date + 'T00:00:00.000Z') } }),
    prisma.dailyAttendance.findMany({ where: { date: new Date(prevDate + 'T00:00:00.000Z') } }),
  ])

  // Fim de semana não tem gráfico próprio: turno1 (1º) de sábado/domingo
  // mostra sexta, igual ao 2º turno já faz — shiftDates.day resolve isso
  // e, quando é fim de semana, sempre coincide com `prevRecs`.
  const turno1TodaySource = shiftDates.day === date ? todayRecs : prevRecs

  const build = (recs: Rec[], shift: string) =>
    GROUPS.map(g => ({
      label: g.label,
      rate: rate(recs, g.keys, shift),
    }))

  return NextResponse.json({
    date,
    prevDate,
    turno1: {
      today:    build(turno1TodaySource, 'day'),
      previous: build(prevRecs,  'day'),
    },
    turno2: {
      today:    build(todayRecs, 'night'),
      previous: build(prevRecs,  'night'),
    },
    turno3: {
      today:    build(todayRecs, 'zero'),
      previous: build(prevRecs,  'zero'),
    },
  })
}
