import { describe, it, expect } from 'vitest'
import { validateAttendancePayload } from './validation'

const valid = {
  date: '2026-08-21',
  departmentKey: 'adm',
  shift: 'day',
  quadro: 3,
  plannedAbsence: 1,
  unplannedAbsence: 0,
  indeterminateAbsence: 0,
}

describe('validateAttendancePayload', () => {
  it('accepts a well-formed payload', () => {
    const result = validateAttendancePayload(valid)
    expect(result.ok).toBe(true)
  })

  it('accepts a payload with absence fields omitted (defaults to 0)', () => {
    const result = validateAttendancePayload({ date: '2026-08-21', departmentKey: 'adm', shift: 'day', quadro: 3 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.plannedAbsence).toBe(0)
      expect(result.value.indeterminateAbsence).toBe(0)
    }
  })

  it('rejects a malformed date', () => {
    expect(validateAttendancePayload({ ...valid, date: '21/08/2026' }).ok).toBe(false)
  })

  it('rejects a department key that does not exist', () => {
    expect(validateAttendancePayload({ ...valid, departmentKey: 'nao-existe' }).ok).toBe(false)
  })

  it('rejects an invalid shift', () => {
    expect(validateAttendancePayload({ ...valid, shift: 'madrugada' }).ok).toBe(false)
  })

  it('rejects a negative number', () => {
    expect(validateAttendancePayload({ ...valid, unplannedAbsence: -1 }).ok).toBe(false)
  })

  it('rejects a string where a number is expected', () => {
    expect(validateAttendancePayload({ ...valid, quadro: 'tres' }).ok).toBe(false)
  })

  it('rejects NaN / Infinity', () => {
    expect(validateAttendancePayload({ ...valid, quadro: NaN }).ok).toBe(false)
    expect(validateAttendancePayload({ ...valid, quadro: Infinity }).ok).toBe(false)
  })

  it('rejects an absurdly large number', () => {
    expect(validateAttendancePayload({ ...valid, quadro: 999999 }).ok).toBe(false)
  })

  it('rejects a non-object body', () => {
    expect(validateAttendancePayload(null).ok).toBe(false)
    expect(validateAttendancePayload('adm').ok).toBe(false)
  })
})
