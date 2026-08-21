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
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { findLastDayWithData, ensureCarryForwardToToday } from './carryForward'

const mockedFindMany = prisma.dailyAttendance.findMany as ReturnType<typeof vi.fn>
const mockedCount = prisma.dailyAttendance.count as ReturnType<typeof vi.fn>
const mockedCreateMany = prisma.dailyAttendance.createMany as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockedFindMany.mockReset()
  mockedCount.mockReset()
  mockedCreateMany.mockReset().mockResolvedValue({ count: 0 })
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
