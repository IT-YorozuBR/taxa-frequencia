import { describe, it, expect } from 'vitest'
import {
  calcAttendanceRate,
  emptyShift,
  sumShifts,
  getPrevWorkingDayStr,
  getNextWorkingDayStr,
  isWeekend,
  chartShiftDates,
  buildDeptShiftData,
  buildMixedDeptShiftData,
  toLocalDateStr,
  formatDate,
} from './utils'

describe('calcAttendanceRate', () => {
  it('returns 0 when quadro is 0 (avoids division by zero)', () => {
    expect(calcAttendanceRate(emptyShift())).toBe(0)
  })

  it('is 1 (100%) when there are no absences', () => {
    const rate = calcAttendanceRate({ quadro: 10, plannedAbsence: 0, unplannedAbsence: 0, indeterminateAbsence: 0 })
    expect(rate).toBe(1)
  })

  it('subtracts planned, unplanned AND indeterminate absences from quadro', () => {
    // 10 quadro, 1 planned + 1 unplanned + 1 indeterminate = 7/10 = 0.7
    const rate = calcAttendanceRate({ quadro: 10, plannedAbsence: 1, unplannedAbsence: 1, indeterminateAbsence: 1 })
    expect(rate).toBeCloseTo(0.7)
  })

  it('can go to 0 when absences equal quadro', () => {
    const rate = calcAttendanceRate({ quadro: 5, plannedAbsence: 2, unplannedAbsence: 2, indeterminateAbsence: 1 })
    expect(rate).toBe(0)
  })
})

describe('emptyShift / sumShifts', () => {
  it('emptyShift has every field zeroed, including indeterminateAbsence', () => {
    expect(emptyShift()).toEqual({
      quadro: 0, plannedAbsence: 0, unplannedAbsence: 0, indeterminateAbsence: 0,
    })
  })

  it('sumShifts adds each field across multiple shifts', () => {
    const total = sumShifts([
      { quadro: 3, plannedAbsence: 1, unplannedAbsence: 0, indeterminateAbsence: 0 },
      { quadro: 5, plannedAbsence: 0, unplannedAbsence: 2, indeterminateAbsence: 1 },
    ])
    expect(total).toEqual({ quadro: 8, plannedAbsence: 1, unplannedAbsence: 2, indeterminateAbsence: 1 })
  })

  it('sumShifts of an empty array is emptyShift()', () => {
    expect(sumShifts([])).toEqual(emptyShift())
  })
})

describe('working-day date helpers', () => {
  it('previous working day of a Monday is the Friday before (-3 days)', () => {
    // 2026-08-24 is a Monday
    expect(getPrevWorkingDayStr('2026-08-24')).toBe('2026-08-21')
  })

  it('previous working day of a Sunday is the Friday before (-2 days)', () => {
    // 2026-08-23 is a Sunday
    expect(getPrevWorkingDayStr('2026-08-23')).toBe('2026-08-21')
  })

  it('previous working day of a mid-week day is just the day before', () => {
    // 2026-08-21 is a Friday
    expect(getPrevWorkingDayStr('2026-08-21')).toBe('2026-08-20')
  })

  it('next working day skips Sunday but not Saturday', () => {
    // 2026-08-21 (Friday) -> Saturday (factory runs 1o/3o turno Saturdays)
    expect(getNextWorkingDayStr('2026-08-21')).toBe('2026-08-22')
    // 2026-08-22 (Saturday) -> Monday (Sunday skipped)
    expect(getNextWorkingDayStr('2026-08-22')).toBe('2026-08-24')
  })

  it('isWeekend flags Saturday and Sunday only', () => {
    expect(isWeekend('2026-08-22')).toBe(true)  // Sat
    expect(isWeekend('2026-08-23')).toBe(true)  // Sun
    expect(isWeekend('2026-08-21')).toBe(false) // Fri
    expect(isWeekend('2026-08-24')).toBe(false) // Mon
  })
})

describe('chartShiftDates', () => {
  it('on a weekday, 1o turno reads the same day; 2o/3o read the previous working day', () => {
    // 2026-08-21 is a Friday
    const d = chartShiftDates('2026-08-21')
    expect(d.day).toBe('2026-08-21')
    expect(d.night).toBe('2026-08-20')
    expect(d.zero).toBe('2026-08-20')
  })

  it('on a weekend, all three shifts fall back to Friday (no weekend chart)', () => {
    // 2026-08-22 is a Saturday
    const d = chartShiftDates('2026-08-22')
    expect(d.day).toBe('2026-08-21')
    expect(d.night).toBe('2026-08-21')
    expect(d.zero).toBe('2026-08-21')
  })
})

describe('buildDeptShiftData / buildMixedDeptShiftData', () => {
  const rec = (departmentKey: string, shift: string, quadro: number) => ({
    departmentKey, shift, quadro, plannedAbsence: 0, unplannedAbsence: 0, indeterminateAbsence: 0,
  })

  it('buildDeptShiftData groups records by department and shift', () => {
    const result = buildDeptShiftData([rec('adm', 'day', 3), rec('adm', 'night', 1)])
    expect(result.adm.day.quadro).toBe(3)
    expect(result.adm.night.quadro).toBe(1)
    expect(result.adm.zero).toEqual(emptyShift())
  })

  it('buildMixedDeptShiftData takes day from current records and night/zero from previous', () => {
    const current = [rec('adm', 'day', 3), rec('adm', 'night', 99)] // night here should be ignored
    const prev = [rec('adm', 'night', 1), rec('adm', 'zero', 2), rec('adm', 'day', 99)] // day here should be ignored
    const result = buildMixedDeptShiftData(current, prev)
    expect(result.adm.day.quadro).toBe(3)
    expect(result.adm.night.quadro).toBe(1)
    expect(result.adm.zero.quadro).toBe(2)
  })
})

describe('date formatting', () => {
  it('toLocalDateStr and formatDate agree on the same UTC instant', () => {
    const d = new Date('2026-08-21T00:00:00.000Z')
    expect(formatDate(d)).toBe('2026-08-21')
    // toLocalDateStr uses local calendar fields — only assert format shape
    // here since it depends on the machine's timezone.
    expect(toLocalDateStr(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
