'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface ChartDataPoint {
  name: string
  today: number
  prev: number
}

interface AttendanceChartProps {
  data: ChartDataPoint[]
  todayLabel: string
  prevLabel: string
}

const formatPct = (val: number) => `${(val * 100).toFixed(1)}%`

export default function AttendanceChart({ data, todayLabel, prevLabel }: AttendanceChartProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        Taxa de Presença por Departamento — 出勤率比較
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Comparativo: {prevLabel} → {todayLabel}
      </p>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={formatPct}
            domain={[0, 1]}
            ticks={[0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 1.0]}
            tick={{ fontSize: 11 }}
            width={55}
          />
          <Tooltip formatter={(v: number) => formatPct(v)} />
          <Legend verticalAlign="top" />
          <ReferenceLine y={0.95} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '95%', position: 'right', fontSize: 11, fill: '#ef4444' }} />
          <Bar dataKey="prev" name={prevLabel} fill="#93c5fd" radius={[3, 3, 0, 0]} />
          <Bar dataKey="today" name={todayLabel} fill="#1d4ed8" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
