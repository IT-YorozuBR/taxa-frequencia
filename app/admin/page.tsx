'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface AdminUser {
  id: string
  username: string
  role: 'admin' | 'user'
  createdAt: string
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [pwSaving, setPwSaving] = useState(false)

  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    setCreating(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error ?? 'Erro ao criar usuário')
        return
      }
      setUsername('')
      setPassword('')
      setRole('user')
      await fetchUsers()
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, uname: string) => {
    if (!confirm(`Excluir o usuário "${uname}"? Essa ação não pode ser desfeita.`)) return
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? 'Erro ao excluir usuário')
      return
    }
    await fetchUsers()
  }

  const openReset = (id: string) => {
    setResetId(id)
    setResetPassword('')
    setResetError('')
  }

  const cancelReset = () => {
    setResetId(null)
    setResetPassword('')
    setResetError('')
  }

  const handleResetPassword = async (e: React.FormEvent, id: string) => {
    e.preventDefault()
    setResetError('')
    setResetSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResetError(data.error ?? 'Erro ao trocar senha')
        return
      }
      cancelReset()
    } finally {
      setResetSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    setPwSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPwMsg({ text: data.error ?? 'Erro ao trocar senha', ok: false })
        return
      }
      setPwCurrent('')
      setPwNew('')
      setPwMsg({ text: 'Senha alterada com sucesso', ok: true })
    } finally {
      setPwSaving(false)
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <main className="p-4 md:p-8 max-w-[900px] mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Administração / 管理</h1>
          <p className="text-gray-500 text-sm mt-1">Gerenciar contas de acesso ao sistema</p>
        </div>
        <Link href="/admin/logs" className="text-sm text-blue-700 hover:text-blue-900 font-medium">
          Ver logs de auditoria →
        </Link>
      </div>

      {/* ── Create user ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nova conta</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Usuário</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Papel</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as 'admin' | 'user')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-800 transition disabled:opacity-60"
          >
            {creating ? 'Criando…' : 'Criar conta'}
          </button>
        </form>
        {createError && <p className="text-sm text-red-600 mt-2">{createError}</p>}
      </div>

      {/* ── User list ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Contas existentes</h2>
        {loading ? (
          <p className="text-sm text-gray-400">Carregando…</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 font-semibold text-gray-500 border border-gray-200">Usuário</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500 border border-gray-200">Papel</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500 border border-gray-200">Criado em</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-500 border border-gray-200">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <React.Fragment key={u.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">{u.username}</td>
                    <td className="px-3 py-2 border border-gray-200">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.role === 'admin' ? 'Administrador' : 'Usuário'}
                      </span>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 text-gray-500">{fmtDate(u.createdAt)}</td>
                    <td className="px-3 py-2 border border-gray-200 text-center whitespace-nowrap">
                      <button
                        onClick={() => (resetId === u.id ? cancelReset() : openReset(u.id))}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-3"
                      >
                        {resetId === u.id ? 'Cancelar' : 'Trocar senha'}
                      </button>
                      <button
                        onClick={() => handleDelete(u.id, u.username)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                  {resetId === u.id && (
                    <tr className="bg-blue-50">
                      <td colSpan={4} className="px-3 py-3 border border-gray-200">
                        <form onSubmit={e => handleResetPassword(e, u.id)} className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Nova senha para <span className="font-semibold">{u.username}</span>
                            </label>
                            <input
                              type="password"
                              value={resetPassword}
                              onChange={e => setResetPassword(e.target.value)}
                              required
                              minLength={6}
                              autoFocus
                              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={resetSaving}
                            className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-800 transition disabled:opacity-60"
                          >
                            {resetSaving ? 'Salvando…' : 'Salvar nova senha'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelReset}
                            className="text-gray-500 hover:text-gray-700 text-sm font-medium px-2 py-2"
                          >
                            Cancelar
                          </button>
                          {resetError && <p className="text-sm text-red-600 w-full">{resetError}</p>}
                        </form>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Change my own password ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Trocar minha senha</h2>
        <form onSubmit={handleChangePassword} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Senha atual</label>
            <input
              type="password"
              value={pwCurrent}
              onChange={e => setPwCurrent(e.target.value)}
              required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nova senha</label>
            <input
              type="password"
              value={pwNew}
              onChange={e => setPwNew(e.target.value)}
              required
              minLength={6}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={pwSaving}
            className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-800 transition disabled:opacity-60"
          >
            {pwSaving ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
        {pwMsg && (
          <p className={`text-sm mt-2 ${pwMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{pwMsg.text}</p>
        )}
      </div>
    </main>
  )
}
