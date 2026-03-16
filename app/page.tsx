'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import AttendanceTable from '@/components/AttendanceTable'
import AttendanceChart from '@/components/AttendanceChart'
import { Shift } from '@/lib/structure'
import {
  DeptShiftData,
  emptyShift,
  buildMixedDeptShiftData,
  getPrevDayStr,
  toLocalDateStr,
  sumShifts,
  calcAttendanceRate,
} from '@/lib/utils'
import { ALL_LEAF_KEYS } from '@/lib/structure'

function todayStr() {
  return toLocalDateStr(new Date())
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [data, setData] = useState<DeptShiftData>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasLocalChanges, setHasLocalChanges] = useState(false)

  const prevDate = getPrevDayStr(selectedDate)
  const today = todayStr()

  const fetchData = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const prevDay = getPrevDayStr(date)

      const [currentRes, prevRes] = await Promise.all([
        fetch(`/api/attendance?date=${date}`),
        fetch(`/api/attendance?date=${prevDay}&shift=night`),
      ])

      if (!currentRes.ok || !prevRes.ok) {
        throw new Error('Erro ao buscar dados')
      }

      const [currentRecords, prevRecords] = await Promise.all([
        currentRes.json(),
        prevRes.json(),
      ])

      // ✅ IMPORTANTE: atualizar estado com dados recebidos
      const builtData = buildMixedDeptShiftData(currentRecords, prevRecords)
      setData(builtData)  // ← ADICIONA ESSA LINHA!

      return builtData
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      return {}
    } finally {
      setLoading(false)
    }
  }, [])
  
  useEffect(() => {
    fetchData(selectedDate).then(d => {
      setData(d)
      setHasLocalChanges(false)
    })
  }, [selectedDate, fetchData])

  const handleCellChange = useCallback(async (
    deptKey: string,
    shift: Shift,
    field: 'quadro' | 'plannedAbsence' | 'unplannedAbsence',
    value: number
  ) => {
    // ✅ Pegar TODOS os valores atuais (não apenas o alterado)
    const current = data[deptKey]?.[shift] ?? emptyShift()

    const allData = {
      quadro: field === 'quadro' ? value : (current.quadro ?? 0),
      plannedAbsence: field === 'plannedAbsence' ? value : (current.plannedAbsence ?? 0),
      unplannedAbsence: field === 'unplannedAbsence' ? value : (current.unplannedAbsence ?? 0),
    }

    // Atualizar estado local (optimistic update)
    setData(prev => {
      return {
        ...prev,
        [deptKey]: {
          ...(prev[deptKey] ?? { day: emptyShift(), night: emptyShift(), zero: emptyShift() }),
          [shift]: {
            ...current,
            ...allData,
          },
        },
      }
    })

    setHasLocalChanges(true)
    setSaving(true)

    try {
      // ✅ Enviar TODOS os campos (não apenas o alterado)
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          departmentKey: deptKey,
          shift,
          quadro: allData.quadro,
          plannedAbsence: allData.plannedAbsence,
          unplannedAbsence: allData.unplannedAbsence,
        }),
      })

      if (!response.ok) {
        throw new Error('Erro ao salvar')
      }

    } catch (error) {
      console.error('Erro ao salvar:', error)
      await fetchData(selectedDate).then(d => setData(d))
    } finally {
      setSaving(false)
    }
  }, [data, selectedDate, fetchData])

  // Chart data
  const chartGroups = [
    { name: 'OUTROS', keys: ['adm', 'rh', 'fin', 'ti', 'sst'] },
    { name: 'PCP', keys: ['log', 'comp', 'com'] },
    { name: 'Eng', keys: ['eng', 'pint_int'] },
    { name: 'Manutenção', keys: ['manut'] },
    { name: 'Qualidade', keys: ['qual'] },
    { name: 'PRENSA', keys: ['prensa', 'cald', 'ferr'] },
    { name: 'Produção', keys: ['mont', 'pint', 'pick'] },
  ]

  const SHIFT_KEYS: Shift[] = ['day', 'night', 'zero']

  const chartData = useMemo(() => {
    return chartGroups.map(g => {
      const agg = sumShifts(g.keys.flatMap(k => SHIFT_KEYS.map(s => data[k]?.[s] ?? emptyShift())))
      return { name: g.name, today: calcAttendanceRate(agg), prev: 0 }
    })
  }, [data])

  const formatDisplayDate = (ds: string) => {
    const d = new Date(ds + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const headerColor = hasLocalChanges ? 'border-2 border-green-500' : ''

  return (
    <main className="p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">出勤率 / Taxa de Frequência</h1>
          <p className="text-gray-500 text-sm mt-1">Registro diário de presença por turno</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <span className="text-sm text-amber-600 flex items-center gap-1">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
              Salvando…
            </span>
          )}

          {hasLocalChanges && !saving && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              ✓ Alterações detectadas
            </span>
          )}

          <label className="text-sm font-medium text-gray-700">Data:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setSelectedDate(todayStr())}
            className="bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-800 transition"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* Date banner */}
      <div className={`bg-blue-900 text-white rounded-xl px-5 py-3 mb-5 flex items-center justify-between ${headerColor}`}>
        <div>
          <span className="text-sm opacity-70">Data / 本日:</span>
          <div className="text-lg font-semibold capitalize">{formatDisplayDate(selectedDate)}</div>
          <div className="text-xs opacity-60 mt-0.5">
            {selectedDate === today ? '📍 Hoje' : '📅 Dia anterior'}
          </div>
        </div>
        <div className="text-right">
          <span className="text-sm opacity-70">Noturno (dia útil anterior) / 夜勤前日:</span>
          <div className="text-sm font-semibold capitalize">{formatDisplayDate(prevDate)}</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin h-8 w-8 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
          Carregando dados…
        </div>
      ) : (
        <>
          <AttendanceTable
            data={data}
            date={selectedDate}
            prevDate={prevDate}
            onCellChange={handleCellChange}
          />

          <div className="mt-8">
            <AttendanceChart
              data={chartData}
              todayLabel={selectedDate === todayStr() ? 'Hoje' : selectedDate}
              prevLabel={prevDate}
            />
          </div>
        </>
      )}

      <div className="mt-4 text-xs text-gray-400 text-center">
        💡 Clique para editar • Noturno = dados do dia útil anterior ({prevDate})
      </div>
    </main>
  )
}