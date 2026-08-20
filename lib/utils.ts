import { Shift } from './structure'

export interface ShiftData {
  quadro: number
  plannedAbsence: number
  unplannedAbsence: number
  indeterminateAbsence: number
}

export type DeptShiftData = Record<string, Record<Shift, ShiftData>>

export function calcAttendanceRate(s: ShiftData): number {
  if (!s.quadro || s.quadro === 0) return 0
  return (s.quadro - (s.plannedAbsence + s.unplannedAbsence + s.indeterminateAbsence)) / s.quadro
}

export function emptyShift(): ShiftData {
  return { quadro: 0, plannedAbsence: 0, unplannedAbsence: 0, indeterminateAbsence: 0 }
}

export function sumShifts(shifts: ShiftData[]): ShiftData {
  return shifts.reduce(
    (acc, s) => ({
      quadro: acc.quadro + s.quadro,
      plannedAbsence: acc.plannedAbsence + s.plannedAbsence,
      unplannedAbsence: acc.unplannedAbsence + s.unplannedAbsence,
      indeterminateAbsence: acc.indeterminateAbsence + s.indeterminateAbsence,
    }),
    emptyShift()
  )
}

export function getPreviousWorkingDay(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  if (day === 0) {
    d.setDate(d.getDate() - 2)
  } else if (day === 1) {
    d.setDate(d.getDate() - 3)
  } else {
    d.setDate(d.getDate() - 1)
  }
  return d
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Canonical working-day helpers (UTC, shared by client + API) ───────────────
// Working days = Mon–Fri. "Previous working day": Mon → Fri (-3), Sun → Fri (-2),
// otherwise the day before (-1). Use these everywhere so the page and every
// dashboard endpoint agree on what "the previous/next working day" is.

export function getPrevWorkingDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dow = d.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = dow === 0 ? 2 : dow === 1 ? 3 : 1
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().split('T')[0]
}

export function getNextWorkingDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (d.getUTCDay() === 0) // skip Sunday only — Saturday runs 1º/3º turno
  return d.toISOString().split('T')[0]
}

export function getPrevDayStr(dateStr: string): string {
  return getPrevWorkingDayStr(dateStr)
}

export function isWeekend(dateStr: string): boolean {
  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay()
  return dow === 0 || dow === 6 // domingo ou sábado
}

// Resolve, para uma data exibida num gráfico do dashboard, de qual data
// física cada turno deve ler. 2º/3º turno sempre olham para o dia útil
// anterior; 1º turno só cai para o dia útil anterior quando a data
// exibida é sábado/domingo (fim de semana não tem gráfico próprio — os
// três turnos mostram sexta-feira).
export function chartShiftDates(date: string): { day: string; night: string; zero: string } {
  const prev = getPrevWorkingDayStr(date)
  return {
    day: isWeekend(date) ? prev : date,
    night: prev,
    zero: prev,
  }
}

// "Today" as a YYYY-MM-DD string in the business timezone (America/São Paulo).
// IMPORTANT: the server runs in UTC on Vercel, so using new Date().toISOString()
// would roll over to "tomorrow" after 21:00 local time. We anchor on the same
// timezone the client uses (toLocalDateStr) so the page, the API and the cron all
// agree on what "today" is. en-CA locale yields the ISO YYYY-MM-DD format.
export function getTodayStr(tz = 'America/Sao_Paulo'): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

type RawRecord = {
  departmentKey: string
  shift: string
  quadro: number
  plannedAbsence: number
  unplannedAbsence: number
  indeterminateAbsence: number
}

export function buildDeptShiftData(records: RawRecord[]): DeptShiftData {
  const result: DeptShiftData = {}
  for (const r of records) {
    if (!result[r.departmentKey]) {
      result[r.departmentKey] = {
        day: emptyShift(),
        night: emptyShift(),
        zero: emptyShift(),
      }
    }
    result[r.departmentKey][r.shift as Shift] = {
      quadro: r.quadro,
      plannedAbsence: r.plannedAbsence,
      unplannedAbsence: r.unplannedAbsence,
      indeterminateAbsence: r.indeterminateAbsence,
    }
  }
  return result
}

export function buildMixedDeptShiftData(
  currentRecords: RawRecord[],
  prevRecords: RawRecord[]
): DeptShiftData {
  const result: DeptShiftData = {}

  const ensure = (key: string) => {
    if (!result[key]) {
      result[key] = { day: emptyShift(), night: emptyShift(), zero: emptyShift() }
    }
  }

  for (const r of currentRecords) {
    if (r.shift === 'night' || r.shift === 'zero') continue
    ensure(r.departmentKey)
    result[r.departmentKey][r.shift as Shift] = {
      quadro: r.quadro,
      plannedAbsence: r.plannedAbsence,
      unplannedAbsence: r.unplannedAbsence,
      indeterminateAbsence: r.indeterminateAbsence,
    }
  }

  for (const r of prevRecords) {
    if (r.shift !== 'night' && r.shift !== 'zero') continue
    ensure(r.departmentKey)
    result[r.departmentKey][r.shift as 'night' | 'zero'] = {
      quadro: r.quadro,
      plannedAbsence: r.plannedAbsence,
      unplannedAbsence: r.unplannedAbsence,
      indeterminateAbsence: r.indeterminateAbsence,
    }
  }

  return result
}