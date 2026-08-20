import { prisma } from '@/lib/prisma'
import { getPrevWorkingDayStr, getNextWorkingDayStr, getTodayStr } from '@/lib/utils'

export type Rec = {
  departmentKey: string
  shift: string
  quadro: number
  plannedAbsence: number
  unplannedAbsence: number
  indeterminateAbsence: number
}

// Find the most recent working day (on or before `fromDate`) that has records.
// Returns null if nothing is found within `maxBack` working days.
export async function findLastDayWithData(
  fromDate: string,
  maxBack = 60
): Promise<{ dateStr: string; recs: Rec[] } | null> {
  let searchDate = fromDate
  for (let i = 0; i < maxBack; i++) {
    const recs = await prisma.dailyAttendance.findMany({
      where: { date: new Date(searchDate + 'T00:00:00.000Z') },
    })
    if (recs.length > 0) return { dateStr: searchDate, recs }
    searchDate = getPrevWorkingDayStr(searchDate)
  }
  return null
}

// Idempotently carry forward the last day with data across every working day up
// to (and including) `today`. This guarantees the whole chain exists — crucially
// the PREVIOUS working day of today, since the night AND zero shifts (2º/3º
// turno) of any display date are read from the previous working day's record.
//
// ⚠️ Shift semantics: we copy ALL of the source day's rows verbatim — `day`
// (1º turno), `night` (2º turno) and `zero` (3º turno) together. Storage is
// shift-agnostic: a row's `shift` and `date` already encode where it belongs
// (night AND zero rows are stored under the previous working day on write,
// and read back for the next day on display). So snapshotting the physical
// rows forward is exactly correct — do NOT special-case shifts here, or the
// 2º/3º turno mapping breaks.
//
// Exception: Saturday. The factory only runs 1º turno on Saturdays — 2º/3º
// turno for a Saturday view are already read dynamically from Friday's
// `night`/`zero` rows (getPrevWorkingDayStr(Saturday) === Friday). So when
// materializing a Saturday we drop the copied `night` and `zero` rows:
// keeping them would create rows physically dated on Saturday that no read
// path ever consults for that Saturday, but that summary/department-
// comparison endpoints (which sum ALL shifts for a date without the
// presence table's night/zero exclusion) would double-count alongside the
// real Friday night/zero figures.
//
// Returns the list of dates that were materialized (empty if nothing to do).
export async function ensureCarryForwardToToday(
  today: string = getTodayStr()
): Promise<string[]> {
  const todayObj = new Date(today + 'T00:00:00.000Z')

  // Fast path: today already materialized → nothing to do.
  const todayCount = await prisma.dailyAttendance.count({ where: { date: todayObj } })
  if (todayCount > 0) return []

  // Source = last working day (before today) that actually has data.
  const source = await findLastDayWithData(getPrevWorkingDayStr(today))
  if (!source) return [] // empty database — nothing to carry forward

  // Walk forward over working days from source+1 … today, filling any gap.
  // Note: getNextWorkingDayStr yields Mon–Sat (Sunday is skipped), so this
  // materializes Saturday's 1º/3º turno but never creates a Sunday row.
  const filled: string[] = []
  let cursor = getNextWorkingDayStr(source.dateStr)
  while (cursor <= today) {
    const isSaturday = new Date(cursor + 'T12:00:00Z').getUTCDay() === 6
    const recsToCopy = isSaturday ? source.recs.filter(r => r.shift === 'day') : source.recs

    await prisma.dailyAttendance.createMany({
      data: recsToCopy.map(r => ({
        date: new Date(cursor + 'T00:00:00.000Z'),
        departmentKey: r.departmentKey,
        shift: r.shift,
        quadro: r.quadro,
        plannedAbsence: r.plannedAbsence,
        unplannedAbsence: r.unplannedAbsence,
        indeterminateAbsence: r.indeterminateAbsence,
      })),
      skipDuplicates: true, // safe under concurrent requests (ON CONFLICT DO NOTHING)
    })
    filled.push(cursor)
    cursor = getNextWorkingDayStr(cursor)
  }
  return filled
}
