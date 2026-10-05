import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Prisma client before importing the module under test, so
// carryForward.ts's `import { prisma } from './prisma'` resolves to this
// fake instead of hitting a real database.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyAttendance: {
      count: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { findLastDayWithData, ensureCarryForwardToToday, propagateShiftForward } from './carryForward'

const mockedFindMany = prisma.dailyAttendance.findMany as ReturnType<typeof vi.fn>
const mockedCount = prisma.dailyAttendance.count as ReturnType<typeof vi.fn>
const mockedCreateMany = prisma.dailyAttendance.createMany as ReturnType<typeof vi.fn>
const mockedFindUnique = prisma.dailyAttendance.findUnique as ReturnType<typeof vi.fn>
const mockedUpdate = prisma.dailyAttendance.update as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockedFindMany.mockReset()
  mockedCount.mockReset()
  mockedCreateMany.mockReset().mockResolvedValue({ count: 0 })
  mockedFindUnique.mockReset()
  mockedUpdate.mockReset().mockResolvedValue({})
})

function dateStrOf(where: { date: Date }): string {
  return where.date.toISOString().slice(0, 10)
}

describe('findLastDayWithData', () => {
  it('walks backward through working days until it finds records', async () => {
    // 2026-08-19 (Wednesday) has data; nothing on the days in between.
    mockedFindMany.mockImplementation(({ where }: { where: { date: Date } }) => {
      return Promise.resolve(dateStrOf(where) === '2026-08-19' ? [{ id: 'r1' }] : [])
    })

    const result = await findLastDayWithData('2026-08-20')
    expect(result).toEqual({ dateStr: '2026-08-19', recs: [{ id: 'r1' }] })
  })

  it('returns null when nothing is found within maxBack working days', async () => {
    mockedFindMany.mockResolvedValue([])
    const result = await findLastDayWithData('2026-08-20', 5)
    expect(result).toBeNull()
    expect(mockedFindMany).toHaveBeenCalledTimes(5)
  })
})

describe('ensureCarryForwardToToday', () => {
  it('is a no-op when today already has records', async () => {
    mockedCount.mockResolvedValue(3)
    const filled = await ensureCarryForwardToToday('2026-08-21')
    expect(filled).toEqual([])
    expect(mockedFindMany).not.toHaveBeenCalled()
    expect(mockedCreateMany).not.toHaveBeenCalled()
  })

  it('is a no-op when there is no data anywhere to carry forward from', async () => {
    mockedCount.mockResolvedValue(0)
    mockedFindMany.mockResolvedValue([])
    const filled = await ensureCarryForwardToToday('2026-08-21')
    expect(filled).toEqual([])
    expect(mockedCreateMany).not.toHaveBeenCalled()
  })

  it('fills every working day from the source forward, dropping night/zero rows on Saturday', async () => {
    // 2026-08-17 is a Monday. today = 2026-08-22, a Saturday five calendar
    // days later. Expected filled days (working days only, Sunday skipped
    // by getNextWorkingDayStr): Tue 18, Wed 19, Thu 20, Fri 21, Sat 22.
    const sourceDateStr = '2026-08-17'
    const today = '2026-08-22'

    const sourceRecs = [
      { departmentKey: 'adm', shift: 'day', quadro: 3, plannedAbsence: 0, unplannedAbsence: 0, indeterminateAbsence: 0 },
      { departmentKey: 'adm', shift: 'night', quadro: 1, plannedAbsence: 0, unplannedAbsence: 0, indeterminateAbsence: 0 },
      { departmentKey: 'adm', shift: 'zero', quadro: 1, plannedAbsence: 0, unplannedAbsence: 0, indeterminateAbsence: 0 },
    ]

    mockedCount.mockResolvedValue(0) // today has no data yet
    mockedFindMany.mockImplementation(({ where }: { where: { date: Date } }) => {
      return Promise.resolve(dateStrOf(where) === sourceDateStr ? sourceRecs : [])
    })

    const filled = await ensureCarryForwardToToday(today)

    expect(filled).toEqual(['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22'])
    expect(mockedCreateMany).toHaveBeenCalledTimes(5)

    // Weekday materializations copy all 3 rows verbatim.
    const tuesdayCall = mockedCreateMany.mock.calls[0][0]
    expect(tuesdayCall.data).toHaveLength(3)

    // Saturday materialization must drop night/zero — only 'day' survives.
    const saturdayCall = mockedCreateMany.mock.calls[4][0]
    expect(saturdayCall.data).toHaveLength(1)
    expect(saturdayCall.data[0].shift).toBe('day')
  })
})

describe('propagateShiftForward', () => {
  const v = (quadro: number, unplanned = 0) => ({
    quadro,
    plannedAbsence: 0,
    unplannedAbsence: unplanned,
    indeterminateAbsence: 0,
  })
  const dateOf = (arg: { where: { date_departmentKey_shift: { date: Date } } }) =>
    arg.where.date_departmentKey_shift.date.toISOString().slice(0, 10)

  it('creates the missing rows on already-materialized days (the 2026-10-01 incident)', async () => {
    // Edit of mont night on Thursday 10-01 is stored on Wed 09-30 (row did not exist).
    // 10-01 and 10-02 were already materialized without a mont night row.
    mockedCount.mockResolvedValue(32)
    mockedFindUnique.mockResolvedValue(null)

    const touched = await propagateShiftForward({
      storeDate: '2026-09-30',
      departmentKey: 'mont',
      shift: 'night',
      before: null,
      after: v(61, 4),
      today: '2026-10-02',
    })

    expect(touched).toEqual(['2026-10-01', '2026-10-02'])
    expect(mockedCreateMany).toHaveBeenCalledTimes(2)
    expect(mockedCreateMany.mock.calls[0][0].data[0]).toMatchObject({ departmentKey: 'mont', shift: 'night', quadro: 61, unplannedAbsence: 4 })
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('updates later rows that are still plain copies of the old value', async () => {
    mockedCount.mockResolvedValue(32)
    mockedFindUnique.mockResolvedValue(v(2))

    const touched = await propagateShiftForward({
      storeDate: '2026-09-30',
      departmentKey: 'log',
      shift: 'night',
      before: v(2),
      after: v(5),
      today: '2026-10-02',
    })

    expect(touched).toEqual(['2026-10-01', '2026-10-02'])
    expect(mockedUpdate).toHaveBeenCalledTimes(2)
    expect(mockedUpdate.mock.calls[0][0].data).toMatchObject({ quadro: 5 })
  })

  it('leaves an explicitly edited row alone and stops the chain there', async () => {
    mockedCount.mockResolvedValue(32)
    mockedFindUnique.mockImplementation((arg: { where: { date_departmentKey_shift: { date: Date } } }) =>
      Promise.resolve(dateOf(arg) === '2026-10-01' ? v(9) : v(2))
    )

    const touched = await propagateShiftForward({
      storeDate: '2026-09-30',
      departmentKey: 'log',
      shift: 'night',
      before: v(2),
      after: v(5),
      today: '2026-10-02',
    })

    expect(touched).toEqual([])
    expect(mockedUpdate).not.toHaveBeenCalled()
    expect(mockedCreateMany).not.toHaveBeenCalled()
  })

  it('does not overwrite an existing row when the edited row had no previous value', async () => {
    mockedCount.mockResolvedValue(32)
    mockedFindUnique.mockResolvedValue(v(0, 4))

    const touched = await propagateShiftForward({
      storeDate: '2026-09-30',
      departmentKey: 'mont',
      shift: 'night',
      before: null,
      after: v(61, 4),
      today: '2026-10-02',
    })

    expect(touched).toEqual([])
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('skips Saturday and carries Friday over to Monday', async () => {
    // Fri 10-02 → Sat 10-03 (skipped: no night/zero) → Mon 10-05.
    mockedCount.mockResolvedValue(32)
    mockedFindUnique.mockResolvedValue(null)

    const touched = await propagateShiftForward({
      storeDate: '2026-10-02',
      departmentKey: 'mont',
      shift: 'zero',
      before: null,
      after: v(10),
      today: '2026-10-05',
    })

    expect(touched).toEqual(['2026-10-05'])
  })

  it('stops at a day that is not materialized yet', async () => {
    mockedCount.mockImplementation(({ where }: { where: { date: Date } }) =>
      Promise.resolve(dateStrOf(where) === '2026-10-01' ? 32 : 0)
    )
    mockedFindUnique.mockResolvedValue(null)

    const touched = await propagateShiftForward({
      storeDate: '2026-09-30',
      departmentKey: 'mont',
      shift: 'night',
      before: null,
      after: v(61),
      today: '2026-10-02',
    })

    expect(touched).toEqual(['2026-10-01'])
  })

  it('ignores day-shift edits and unchanged values', async () => {
    expect(
      await propagateShiftForward({ storeDate: '2026-09-30', departmentKey: 'mont', shift: 'day', before: v(1), after: v(2), today: '2026-10-02' })
    ).toEqual([])
    expect(
      await propagateShiftForward({ storeDate: '2026-09-30', departmentKey: 'mont', shift: 'night', before: v(1), after: v(1), today: '2026-10-02' })
    ).toEqual([])
    expect(mockedCount).not.toHaveBeenCalled()
  })
})
