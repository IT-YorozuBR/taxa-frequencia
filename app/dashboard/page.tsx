'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { toLocalDateStr } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  date: string
  totalQuadro: number
  totalPlanned: number
  totalUnplanned: number
  totalIndeterminate: number
  attendanceRate: number
  byDept: Record<string, { quadro: number; planned: number; unplanned: number; indeterminate: number }>
  byShift: Record<string, { quadro: number; planned: number; unplanned: number; indeterminate: number }>
}

interface TrendPoint {
  date: string
  attendanceRate: number | null
  totalQuadro: number
  totalPlanned: number
  totalUnplanned: number
  totalIndeterminate: number
}

interface DeptCompPoint {
  department: string
  today: number | null
  yesterday: number | null
}

interface PresenceBar {
  label: string
  rate: number | null
}

interface PresenceChartData {
  date: string
  prevDate: string
  turno1: { today: PresenceBar[]; previous: PresenceBar[] }
  turno2: { today: PresenceBar[]; previous: PresenceBar[] }
  turno3: { today: PresenceBar[]; previous: PresenceBar[] }
}

interface PeriodSummaryRow {
  departmentKey: string
  avgQuadro: number
  totalPlanned: number
  totalUnplanned: number
  totalIndeterminate: number
  attendanceRate: number | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPT_LABELS: Record<string, string> = {
  adm: 'Administrativo', rh: 'RH/DP', fin: 'Financeiro', ti: 'TI', sst: 'SST/MA',
  log: 'Logística', comp: 'Compras', com: 'Comercial',
  eng: 'Engenharia', pint_int: 'Pintura Int.',
  manut: 'Manutenção', qual: 'Qualidade',
  prensa: 'Prensa', cald: 'Caldeiraria', ferr: 'Ferramentaria',
  mont: 'Montagem/Solda', pint: 'Pintura', pick: 'Picking',
}

const SHIFT_LABELS: Record<string, string> = {
  day: 'Primeiro turno', night: 'Segundo turno', zero: 'Terceiro turno',
}

const SHIFT_COLORS: Record<string, string> = {
  day: '#f59e0b', night: '#4f46e5', zero: '#64748b',
}

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

// Colors matching the Excel chart — one per department in GROUPS order
// OUTROS, PCP, ENG, QA, PRENSA, PROD, MANUT, TOTAL
const DEPT_BAR_COLORS: Record<string, string> = {
  OUTROS: '#1e88e5',   // blue
  PCP: '#fdd835',   // yellow
  ENG: '#7cb342',   // green
  QA: '#8e24aa',   // purple
  PRENSA: '#00acc1',   // teal
  PROD: '#fb8c00',   // orange
  MANUT: '#1a237e',   // navy
  TOTAL: '#e53935',   // red
}

// ─── Excel-style Presence Bar Chart ──────────────────────────────────────────

interface SingleShiftChartProps {
  title: string
  subtitle: string
  bars: PresenceBar[]
  dateLabel: string
}

function SingleShiftChart({ title, subtitle, bars, dateLabel }: SingleShiftChartProps) {
  // Find min rate to set a sensible y-axis floor (5pp below lowest, rounded to nearest 5%)
  const rates = bars.map(b => b.rate ?? 1).filter(r => r > 0)
  const minRate = rates.length ? Math.min(...rates) : 0.5
  const yMin = Math.max(0, Math.floor((minRate - 0.05) * 20) / 20) // round down to nearest 5%

  const chartData = bars.map(b => ({
    label: b.label,
    rate: b.rate,
    color: DEPT_BAR_COLORS[b.label] ?? '#94a3b8',
  }))

  return (
    <div className="flex-1 min-w-[380px]">
      {/* Date header */}
      <div className="text-center mb-1">
        <div className="text-xl font-bold text-gray-900 tracking-wide">{dateLabel}</div>
        <div className="text-sm font-bold text-gray-800 underline mt-0.5">{subtitle}</div>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
          barCategoryGap="28%"
        >
          <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fontWeight: 700, fill: '#374151' }}
            tickLine={false}
            axisLine={{ stroke: '#d1d5db' }}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
            domain={[yMin, 1]}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            width={50}
            tickCount={7}
          />
          <Tooltip
            formatter={(v: number, _: string, item: any) =>
              [`${(v * 100).toFixed(1)}%`, item?.payload?.label ?? '']
            }
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          />
          <Bar dataKey="rate" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface PresenceChartPanelProps {
  loading: boolean
  data: PresenceChartData | null
  selectedDate: string
}

function PresenceChartPanel({ loading, data, selectedDate }: PresenceChartPanelProps) {
  const fmtDateBold = (ds: string) =>
    new Date(ds + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
      {loading || !data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 md:overflow-x-auto md:pb-2">
          <SingleShiftChart
            title="1º Turno"
            subtitle="PRESENÇA 1º TURNO"
            bars={data.turno1.today}
            dateLabel={fmtDateBold(selectedDate)}
          />
          {/* Divider */}
          <div className="hidden md:block w-px bg-gray-200 self-stretch" />
          <div className="block md:hidden h-px bg-gray-200 w-full" />
          <SingleShiftChart
            title="2º Turno"
            subtitle="PRESENÇA 2º TURNO"
            bars={data.turno2.previous}
            dateLabel={fmtDateBold(data.prevDate)}
          />
          {/* Divider */}
          <div className="hidden md:block w-px bg-gray-200 self-stretch" />
          <div className="block md:hidden h-px bg-gray-200 w-full" />
          <SingleShiftChart
            title="3º Turno"
            subtitle="PRESENÇA 3º TURNO"
            bars={data.turno3.previous}
            dateLabel={fmtDateBold(data.prevDate)}
          />
        </div>
      )}
    </div>
  )
}

function todayStr() {
  return toLocalDateStr(new Date())
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, labelJp, value, sub, color = 'blue', icon,
}: {
  label: string
  labelJp: string
  value: string
  sub?: string
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
  icon: React.ReactNode
}) {
  const palette = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'bg-blue-600', text: 'text-blue-800' },
    green: { bg: 'bg-green-50', border: 'border-green-200', icon: 'bg-green-600', text: 'text-green-800' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'bg-amber-500', text: 'text-amber-800' },
    red: { bg: 'bg-red-50', border: 'border-red-200', icon: 'bg-red-600', text: 'text-red-800' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'bg-purple-600', text: 'text-purple-800' },
  }[color]

  return (
    <div className={`rounded-xl border ${palette.border} ${palette.bg} p-5 flex items-start gap-4 shadow-sm`}>
      <div className={`${palette.icon} text-white rounded-lg p-2.5 flex-shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{labelJp}</p>
        <p className="text-sm font-medium text-gray-700 leading-tight">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${palette.text}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <svg className="animate-spin h-8 w-8 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" strokeOpacity={0.2} />
        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      </svg>
      Carregando…
    </div>
  )
}

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`
const fmtTick = (v: number) => `${(v * 100).toFixed(0)}%`

// Custom tooltip for trend line chart
function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length || payload[0].value == null) return null
  const d = new Date(label + 'T12:00:00')
  const fmt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' })
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
      <p className="font-semibold text-gray-700 mb-1">{fmt}</p>
      <p className="text-blue-700 font-bold">{fmtPct(payload[0].value)}</p>
    </div>
  )
}

// Custom tooltip for department comparison chart
function CompTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 shadow-md text-xs min-w-[140px]">
      <p className="font-bold text-gray-800 mb-2 border-b border-gray-100 pb-1">{label}</p>
      {payload.map(p => (
        p.value != null && (
          <div key={p.name} className="flex items-center justify-between gap-3 mt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
              <span className="text-gray-500">{p.name}</span>
            </div>
            <span className="font-semibold" style={{ color: p.color }}>{fmtPct(p.value)}</span>
          </div>
        )
      ))}
    </div>
  )
}

// ─── Reusable ComparisonChart ─────────────────────────────────────────────────

interface ComparisonChartProps {
  title: string
  badge?: string          // e.g. "1º Turno" shown as a pill next to the title
  loading: boolean
  comp: { data: DeptCompPoint[]; prevDate: string } | null
  selectedDate: string
}

function ComparisonChart({ title, badge, loading, comp, selectedDate }: ComparisonChartProps) {
  const noData = !comp || comp.data.every(d => d.today == null && d.yesterday == null)

  const fmtDate = (ds: string) =>
    new Date(ds + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <SectionCard title="">
      {/* Custom header with optional badge */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {badge && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
            {badge}
          </span>
        )}
      </div>

      {loading ? <Spinner /> : noData ? (
        <p className="text-center text-gray-400 text-sm py-8">Nenhum dado registrado para esta data</p>
      ) : (
        <>
          {/* Legend / date labels */}
          <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded bg-blue-600" />
              <span className="text-gray-600 font-medium">Hoje — {fmtDate(selectedDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded bg-slate-400" />
              <span className="text-gray-600 font-medium">
                Anterior — {comp!.prevDate ? fmtDate(comp!.prevDate) : '—'}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs text-red-500">
              <div className="w-8 border-t-2 border-dashed border-red-400" />
              Meta 95%
            </div>
          </div>

          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={310}>
            <BarChart
              data={comp!.data}
              margin={{ top: 18, right: 16, left: 0, bottom: 4 }}
              barCategoryGap="28%"
              barGap={3}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis
                dataKey="department"
                tick={{ fontSize: 12, fontWeight: 600, fill: '#374151' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                tickFormatter={fmtTick}
                domain={[0, 1]}
                ticks={[0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 1.0]}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip content={<CompTooltip />} cursor={{ fill: '#f8fafc' }} />
              <ReferenceLine y={0.95} stroke="#ef4444" strokeDasharray="5 3" strokeWidth={1.5} />

              {/* Yesterday bar */}
              <Bar
                dataKey="yesterday"
                name="Dia Anterior"
                fill="#94a3b8"
                radius={[3, 3, 0, 0]}
                maxBarSize={52}
                label={{
                  position: 'top',
                  formatter: (v: number) => v != null ? `${(v * 100).toFixed(1)}%` : '',
                  fontSize: 9,
                  fill: '#94a3b8',
                }}
              />

              {/* Today bar — color-coded by performance */}
              <Bar
                dataKey="today"
                name="Hoje"
                radius={[3, 3, 0, 0]}
                maxBarSize={52}
                label={{
                  position: 'top',
                  formatter: (v: number) => v != null ? `${(v * 100).toFixed(1)}%` : '',
                  fontSize: 9,
                  fill: '#1d4ed8',
                }}
              >
                {comp!.data.map((entry, index) => {
                  const val = entry.today
                  const color = val == null ? '#e2e8f0'
                    : val >= 0.97 ? '#1d4ed8'
                      : val >= 0.95 ? '#2563eb'
                        : val >= 0.90 ? '#f59e0b'
                          : '#ef4444'
                  return <Cell key={`cell-${index}`} fill={color} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Summary table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border border-gray-200 min-w-[90px]">Grupo</th>
                  <th className="text-center px-3 py-1.5 font-semibold text-blue-700 border border-gray-200">Hoje</th>
                  <th className="text-center px-3 py-1.5 font-semibold text-slate-500 border border-gray-200">Anterior</th>
                  <th className="text-center px-3 py-1.5 font-semibold text-gray-500 border border-gray-200">Δ</th>
                </tr>
              </thead>
              <tbody>
                {comp!.data.map((row) => {
                  const diff = row.today != null && row.yesterday != null
                    ? row.today - row.yesterday : null
                  const diffTxt = diff == null ? '—'
                    : diff > 0 ? `+${(diff * 100).toFixed(1)}pp`
                      : diff < 0 ? `${(diff * 100).toFixed(1)}pp`
                        : '0.0pp'
                  return (
                    <tr key={row.department} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-semibold text-gray-700 border border-gray-200">{row.department}</td>
                      <td className={`px-3 py-1.5 text-center font-semibold border border-gray-200 ${row.today == null ? 'text-gray-300'
                        : row.today >= 0.95 ? 'text-blue-700' : 'text-red-600'
                        }`}>
                        {row.today != null ? fmtPct(row.today) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-center text-slate-500 border border-gray-200">
                        {row.yesterday != null ? fmtPct(row.yesterday) : '—'}
                      </td>
                      <td className={`px-3 py-1.5 text-center font-medium border border-gray-200 ${diff == null ? 'text-gray-300'
                        : diff > 0 ? 'text-green-600'
                          : diff < 0 ? 'text-red-500' : 'text-gray-400'
                        }`}>
                        {diffTxt}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [deptComp, setDeptComp] = useState<{ data: DeptCompPoint[]; prevDate: string } | null>(null)
  const [deptCompDay, setDeptCompDay] = useState<{ data: DeptCompPoint[]; prevDate: string } | null>(null)
  const [presenceChart, setPresenceChart] = useState<PresenceChartData | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingTrend, setLoadingTrend] = useState(true)
  const [loadingDeptComp, setLoadingDeptComp] = useState(true)
  const [loadingDeptCompDay, setLoadingDeptCompDay] = useState(true)
  const [loadingPresence, setLoadingPresence] = useState(true)

  // ── Resumo por setor num período (data inicial/final escolhidos à parte) ──
  const [periodEnd, setPeriodEnd] = useState(todayStr())
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return toLocalDateStr(d)
  })
  const [periodSummary, setPeriodSummary] = useState<PeriodSummaryRow[]>([])
  const [loadingPeriod, setLoadingPeriod] = useState(true)

  const fetchPeriodSummary = useCallback(async (start: string, end: string) => {
    setLoadingPeriod(true)
    const res = await fetch(`/api/dashboard/period-summary?startDate=${start}&endDate=${end}`)
    const d = await res.json()
    setPeriodSummary(d.data ?? [])
    setLoadingPeriod(false)
  }, [])

  useEffect(() => {
    if (periodStart > periodEnd) return
    fetchPeriodSummary(periodStart, periodEnd)
  }, [periodStart, periodEnd, fetchPeriodSummary])

  const fetchSummary = useCallback(async (date: string) => {
    setLoadingSummary(true)
    const res = await fetch(`/api/dashboard/summary?date=${date}`)
    const d = await res.json()
    setSummary(d)
    setLoadingSummary(false)
  }, [])

  const fetchTrend = useCallback(async (date: string) => {
    setLoadingTrend(true)
    const res = await fetch(`/api/dashboard/trend?endDate=${date}&days=30`)
    const d = await res.json()
    setTrend(d)
    setLoadingTrend(false)
  }, [])

  const fetchDeptComp = useCallback(async (date: string) => {
    setLoadingDeptComp(true)
    const res = await fetch(`/api/dashboard/department-comparison?date=${date}`)
    const d = await res.json()
    setDeptComp(d)
    setLoadingDeptComp(false)
  }, [])

  const fetchDeptCompDay = useCallback(async (date: string) => {
    setLoadingDeptCompDay(true)
    const res = await fetch(`/api/dashboard/department-comparison?date=${date}&shift=day`)
    const d = await res.json()
    setDeptCompDay(d)
    setLoadingDeptCompDay(false)
  }, [])

  const fetchPresenceChart = useCallback(async (date: string) => {
    setLoadingPresence(true)
    const res = await fetch(`/api/dashboard/presence-chart?date=${date}`)
    const d = await res.json()
    setPresenceChart(d)
    setLoadingPresence(false)
  }, [])

  useEffect(() => {
    fetchSummary(selectedDate)
    fetchTrend(selectedDate)
    fetchDeptComp(selectedDate)
    fetchDeptCompDay(selectedDate)
    fetchPresenceChart(selectedDate)
  }, [selectedDate, fetchSummary, fetchTrend, fetchDeptComp, fetchDeptCompDay, fetchPresenceChart])

  // ── Derived data ──────────────────────────────────────────────────────────

  const rateColor = !summary ? 'blue'
    : summary.attendanceRate >= 0.97 ? 'green'
      : summary.attendanceRate >= 0.95 ? 'amber'
        : 'red'

  // Absence pie data
  const present = summary
    ? summary.totalQuadro - summary.totalPlanned - summary.totalUnplanned - summary.totalIndeterminate
    : 0
  const absencePieData = summary ? [
    { name: 'Presentes', value: Math.max(0, present) },
    { name: 'Aus. Planejada', value: summary.totalPlanned },
    { name: 'Falta s/ Aviso', value: summary.totalUnplanned },
    { name: 'Diversos', value: summary.totalIndeterminate },
  ] : []

  // Dept bar chart — rate per dept
  const deptBarData = summary
    ? Object.entries(summary.byDept)
      .map(([key, d]) => ({
        name: DEPT_LABELS[key] ?? key,
        rate: d.quadro > 0 ? (d.quadro - d.planned - d.unplanned - d.indeterminate) / d.quadro : 0,
        absences: d.planned + d.unplanned + d.indeterminate,
      }))
      .filter(d => d.absences > 0 || d.rate > 0)
      .sort((a, b) => a.rate - b.rate)  // worst first
    : []

  // Shift bar chart
  const shiftBarData = summary
    ? Object.entries(summary.byShift).map(([shift, d]) => ({
      name: SHIFT_LABELS[shift] ?? shift,
      shift,
      quadro: d.quadro,
      planned: d.planned,
      unplanned: d.unplanned,
      indeterminate: d.indeterminate,
      rate: d.quadro > 0 ? (d.quadro - d.planned - d.unplanned - d.indeterminate) / d.quadro : 0,
    }))
    : []

  const sortedShiftBarData = [...shiftBarData].sort((a, b) => {
    const order: Record<string, number> = { day: 1, night: 2, zero: 3 }
    return (order[a.shift] ?? 99) - (order[b.shift] ?? 99)
  })

  const TrendTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null

    return (
      <div className="bg-white p-2 border rounded shadow">
        <p>{label}</p> {/* usa direto */}
        <p>{(payload[0].value * 100).toFixed(1)}%</p>
      </div>
    )
  }
  // Trend data — format dates for display
  const trendDisplay = trend.map(t => ({
    ...t,
    label: new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  }))

  const formatDisplayDate = (ds: string) => {
    const d = new Date(ds + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const isToday = selectedDate === todayStr()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="p-4 md:p-8 max-w-[1400px] mx-auto">

      {/* ── Page header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Dashboard / ダッシュボード</h1>
          <p className="text-gray-500 text-sm mt-1 capitalize">{formatDisplayDate(selectedDate)}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Data:</label>
          <input
            type="date"
            value={selectedDate}
            max={todayStr()}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayStr())}
              className="bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-800 transition"
            >
              Hoje
            </button>
          )}
        </div>
      </div>

      {/* ── Excel-style Presence Chart (top of page) ── */}
      <PresenceChartPanel
        loading={loadingPresence}
        data={presenceChart}
        selectedDate={selectedDate}
      />

      {/* ── KPI Cards ── */}
      {loadingSummary ? <Spinner /> : summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* <MetricCard
            label="Quadro Total" labelJp="総人員"
            value={summary.totalQuadro.toString()}
            sub="funcionários alocados"
            color="blue"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          /> */}
          <MetricCard
            label="Ausência Planejada" labelJp="計画欠勤"
            value={summary.totalPlanned.toString()}
            sub="férias, folgas, etc."
            color="amber"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
          />
          <MetricCard
            label="Falta sem Aviso" labelJp="突発欠勤"
            value={summary.totalUnplanned.toString()}
            sub="ausências não previstas"
            color="red"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          />
          <MetricCard
            label="Diversos" labelJp="その他"
            value={summary.totalIndeterminate.toString()}
            sub="afastamento, INSS, a repor"
            color="purple"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <MetricCard
            label="Taxa de Presença" labelJp="出勤率"
            value={fmtPct(summary.attendanceRate)}
            sub={summary.attendanceRate >= 0.95 ? '✓ Acima da meta (95%)' : '✗ Abaixo da meta (95%)'}
            color={rateColor}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>
      )}

      {/* ── Department Comparison: All shifts ── */}
      <div className="mb-6">
        <ComparisonChart
          title="Comparativo de Presença — Todos os Turnos  |  出勤率比較（全シフト）"
          loading={loadingDeptComp}
          comp={deptComp}
          selectedDate={selectedDate}
        />
      </div>

      {/* ── Department Comparison: 1º Turno (Diurno) only ── */}
      {/* <div className="mb-6">
        <ComparisonChart
          title="Comparativo de Presença — 1º Turno  |  出勤率比較"
          badge="1º Turno / 昼勤"
          loading={loadingDeptCompDay}
          comp={deptCompDay}
          selectedDate={selectedDate}
        />
      </div> */}

      {/* ── Charts row 1: Trend + Absence pie ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

        {/* Trend line — 2/3 width */}
        <div className="xl:col-span-2">
          <SectionCard title={`Taxa de Presença — Últimos 30 dias  |  出勤率推移`}>
            {loadingTrend ? <Spinner /> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendDisplay} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval={4}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtTick}
                    domain={[0.8, 1]}
                    ticks={[0.8, 0.85, 0.9, 0.95, 1.0]}
                    tick={{ fontSize: 10 }}
                    width={42}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <ReferenceLine
                    y={0.95}
                    stroke="#ef4444"
                    strokeDasharray="5 3"
                    label={{ value: 'Meta 95%', position: 'right', fontSize: 10, fill: '#ef4444' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="attendanceRate"
                    stroke="#1d4ed8"
                    strokeWidth={2}
                    dot={(props) => {
                      const { cx, cy, payload } = props
                      if (payload.attendanceRate == null) return <g key={props.key} />
                      const fill = payload.attendanceRate >= 0.95 ? '#22c55e' : '#ef4444'
                      return <circle key={props.key} cx={cx} cy={cy} r={3} fill={fill} stroke="white" strokeWidth={1.5} />
                    }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Pontos verdes ≥ 95% · Pontos vermelhos &lt; 95% · Dias sem dados ficam em branco
            </p>
          </SectionCard>
        </div>

        {/* Absence breakdown pie — 1/3 width */}
        <SectionCard title={`Composição do Dia  |  内訳`}>
          {loadingSummary ? <Spinner /> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={absencePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => value > 0 ? `${value}` : ''}
                    labelLine={false}
                  >
                    {absencePieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => v} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {absencePieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ── Charts row 2: Dept rates + Shift breakdown ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

        {/* Department attendance rate bar chart */}
        <SectionCard title={`Taxa por Departamento  |  部門別出勤率`}>
          {loadingSummary ? <Spinner /> : deptBarData.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Nenhum dado registrado para esta data</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={deptBarData}
                layout="vertical"
                margin={{ top: 0, right: 60, left: 100, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={fmtTick}
                  tick={{ fontSize: 10 }}
                  ticks={[0, 0.5, 0.75, 0.9, 0.95, 1.0]}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={95} tickLine={false} />
                <Tooltip formatter={(v: number) => fmtPct(v)} />
                <ReferenceLine x={0.95} stroke="#ef4444" strokeDasharray="4 3" />
                <Bar dataKey="rate" name="Taxa de presença" radius={[0, 4, 4, 0]}>
                  {deptBarData.map((d, i) => (
                    <Cell key={i} fill={d.rate >= 0.95 ? '#22c55e' : d.rate >= 0.9 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* Shift breakdown */}
        <SectionCard title={`Ausências por Turno  |  シフト別欠勤`}>
          {loadingSummary ? <Spinner /> : shiftBarData.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Nenhum dado registrado para esta data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sortedShiftBarData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="planned" name="Aus. Planejada" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="unplanned" name="Falta s/ Aviso" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="indeterminate" name="Diversos" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {/* Shift rate summary */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                {sortedShiftBarData.map(s => (
                  <div key={s.shift} className="rounded-lg p-3 text-center" style={{ background: SHIFT_COLORS[s.shift] + '18', border: `1px solid ${SHIFT_COLORS[s.shift]}44` }}>
                    <div className="text-xs text-gray-500">{s.name}</div>
                    <div className="text-lg font-bold mt-0.5" style={{ color: SHIFT_COLORS[s.shift] }}>
                      {fmtPct(s.rate)}
                    </div>
                    <div className="text-[10px] text-gray-400">{s.quadro} funcionários</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>

      </div>

      {/* ── Resumo por Setor num Período ── */}
      <SectionCard title={`Resumo por Setor — Período  |  期間別部門集計`}>
        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
          <label className="text-gray-700 font-medium">De:</label>
          <input
            type="date"
            value={periodStart}
            max={periodEnd}
            onChange={e => setPeriodStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="text-gray-700 font-medium">Até:</label>
          <input
            type="date"
            value={periodEnd}
            min={periodStart}
            max={todayStr()}
            onChange={e => setPeriodEnd(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {loadingPeriod ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border border-gray-200 min-w-[160px]">Setor</th>
                  <th className="text-center px-3 py-1.5 font-semibold text-gray-500 border border-gray-200">Quadro médio</th>
                  <th className="text-center px-3 py-1.5 font-semibold text-amber-700 border border-gray-200">Aus. Planejada</th>
                  <th className="text-center px-3 py-1.5 font-semibold text-red-600 border border-gray-200">Falta s/ Aviso</th>
                  <th className="text-center px-3 py-1.5 font-semibold text-purple-700 border border-gray-200">Diversos</th>
                  <th className="text-center px-3 py-1.5 font-semibold text-blue-700 border border-gray-200">Taxa de Presença</th>
                </tr>
              </thead>
              <tbody>
                {[...periodSummary]
                  .sort((a, b) => (a.attendanceRate ?? 1) - (b.attendanceRate ?? 1)) // pior primeiro
                  .map(row => (
                    <tr key={row.departmentKey} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-semibold text-gray-700 border border-gray-200">
                        {DEPT_LABELS[row.departmentKey] ?? row.departmentKey}
                      </td>
                      <td className="px-3 py-1.5 text-center text-gray-700 border border-gray-200">
                        {row.avgQuadro.toFixed(1)}
                      </td>
                      <td className="px-3 py-1.5 text-center text-amber-700 border border-gray-200">
                        {row.totalPlanned}
                      </td>
                      <td className="px-3 py-1.5 text-center text-red-600 border border-gray-200">
                        {row.totalUnplanned}
                      </td>
                      <td className="px-3 py-1.5 text-center text-purple-700 border border-gray-200">
                        {row.totalIndeterminate}
                      </td>
                      <td className={`px-3 py-1.5 text-center font-semibold border border-gray-200 ${
                        row.attendanceRate == null ? 'text-gray-300'
                          : row.attendanceRate >= 0.95 ? 'text-blue-700' : 'text-red-600'
                      }`}>
                        {row.attendanceRate != null ? fmtPct(row.attendanceRate) : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">
          Quadro médio = média diária no período · Faltas = total acumulado no período ·
          Taxa = presença agregada do período inteiro
        </p>
      </SectionCard>

      {/* ── Footer note ── */}
      <p className="text-xs text-gray-400 text-center pb-4">
        Dados extraídos do banco em tempo real · Meta de presença: ≥ 95%
      </p>
    </main>
  )
}
