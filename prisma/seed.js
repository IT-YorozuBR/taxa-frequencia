/**
 * Seed script — plain JS, no TypeScript compilation needed.
 * Run with: node prisma/seed.js
 * Or via npm:  npm run db:seed
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Baseline quadro per department per shift from Excel "本日_Hoje"
// [departmentKey, diurno(day), noturno(night), zeroHora(zero)]
const BASELINE = [
  // OUTROS
  ['adm',       3,  0,  0],
  ['rh',        4,  0,  0],
  ['fin',       6,  0,  0],
  ['ti',        3,  0,  0],
  ['sst',       2,  1,  0],
  // PCP
  ['log',      12,  2,  0],
  ['comp',      3,  0,  0],
  ['com',       2,  0,  0],
  // Eng
  ['eng',       5,  0,  0],
  ['pint_int',  3,  2,  2],
  // Standalone
  ['manut',     8,  4,  2],
  ['qual',     14,  4,  1],
  // PRENSA
  ['prensa',   23, 19, 11],
  ['cald',      4,  0,  0],
  ['ferr',      4,  3,  1],
  // Produção
  ['mont',     97, 61,  9],
  ['pint',     14,  7,  0],
  ['pick',     15,  9,  3],
]

function getPrevWorkday(date) {
  const d = new Date(date)
  const dow = d.getDay() // 0=Sun, 1=Mon
  const offset = dow === 0 ? 2 : dow === 1 ? 3 : 1
  d.setDate(d.getDate() - offset)
  return d
}

function toDateOnly(date) {
  return new Date(date.toISOString().split('T')[0] + 'T00:00:00.000Z')
}

async function main() {
  const today = new Date()
  const prevWorkday = getPrevWorkday(today)

  // Seed both today and the previous working day so the table loads with data immediately
  const dates = [today, prevWorkday]

  let upserted = 0
  let skipped = 0

  for (const date of dates) {
    const dateOnly = toDateOnly(date)
    const dateStr = dateOnly.toISOString().split('T')[0]

    for (const [deptKey, dayQ, nightQ, zeroQ] of BASELINE) {
      const shifts = [
        { shift: 'day',   quadro: dayQ   },
        { shift: 'night', quadro: nightQ },
        { shift: 'zero',  quadro: zeroQ  },
      ]

      for (const { shift, quadro } of shifts) {
        if (quadro === 0) {
          skipped++
          continue
        }

        await prisma.dailyAttendance.upsert({
          where: {
            date_departmentKey_shift: { date: dateOnly, departmentKey: deptKey, shift },
          },
          // If record exists: only update quadro (don't wipe absences already entered)
          update: { quadro },
          create: {
            date: dateOnly,
            departmentKey: deptKey,
            shift,
            quadro,
            plannedAbsence: 0,
            unplannedAbsence: 0,
            indeterminateAbsence: 0,
          },
        })

        upserted++
      }
    }

    console.log(`  ✓ ${dateStr} — seeded`)
  }

  console.log(`\nSeed complete: ${upserted} records upserted, ${skipped} zero-quadro rows skipped.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
