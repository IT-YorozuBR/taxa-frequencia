import { prisma } from '@/lib/prisma'
import { getPrevWorkingDayStr, getNextWorkingDayStr, getTodayStr } from '@/lib/utils'

export type Rec = {
  departmentKey: string
  shift: string
  quadro: number
  plannedAbsence: number
  unplannedAbsence: number
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
// the PREVIOUS working day of today, since the night shift (2º turno) of any
// display date is read from the previous working day's record.
//
// ⚠️ Shift semantics: we copy ALL of the source day's rows verbatim — `day`
// (1º turno), `night` (2º turno) and `zero` (3º turno) together. Storage is
// shift-agnostic: a row's `shift` and `date` already encode where it belongs
// (night rows are stored under the previous working day on write, and read back
// for the next day on display). So snapshotting the physical rows forward is
// exactly correct — do NOT special-case shifts here, or the 2º turno mapping
// breaks.
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
  // Note: getNextWorkingDayStr only yields Mon–Fri, so this never creates
  // weekend rows even when invoked on a Saturday/Sunday.
  const filled: string[] = []
  let cursor = getNextWorkingDayStr(source.dateStr)
  while (cursor <= today) {
    await prisma.dailyAttendance.createMany({
      data: source.recs.map(r => ({
        date: new Date(cursor + 'T00:00:00.000Z'),
        departmentKey: r.departmentKey,
        shift: r.shift,
        quadro: r.quadro,
        plannedAbsence: r.plannedAbsence,
        unplannedAbsence: r.unplannedAbsence,
      })),
      skipDuplicates: true, // safe under concurrent requests (ON CONFLICT DO NOTHING)
    })
    filled.push(cursor)
    cursor = getNextWorkingDayStr(cursor)
  }
  return filled
}
