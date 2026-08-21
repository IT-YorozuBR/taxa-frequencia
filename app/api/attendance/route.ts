import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPrevWorkingDayStr, getTodayStr } from '@/lib/utils'
import { findLastDayWithData, ensureCarryForwardToToday } from '@/lib/carryForward'
import { logAudit } from '@/lib/audit'
import { deptLabel, shiftLabel } from '@/lib/labels'
import { validateAttendancePayload } from '@/lib/validation'

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date')
    if (!date) {
      return NextResponse.json({ error: 'date required' }, { status: 400 })
    }

    const shiftFilter = req.nextUrl.searchParams.get('shift')
    const today = getTodayStr()

    // Materialize the carry-forward chain up to today before reading. This runs
    // on every fetch the page makes (current day AND previous-day night fetch),
    // so the night column is never blank regardless of request ordering.
    await ensureCarryForwardToToday()

    const where: Record<string, unknown> = { date: new Date(date + 'T00:00:00.000Z') }
    if (shiftFilter) where.shift = shiftFilter

    let records = await prisma.dailyAttendance.findMany({ where })

    // Future dates: never persist, just preview the last known day virtually.
    if (records.length === 0 && date > today) {
      const source = await findLastDayWithData(getPrevWorkingDayStr(date))
      if (source) {
        const virtual = shiftFilter
          ? source.recs.filter(r => r.shift === shiftFilter)
          : source.recs
        return NextResponse.json(virtual)
      }
    }

    return NextResponse.json(records)
  } catch (error) {
    console.error('[GET /api/attendance]', error)
    return NextResponse.json(
      { error: 'Erro ao buscar dados' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const validation = validateAttendancePayload(body)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { date, departmentKey, shift, quadro, plannedAbsence, unplannedAbsence, indeterminateAbsence } = validation.value

    console.log('🔵 [POST] Recebido:', { date, departmentKey, shift, quadro, plannedAbsence, unplannedAbsence, indeterminateAbsence })

    const actorId = req.headers.get('x-user-id')
    const actorUsername = req.headers.get('x-user-username') ?? 'desconhecido'

    const today = getTodayStr()
    const requestDate = new Date(date + 'T00:00:00Z')
    const todayDate = new Date(today + 'T00:00:00Z')
    const daysDiff = Math.floor((todayDate.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysDiff > 30) {
      return NextResponse.json(
        { error: 'Não é permitido editar dados de mais de 30 dias atrás' },
        { status: 403 }
      )
    }

    const storeDate = (shift === 'night' || shift === 'zero') ? getPrevWorkingDayStr(date) : date
    const storeDateObj = new Date(storeDate + 'T00:00:00.000Z')

    console.log('🔵 [POST] storeDate:', storeDate, 'storeDateObj:', storeDateObj)

    // ✅ Verificar se já existe registro do dia
    const existing = await prisma.dailyAttendance.findUnique({
      where: {
        date_departmentKey_shift: {
          date: storeDateObj,
          departmentKey,
          shift,
        },
      },
    })

    console.log('🔵 [POST] Registro existe?', !!existing)

    if (existing) {
      // Se já existe, apenas atualizar com TODOS os campos enviados
      console.log('🔵 [POST] ATUALIZANDO registro existente')
      const record = await prisma.dailyAttendance.update({
        where: {
          date_departmentKey_shift: {
            date: storeDateObj,
            departmentKey,
            shift,
          },
        },
        data: {
          quadro: quadro ?? 0,
          plannedAbsence: plannedAbsence ?? 0,
          unplannedAbsence: unplannedAbsence ?? 0,
          indeterminateAbsence: indeterminateAbsence ?? 0,
        },
      })

      console.log('🔵 [POST] Registro atualizado:', record)

      await logAudit({
        userId: actorId,
        username: actorUsername,
        action: 'attendance.update',
        target: `${deptLabel(departmentKey)} — ${shiftLabel(shift)} (${storeDate})`,
        details: {
          departmentKey,
          shift,
          date: storeDate,
          before: {
            quadro: existing.quadro,
            plannedAbsence: existing.plannedAbsence,
            unplannedAbsence: existing.unplannedAbsence,
            indeterminateAbsence: existing.indeterminateAbsence,
          },
          after: {
            quadro: record.quadro,
            plannedAbsence: record.plannedAbsence,
            unplannedAbsence: record.unplannedAbsence,
            indeterminateAbsence: record.indeterminateAbsence,
          },
        },
      })

      return NextResponse.json(record, { status: 201 })
    }

    // ✅ NÃO EXISTE = primeira edição
    // Buscar TODOS os registros anteriores (TODOS os shifts, não apenas este)
    console.log('🔵 [POST] NÃO EXISTE! Vai buscar TODOS os anteriores')
    
    // ⭐ IMPORTANTE: Buscar SEM filtro de shift para pegar TODOS
    let allPrevRecords: any[] = []
    let searchDate = getPrevWorkingDayStr(date)
    
    for (let i = 0; i < 30; i++) {
      const searchDateObj = new Date(searchDate + 'T00:00:00.000Z')
      
      const records = await prisma.dailyAttendance.findMany({
        where: { date: searchDateObj }
      })
      
      if (records.length > 0) {
        allPrevRecords = records
        console.log('🔵 [POST] Encontrou', allPrevRecords.length, 'registros anteriores')
        break
      }
      
      if (searchDate === today) break
      searchDate = getPrevWorkingDayStr(searchDate)
    }

    // Criar TODOS os registros encontrados no banco
    if (allPrevRecords.length > 0) {
      try {
        const createResult = await prisma.dailyAttendance.createMany({
          data: allPrevRecords.map(r => ({
            date: storeDateObj,
            departmentKey: r.departmentKey,
            shift: r.shift,
            quadro: r.quadro,
            plannedAbsence: r.plannedAbsence,
            unplannedAbsence: r.unplannedAbsence,
            indeterminateAbsence: r.indeterminateAbsence,
          })),
          skipDuplicates: true
        })
        
        console.log('🔵 [POST] CreateMany executado! Registros criados:', createResult.count)
      } catch (error) {
        console.error('🔵 [POST] Erro no createMany:', error)
      }
    }

    // Agora salvar o registro que foi editado. Usa upsert (não update) porque
    // o passo de cópia acima só recria os setores/turnos que já existiam em
    // algum dia anterior — se este (setor, turno) nunca existiu em nenhum dia
    // (ex.: primeira vez preenchendo um turno novo para aquele setor), a linha
    // ainda não existe aqui, e um update puro falharia com P2025.
    console.log('🔵 [POST] Agora vai SALVAR o registro que foi editado')

    // Captura o estado logo antes do upsert final: pode já existir (o
    // backfill acima acabou de recriá-lo com valores copiados do dia
    // anterior) ou ser null (setor/turno inédito) — para o log de
    // auditoria refletir o "antes" real.
    const beforeUpsert = await prisma.dailyAttendance.findUnique({
      where: {
        date_departmentKey_shift: {
          date: storeDateObj,
          departmentKey,
          shift,
        },
      },
    })

    const record = await prisma.dailyAttendance.upsert({
      where: {
        date_departmentKey_shift: {
          date: storeDateObj,
          departmentKey,
          shift,
        },
      },
      create: {
        date: storeDateObj,
        departmentKey,
        shift,
        quadro: quadro ?? 0,
        plannedAbsence: plannedAbsence ?? 0,
        unplannedAbsence: unplannedAbsence ?? 0,
        indeterminateAbsence: indeterminateAbsence ?? 0,
      },
      update: {
        quadro: quadro ?? 0,
        plannedAbsence: plannedAbsence ?? 0,
        unplannedAbsence: unplannedAbsence ?? 0,
        indeterminateAbsence: indeterminateAbsence ?? 0,
      },
    })

    console.log('🔵 [POST] Registro final:', record)

    await logAudit({
      userId: actorId,
      username: actorUsername,
      action: 'attendance.update',
      target: `${deptLabel(departmentKey)} — ${shiftLabel(shift)} (${storeDate})`,
      details: {
        departmentKey,
        shift,
        date: storeDate,
        before: beforeUpsert ? {
          quadro: beforeUpsert.quadro,
          plannedAbsence: beforeUpsert.plannedAbsence,
          unplannedAbsence: beforeUpsert.unplannedAbsence,
          indeterminateAbsence: beforeUpsert.indeterminateAbsence,
        } : null,
        after: {
          quadro: record.quadro,
          plannedAbsence: record.plannedAbsence,
          unplannedAbsence: record.unplannedAbsence,
          indeterminateAbsence: record.indeterminateAbsence,
        },
      },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'JSON inválido' },
        { status: 400 }
      )
    }
    
    console.error('[POST /api/attendance] ERROR:', error)
    return NextResponse.json(
      { error: 'Erro ao salvar dados' },
      { status: 500 }
    )
  }
}