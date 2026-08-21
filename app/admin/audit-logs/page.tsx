'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type AuditAction =
  | 'attendance.update'
  | 'user.create'
  | 'user.delete'
  | 'user.password_reset'
  | 'user.change_password'

interface AuditLogEntry {
  id: string
  createdAt: string
  userId: string | null
  username: string
  action: AuditAction
  target: string
  details: Record<string, unknown> | null
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'attendance.update': { label: 'Frequência editada', color: 'bg-blue-100 text-blue-700' },
  'user.create': { label: 'Usuário criado', color: 'bg-green-100 text-green-700' },
  'user.delete': { label: 'Usuário excluído', color: 'bg-red-100 text-red-700' },
  'user.password_reset': { label: 'Senha redefinida (admin)', color: 'bg-amber-100 text-amber-700' },
  'user.change_password': { label: 'Senha alterada (própria)', color: 'bg-gray-100 text-gray-600' },
}

const FIELD_LABELS: Record<string, string> = {
  quadro: 'Quadro',
  plannedAbsence: 'Aus. plan.',
  unplannedAbsence: 'Falta s/a',
  indeterminateAbsence: 'Diversos',
}

function summarizeDetails(log: AuditLogEntry): string {
  const d = log.details as any
  if (!d) return '—'

  if (log.action === 'attendance.update') {
    if (!d.before) {
      const parts = Object.entries(FIELD_LABELS)
        .filter(([k]) => (d.after?.[k] ?? 0) !== 0)
        .map(([k, label]) => `${label}=${d.after[k]}`)
      return parts.length ? `Novo registro — ${parts.join(', ')}` : 'Novo registro'
    }
    const changes = Object.entries(FIELD_LABELS)
      .filter(([k]) => d.before[k] !== d.after[k])
      .map(([k, label]) => `${label} ${d.before[k]}→${d.after[k]}`)
    return changes.length ? changes.join(', ') : 'Sem alteração de valores'
  }

  if (log.action === 'user.create' || log.action === 'user.delete') {
    return `papel: ${d.role === 'admin' ? 'Administrador' : 'Usuário'}`
  }

  return '—'
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  const [actionFilter, setActionFilter] = useState('')
  const [usernameFilter, setUsernameFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchLogs = useCallback(async (opts: { reset: boolean; cursor?: string | null }) => {
    if (opts.reset) setLoading(true)
    else setLoadingMore(true)

    const params = new URLSearchParams({ limit: '50' })
    if (opts.cursor) params.set('cursor', opts.cursor)
    if (actionFilter) params.set('action', actionFilter)
    if (usernameFilter) params.set('username', usernameFilter)

    const res = await fetch(`/api/admin/audit-logs?${params.toString()}`)
    const data = await res.json()

    setLogs(prev => (opts.reset ? data.items : [...prev, ...data.items]))
    setNextCursor(data.nextCursor)
    setLoading(false)
    setLoadingMore(false)
  }, [actionFilter, usernameFilter])

  useEffect(() => { fetchLogs({ reset: true }) }, [fetchLogs])

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })

  return (
    <main className="p-4 md:p-8 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Logs de Auditoria / 監査ログ</h1>
          <p className="text-gray-500 text-sm mt-1">Histórico de todas as alterações feitas no sistema</p>
        </div>
        <Link href="/admin" className="text-sm text-blue-700 hover:text-blue-900 font-medium">
          ← Voltar para Administração
        </Link>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de ação</label>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas</option>
            {Object.entries(ACTION_LABELS).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Usuário</label>
          <input
            type="text"
            value={usernameFilter}
            onChange={e => setUsernameFilter(e.target.value)}
            placeholder="Filtrar por usuário…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* ── Log list ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {loading ? (
          <p className="text-sm text-gray-400">Carregando…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum registro encontrado</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {logs.map(log => {
                const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-100 text-gray-600' }
                const isExpanded = expandedId === log.id
                return (
                  <li key={log.id} className="py-3">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="w-full text-left flex flex-wrap items-center gap-3"
                    >
                      <span className="text-xs text-gray-400 font-mono whitespace-nowrap">{fmtDateTime(log.createdAt)}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-sm font-medium text-gray-800">{log.username}</span>
                      <span className="text-sm text-gray-500">→</span>
                      <span className="text-sm text-gray-700 font-mono">{log.target}</span>
                      <span className="text-xs text-gray-400 ml-auto">{summarizeDetails(log)}</span>
                    </button>
                    {isExpanded && log.details && (
                      <pre className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </li>
                )
              })}
            </ul>

            {nextCursor && (
              <div className="text-center mt-4">
                <button
                  onClick={() => fetchLogs({ reset: false, cursor: nextCursor })}
                  disabled={loadingMore}
                  className="text-sm text-blue-700 hover:text-blue-900 font-medium disabled:opacity-60"
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
