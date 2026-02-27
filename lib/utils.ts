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

/**
 * Returns the previous working day.
 * Monday → Friday (−3 days), any other weekday → yesterday (−1 day).
 * Weekends are skipped: Sunday → Friday, Saturday → Friday.
 */
export function getPreviousWorkingDay(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon, …, 6=Sat
  if (day === 0) {
    // Sunday → Friday
    d.setDate(d.getDate() - 2)
  } else if (day === 1) {
    // Monday → Friday
    d.setDate(d.getDate() - 3)
  } else {
    // Tue–Sat → previous day
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

/** Date string → previous working day string */
export function getPrevDayStr(dateStr: string): string {
  return toLocalDateStr(getPreviousWorkingDay(new Date(dateStr + 'T12:00:00')))
}

type RawRecord = {
  departmentKey: string
  shift: string
  quadro: number
  plannedAbsence: number
  unplannedAbsence: number
}

/** Build DeptShiftData from a flat list of records (all same date). */
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

/**
 * Merge records from two separate date fetches into a single DeptShiftData map.
 *  - currentRecords: day + zero records (from selectedDate)
 *  - prevRecords:    night records (from previousWorkingDay)
 * Only 'night' records from prevRecords are used; others are ignored.
 */
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

  // day + zero from selectedDate
  for (const r of currentRecords) {
    if (r.shift === 'night') continue // night comes from prevRecords
    ensure(r.departmentKey)
    result[r.departmentKey][r.shift as Shift] = {
      quadro: r.quadro,
      plannedAbsence: r.plannedAbsence,
      unplannedAbsence: r.unplannedAbsence,
    }
  }

  // night from previousWorkingDay
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
