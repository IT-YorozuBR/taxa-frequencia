import { Shift } from './structure'

export interface ShiftData {
  quadro: number
  plannedAbsence: number
  unplannedAbsence: number
}

export type DeptShiftData = Record<string, Record<Shift, ShiftData>>

export function calcAttendanceRate(s: ShiftData): number {
  if (!s.quadro || s.quadro === 0) return 0
  return (s.quadro - (s.plannedAbsence + s.unplannedAbsence)) / s.quadro
}

export function emptyShift(): ShiftData {
  return { quadro: 0, plannedAbsence: 0, unplannedAbsence: 0 }
}

export function sumShifts(shifts: ShiftData[]): ShiftData {
  return shifts.reduce(
    (acc, s) => ({
      quadro: acc.quadro + s.quadro,
      plannedAbsence: acc.plannedAbsence + s.plannedAbsence,
      unplannedAbsence: acc.unplannedAbsence + s.unplannedAbsence,
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
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6) // skip Sat/Sun
  return d.toISOString().split('T')[0]
}

export function getPrevDayStr(dateStr: string): string {
  return getPrevWorkingDayStr(dateStr)
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
    if (r.shift === 'night') continue
    ensure(r.departmentKey)
    result[r.departmentKey][r.shift as Shift] = {
      quadro: r.quadro,
      plannedAbsence: r.plannedAbsence,
      unplannedAbsence: r.unplannedAbsence,
    }
  }

  for (const r of prevRecords) {
    if (r.shift !== 'night') continue
    ensure(r.departmentKey)
    result[r.departmentKey].night = {
      quadro: r.quadro,
      plannedAbsence: r.plannedAbsence,
      unplannedAbsence: r.unplannedAbsence,
    }
  }

  return result
}