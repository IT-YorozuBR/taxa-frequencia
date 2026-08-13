import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTodayStr } from '@/lib/utils'
import { ensureCarryForwardToToday } from '@/lib/carryForward'

// End-of-day snapshot job. Triggered daily at 1:30 (Brasília time) by the
// cron container (see docker/cron-entrypoint.sh) / Vercel Cron (see
// vercel.json). It guarantees a snapshot row set exists for "today" by
// carrying forward the last working day with data — the same logic the page
// runs lazily on read, so behaviour is identical whether or not anyone
// opened the app.
//
// Shift mapping (1º/3º turno = today, 2º turno = previous working day) is handled
// inside ensureCarryForwardToToday: it copies the physical rows verbatim (except
// it drops the `night` row when materializing a Saturday, since 2º turno doesn't
// run then and that row would otherwise double-count against Friday's).
//
// The cron now fires every day (including weekends); GET /api/attendance still
// calls the same ensureCarryForwardToToday lazily on every read, so it remains
// a safety net if this cron ever fails to run rather than the only path for
// any particular day.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Vercel sets `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
  // configured. If set, reject anything that doesn't match so the endpoint
  // can't be triggered by the public.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const today = getTodayStr()

  try {
    const filled = await ensureCarryForwardToToday(today)

    const totalToday = await prisma.dailyAttendance.count({
      where: { date: new Date(today + 'T00:00:00.000Z') },
    })

    console.log(`[cron/snapshot] date=${today} filled=${JSON.stringify(filled)} totalToday=${totalToday}`)

    return NextResponse.json({
      ok: true,
      date: today,
      filledDays: filled,
      recordsToday: totalToday,
    })
  } catch (error) {
    console.error('[cron/snapshot] ERROR:', error)
    return NextResponse.json(
      { ok: false, error: 'Falha ao gerar snapshot' },
      { status: 500 }
    )
  }
}
