import { ALL_LEAF_KEYS, Shift } from './structure'

const VALID_SHIFTS: Shift[] = ['day', 'night', 'zero']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_HEADCOUNT = 1000 // generous ceiling — largest real department is ~100

export interface AttendancePayload {
  date: string
  departmentKey: string
  shift: Shift
  quadro: number
  plannedAbsence: number
  unplannedAbsence: number
  indeterminateAbsence: number
}

export type ValidationResult =
  | { ok: true; value: AttendancePayload }
  | { ok: false; error: string }

function isValidDateStr(date: string): boolean {
  if (!DATE_RE.test(date)) return false
  const d = new Date(date + 'T00:00:00Z')
  return !isNaN(d.getTime()) && date === d.toISOString().slice(0, 10)
}

// A field is "valid" if it's absent/undefined (defaults to 0 downstream) or
// a finite, non-negative number within a sane real-world range.
function isValidCount(value: unknown): value is number | undefined {
  if (value === undefined || value === null) return true
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_HEADCOUNT
}

export function validateAttendancePayload(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Corpo da requisição inválido' }
  }

  const { date, departmentKey, shift, quadro, plannedAbsence, unplannedAbsence, indeterminateAbsence } =
    body as Record<string, unknown>

  if (typeof date !== 'string' || !isValidDateStr(date)) {
    return { ok: false, error: 'date inválida (esperado YYYY-MM-DD)' }
  }
  if (typeof departmentKey !== 'string' || !ALL_LEAF_KEYS.includes(departmentKey)) {
    return { ok: false, error: 'departmentKey inválido' }
  }
  if (typeof shift !== 'string' || !VALID_SHIFTS.includes(shift as Shift)) {
    return { ok: false, error: 'shift inválido (esperado day, night ou zero)' }
  }
  if (!isValidCount(quadro) || !isValidCount(plannedAbsence) || !isValidCount(unplannedAbsence) || !isValidCount(indeterminateAbsence)) {
    return { ok: false, error: `Valores numéricos devem ser >= 0 e <= ${MAX_HEADCOUNT}` }
  }

  return {
    ok: true,
    value: {
      date,
      departmentKey,
      shift: shift as Shift,
      quadro: (quadro as number) ?? 0,
      plannedAbsence: (plannedAbsence as number) ?? 0,
      unplannedAbsence: (unplannedAbsence as number) ?? 0,
      indeterminateAbsence: (indeterminateAbsence as number) ?? 0,
    },
  }
}
