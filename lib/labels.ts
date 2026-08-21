import { TABLE_ROWS, SHIFTS, Shift } from './structure'

const DEPT_LABELS: Record<string, string> = Object.fromEntries(
  TABLE_ROWS.filter(r => r.type === 'leaf').map(r => [(r as { key: string }).key, (r as { name: string }).name])
)

const SHIFT_LABELS: Record<string, string> = Object.fromEntries(
  SHIFTS.map(s => [s.key, s.label])
)

export function deptLabel(key: string): string {
  return DEPT_LABELS[key] ?? key
}

export function shiftLabel(key: string): string {
  return SHIFT_LABELS[key as Shift] ?? key
}
