import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getPrevWorkingDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dow = d.getUTCDay()
  const offset = dow === 0 ? 2 : dow === 1 ? 3 : 1
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().split('T')[0]
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

async function getPrevRecordsWithData(
  date: string,
  shiftFilter?: string
): Promise<any[]> {
  const today = getTodayStr()
  
  if (date < today) {
    return []
  }

  let searchDate = getPrevWorkingDayStr(date)
  
  for (let i = 0; i < 30; i++) {
    const searchDateObj = new Date(searchDate + 'T00:00:00.000Z')
    const whereSearch: Record<string, unknown> = {
      date: searchDateObj,
    }
    if (shiftFilter) whereSearch.shift = shiftFilter

    const records = await prisma.dailyAttendance.findMany({ 
      where: whereSearch 
    })
    
    if (records.length > 0) {
      return records
    }
    
    if (searchDate === today) break
    searchDate = getPrevWorkingDayStr(searchDate)
  }

  return []
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date')
    if (!date) {
      return NextResponse.json({ error: 'date required' }, { status: 400 })
    }

    const shiftFilter = req.nextUrl.searchParams.get('shift')
    const dateObj = new Date(date + 'T00:00:00.000Z')
    const today = getTodayStr()

    const where: Record<string, unknown> = { date: dateObj }
    if (shiftFilter) where.shift = shiftFilter

    // 1️⃣ Procurar dados do dia solicitado
    let records = await prisma.dailyAttendance.findMany({ where })

    // 2️⃣ Se não achou E é hoje ou depois, buscar anterior
    if (records.length === 0 && date >= today) {
      let searchDate = getPrevWorkingDayStr(date)
      
      // Continua buscando para trás até encontrar dados (máximo 30 dias)
      for (let i = 0; i < 30; i++) {
        const searchDateObj = new Date(searchDate + 'T00:00:00.000Z')
        const whereSearch: Record<string, unknown> = { date: searchDateObj }
        if (shiftFilter) whereSearch.shift = shiftFilter

        const prevRecords = await prisma.dailyAttendance.findMany({ 
          where: whereSearch 
        })
        
        if (prevRecords.length > 0) {
          // ✅ Encontrou dados anteriores!
          
          // 🎯 NOVO: Apenas createMany se for TODAY
          if (date === today) {
            try {
              await prisma.dailyAttendance.createMany({
                data: prevRecords.map(r => ({
                  date: dateObj,
                  departmentKey: r.departmentKey,
                  shift: r.shift,
                  quadro: r.quadro,
                  plannedAbsence: r.plannedAbsence,
                  unplannedAbsence: r.unplannedAbsence,
                })),
                skipDuplicates: true
              })
            } catch (error) {
              console.log('Dados já existem para hoje')
            }

            // Buscar dados que acabamos de criar
            records = await prisma.dailyAttendance.findMany({ where })
          } else {
            // Se é DEPOIS de hoje, retorna virtual (não cria no banco)
            return NextResponse.json(prevRecords)
          }

          break
        }
        
        if (searchDate === today) break
        searchDate = getPrevWorkingDayStr(searchDate)
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
    const { date, departmentKey, shift, quadro, plannedAbsence, unplannedAbsence } = body

    console.log('🔵 [POST] Recebido:', { date, departmentKey, shift, quadro, plannedAbsence, unplannedAbsence })

    if (!date || !departmentKey || !shift) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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

    const storeDate = shift === 'night' ? getPrevWorkingDayStr(date) : date
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
        },
      })

      console.log('🔵 [POST] Registro atualizado:', record)
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
          })),
          skipDuplicates: true
        })
        
        console.log('🔵 [POST] CreateMany executado! Registros criados:', createResult.count)
      } catch (error) {
        console.error('🔵 [POST] Erro no createMany:', error)
      }
    }

    // Agora atualizar o registro que foi editado
    console.log('🔵 [POST] Agora vai ATUALIZAR o registro que foi editado')
    
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
      },
    })

    console.log('🔵 [POST] Registro final:', record)

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