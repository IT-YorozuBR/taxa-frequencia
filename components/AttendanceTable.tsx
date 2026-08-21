'use client'

import EditableCell from './EditableCell'
import { TABLE_ROWS, SHIFTS, Shift, LeafRow, SubtotalRow } from '@/lib/structure'
import { DeptShiftData, ShiftData, calcAttendanceRate, emptyShift, sumShifts } from '@/lib/utils'

interface AttendanceTableProps {
  data: DeptShiftData
  date: string
  prevDate: string
  onCellChange: (deptKey: string, shift: Shift, field: 'quadro' | 'plannedAbsence' | 'unplannedAbsence' | 'indeterminateAbsence', value: number) => void
}

function getSD(data: DeptShiftData, key: string, shift: Shift): ShiftData {
  return data[key]?.[shift] ?? emptyShift()
}

function aggShift(data: DeptShiftData, keys: string[], shift: Shift): ShiftData {
  return sumShifts(keys.map(k => getSD(data, k, shift)))
}

function pctColor(rate: number): string {
  if (rate >= 0.97) return 'text-green-700 bg-green-50'
  if (rate >= 0.95) return 'text-yellow-700 bg-yellow-50'
  return 'text-red-700 bg-red-50'
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function fmtShort(ds: string): string {
  const [, m, d] = ds.split('-')
  return `${d}/${m}`
}

interface ShiftCellsProps {
  sd: ShiftData
  editable: boolean
  deptKey?: string
  shift?: Shift
  onCellChange?: (d: string, s: Shift, f: 'quadro' | 'plannedAbsence' | 'unplannedAbsence' | 'indeterminateAbsence', v: number) => void
}

function ShiftCells({
  sd,
  editable,
  deptKey,
  shift,
  onCellChange,
}: ShiftCellsProps) {
  const rate = calcAttendanceRate(sd)
  
  return (
    <>
      <td className="border border-gray-300 text-center px-2 py-2 min-w-[60px] text-sm font-medium">
        {editable && deptKey && shift && onCellChange ? (
          <EditableCell
            value={sd.quadro}
            onChange={v => onCellChange(deptKey, shift, 'quadro', v)}
          />
        ) : <span>{sd.quadro || 0}</span>}
      </td>
      <td className="border border-gray-300 text-center px-2 py-2 min-w-[60px] text-sm font-medium">
        {editable && deptKey && shift && onCellChange ? (
          <EditableCell
            value={sd.plannedAbsence}
            onChange={v => onCellChange(deptKey, shift, 'plannedAbsence', v)}
          />
        ) : <span>{sd.plannedAbsence || 0}</span>}
      </td>
      <td className="border border-gray-300 text-center px-2 py-2 min-w-[60px] text-sm font-medium">
        {editable && deptKey && shift && onCellChange ? (
          <EditableCell
            value={sd.unplannedAbsence}
            onChange={v => onCellChange(deptKey, shift, 'unplannedAbsence', v)}
          />
        ) : <span>{sd.unplannedAbsence || 0}</span>}
      </td>
      <td className="border border-gray-300 text-center px-2 py-2 min-w-[60px] text-sm font-medium">
        {editable && deptKey && shift && onCellChange ? (
          <EditableCell
            value={sd.indeterminateAbsence}
            onChange={v => onCellChange(deptKey, shift, 'indeterminateAbsence', v)}
          />
        ) : <span>{sd.indeterminateAbsence || 0}</span>}
      </td>
      <td className={`border border-gray-300 text-center px-2 py-2 min-w-[76px] text-sm font-bold ${pctColor(rate)}`}>
        {fmtPct(rate)}
      </td>
    </>
  )
}

export default function AttendanceTable({ data, date, prevDate, onCellChange }: AttendanceTableProps) {
  return (
    <div className="overflow-auto rounded-xl shadow border border-gray-300 max-h-[88vh]">
      <table className="text-sm border-collapse w-full">
        <thead className="sticky top-0 z-20 shadow-md">
          <tr>
            <th className="border border-gray-300 bg-blue-900 text-white px-3 py-3 text-left text-sm sm:text-base font-semibold tracking-wide" rowSpan={2} colSpan={2}>
              Organograma / 組織
            </th>
            <th className="border border-gray-300 bg-blue-900 text-white text-center px-2 py-3" rowSpan={2}>
              Quadro alocado<br /><span className="font-normal text-[11px] opacity-80">在籍者</span>
            </th>
            {SHIFTS.map(s => {
              const dateLabel = s.isPrevDay ? fmtShort(prevDate) : fmtShort(date)
              const isPrev = s.isPrevDay
              return (
                <th key={s.key} colSpan={5} className={`border border-gray-300 text-white text-center px-2 py-3 font-semibold text-sm ${
                  s.key === 'day' ? 'bg-amber-600' : s.key === 'night' ? 'bg-indigo-700' : 'bg-slate-600'
                }`}>
                  <div>{s.label}</div>
                  <div className="font-normal opacity-80 text-[11px]">{s.labelJp}</div>
                  <div className={`text-[11px] font-bold mt-0.5 ${isPrev ? 'text-indigo-200' : 'text-amber-100'}`}>
                    {dateLabel}{isPrev && ' ◀ anterior'}
                  </div>
                </th>
              )
            })}
          </tr>
          <tr>
            {SHIFTS.map(s => (
              <>
                <th key={`${s.key}-q`} className="border border-gray-300 bg-gray-100 text-center px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Quadro<br />人員</th>
                <th key={`${s.key}-p`} className="border border-gray-300 bg-gray-100 text-center px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Aus. plan.<br />計画</th>
                <th key={`${s.key}-u`} className="border border-gray-300 bg-gray-100 text-center px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Falta s/a<br />突発</th>
                <th key={`${s.key}-i`} className="border border-gray-300 bg-gray-100 text-center px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Diversos. Repor<br />その他</th>
                <th key={`${s.key}-r`} className="border border-gray-300 bg-gray-100 text-center px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Taxa<br />出勤率</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {TABLE_ROWS.map((row, idx) => {
            if (row.type === 'group-header') {
              return (
                <tr key={idx} className="bg-blue-800">
                  <td className="border border-blue-600 px-3 py-2.5 font-bold text-white text-sm sm:text-base tracking-wide" colSpan={2}>{row.name}</td>
                  <td className="border border-blue-600" colSpan={16} />
                </tr>
              )
            }

            if (row.type === 'leaf') {
              const r = row as LeafRow
              const totalQ = sumShifts(SHIFTS.map(s => getSD(data, r.key, s.key))).quadro
              
              return (
                <tr key={idx} className="hover:bg-blue-50 transition-colors">
                  <td className="border border-gray-300 bg-gray-50 w-3 px-0.5" />
                  <td className="border border-gray-300 bg-gray-50 px-3 py-2.5 min-w-[190px]">
                    <div className="font-medium text-gray-800 text-sm">{r.name}</div>
                    <div className="text-[11px] text-gray-400">{r.namePt}</div>
                  </td>
                  <td className="border border-gray-300 text-center px-2 py-2 text-sm font-semibold text-blue-800 bg-blue-50">{totalQ}</td>
                  {SHIFTS.map(s => {
                    const sd = getSD(data, r.key, s.key)
                    return (
                      <ShiftCells 
                        key={s.key} 
                        sd={sd} 
                        editable={true} 
                        deptKey={r.key} 
                        shift={s.key} 
                        onCellChange={onCellChange}
                      />
                    )
                  })}
                </tr>
              )
            }

            if (row.type === 'subtotal') {
              const r = row as SubtotalRow
              const totalQ = r.childKeys.reduce((a, k) => a + sumShifts(SHIFTS.map(s => getSD(data, k, s.key))).quadro, 0)
              return (
                <tr key={idx} className="bg-amber-50">
                  <td className="border border-gray-300 px-3 py-2 font-semibold text-amber-800 italic text-xs sm:text-sm" colSpan={2}>{r.name}</td>
                  <td className="border border-gray-300 text-center px-2 py-2 text-sm font-semibold text-blue-800 bg-blue-50">{totalQ}</td>
                  {SHIFTS.map(s => (
                    <ShiftCells key={s.key} sd={aggShift(data, r.childKeys, s.key)} editable={false} />
                  ))}
                </tr>
              )
            }

            if (row.type === 'total') {
              const totalQ = row.childKeys.reduce((a, k) => a + sumShifts(SHIFTS.map(s => getSD(data, k, s.key))).quadro, 0)
              return (
                <tr key={idx} className="bg-blue-900 text-white font-bold text-sm sm:text-base">
                  <td className="border border-blue-700 px-3 py-3" colSpan={2}>{row.name}</td>
                  <td className="border border-blue-700 text-center px-2 py-3 bg-blue-800">{totalQ}</td>
                  {SHIFTS.map(s => {
                    const agg = aggShift(data, row.childKeys, s.key)
                    const rate = calcAttendanceRate(agg)
                    return (
                      <>
                        <td key={`${s.key}-q`} className="border border-blue-700 text-center px-2 py-3">{agg.quadro || 0}</td>
                        <td key={`${s.key}-p`} className="border border-blue-700 text-center px-2 py-3">{agg.plannedAbsence || 0}</td>
                        <td key={`${s.key}-u`} className="border border-blue-700 text-center px-2 py-3">{agg.unplannedAbsence || 0}</td>
                        <td key={`${s.key}-i`} className="border border-blue-700 text-center px-2 py-3">{agg.indeterminateAbsence || 0}</td>
                        <td key={`${s.key}-r`} className={`border border-blue-700 text-center px-2 py-3 ${rate < 0.95 ? 'text-red-300' : 'text-green-300'}`}>
                          {fmtPct(rate)}
                        </td>
                      </>
                    )
                  })}
                </tr>
              )
            }

            return null
          })}
        </tbody>
      </table>
    </div>
  )
}