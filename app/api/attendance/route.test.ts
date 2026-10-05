import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyAttendance: {
      count: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { GET, POST } from './route'

const db = prisma.dailyAttendance as unknown as Record<
  'count' | 'findMany' | 'createMany' | 'findUnique' | 'update' | 'upsert',
  ReturnType<typeof vi.fn>
>

// "Hoje" fixo: segunda-feira 2026-10-05, meio-dia em Brasília.
const NOW = new Date('2026-10-05T15:00:00Z')

type Row = {
  departmentKey: string
  shift: string
  quadro: number
  plannedAbsence: number
  unplannedAbsence: number
  indeterminateAbsence: number
}
const row = (departmentKey: string, shift: string, quadro = 10): Row => ({
  departmentKey,
  shift,
  quadro,
  plannedAbsence: 0,
  unplannedAbsence: 0,
  indeterminateAbsence: 0,
})

// Banco falso em memória: date(YYYY-MM-DD) -> linhas
function fakeDays(days: Record<string, Row[]>) {
  db.findMany.mockImplementation(({ where }: { where: { date: Date; shift?: string } }) => {
    const rows = days[where.date.toISOString().slice(0, 10)] ?? []
    return Promise.resolve(where.shift ? rows.filter(r => r.shift === where.shift) : rows)
  })
  db.count.mockImplementation(({ where }: { where: { date: Date } }) =>
    Promise.resolve((days[where.date.toISOString().slice(0, 10)] ?? []).length)
  )
}

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/attendance?${qs}`))
const post = (body: unknown, raw = false) =>
  POST(
    new NextRequest('http://localhost/api/attendance', {
      method: 'POST',
      body: raw ? (body as string) : JSON.stringify(body),
      headers: { 'x-user-id': 'u1', 'x-user-username': 'tester' },
    })
  )

const payload = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-05',
  departmentKey: 'mont',
  shift: 'day',
  quadro: 20,
  plannedAbsence: 1,
  unplannedAbsence: 0,
  indeterminateAbsence: 0,
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const fn of Object.values(db)) fn.mockReset()
  db.createMany.mockResolvedValue({ count: 0 })
  db.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...data }))
  db.upsert.mockImplementation(({ create }: { create: object }) => Promise.resolve({ ...create }))
  db.findUnique.mockResolvedValue(null)
  vi.mocked(logAudit).mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GET /api/attendance — domingo e datas sem linhas', () => {
  // Hoje (seg 10-05) já tem linhas, então o carry-forward é no-op.
  const base = {
    '2026-10-02': [row('mont', 'day', 50), row('mont', 'night', 61)],
    '2026-10-03': [row('mont', 'day', 216)], // sábado: só 1º turno
    '2026-10-05': [row('mont', 'day', 99)],
  }

  it('domingo passado sem linhas mostra o sábado (não zeros) e não grava nada', async () => {
    fakeDays(base)
    const res = await get('date=2026-10-04')
    const body = await res.json()
    expect(body).toEqual([row('mont', 'day', 216)])
    expect(db.createMany).not.toHaveBeenCalled()
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it('domingo cai para sexta quando o sábado também está vazio', async () => {
    fakeDays({ '2026-10-02': [row('mont', 'day', 50)], '2026-10-05': [row('mont', 'day', 99)] })
    const body = await (await get('date=2026-10-04')).json()
    expect(body).toEqual([row('mont', 'day', 50)])
  })

  it('domingo que JÁ tem linhas reais devolve as reais, não a prévia', async () => {
    fakeDays({ ...base, '2026-10-04': [row('mont', 'day', 7)] })
    const body = await (await get('date=2026-10-04')).json()
    expect(body).toEqual([row('mont', 'day', 7)])
  })

  it('domingo FUTURO (dia 11) continua mostrando a prévia do último dia com dados', async () => {
    fakeDays({ ...base })
    const body = await (await get('date=2026-10-11')).json()
    expect(body.length).toBeGreaterThan(0)
    expect(db.createMany).not.toHaveBeenCalled()
  })

  it('filtro de turno também vale na prévia de domingo', async () => {
    fakeDays({
      '2026-10-03': [row('mont', 'day', 216), row('mont', 'night', 5)],
      '2026-10-05': [row('mont', 'day', 99)],
    })
    const body = await (await get('date=2026-10-04&shift=day')).json()
    expect(body.map((r: Row) => r.shift)).toEqual(['day'])
  })

  it('domingo sem NENHUM dado no banco inteiro devolve lista vazia (não quebra)', async () => {
    fakeDays({ '2026-10-05': [row('mont', 'day', 1)] })
    // nada de 10-03 para trás
    const res = await get('date=2026-10-04')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('dia útil passado sem linhas continua vazio (a prévia é só domingo/futuro)', async () => {
    fakeDays(base)
    const body = await (await get('date=2026-09-16')).json()
    expect(body).toEqual([])
  })

  it('exige o parâmetro date', async () => {
    const res = await get('')
    expect(res.status).toBe(400)
  })

  it('responde com Cache-Control: no-store (inclusive na prévia)', async () => {
    fakeDays(base)
    const a = await get('date=2026-10-05')
    const b = await get('date=2026-10-04')
    expect(a.headers.get('cache-control')).toContain('no-store')
    expect(b.headers.get('cache-control')).toContain('no-store')
  })

  it('erro de banco vira 500 com mensagem, sem vazar detalhes', async () => {
    db.count.mockRejectedValue(new Error('boom: senha=123'))
    const res = await get('date=2026-10-05')
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('senha')
  })
})

describe('POST /api/attendance — validações e domingo', () => {
  it('recusa domingo com 400 e não toca no banco', async () => {
    for (const shift of ['day', 'night', 'zero']) {
      const res = await post(payload({ date: '2026-10-04', shift }))
      expect(res.status).toBe(400)
    }
    expect(db.findUnique).not.toHaveBeenCalled()
    expect(db.upsert).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('sábado continua editável', async () => {
    db.findUnique.mockResolvedValue(row('mont', 'day'))
    const res = await post(payload({ date: '2026-10-03' }))
    expect(res.status).toBe(201)
  })

  it('JSON inválido → 400', async () => {
    const res = await post('{nao-e-json', true)
    expect(res.status).toBe(400)
  })

  it.each([
    ['quadro negativo', { quadro: -1 }],
    ['quadro string', { quadro: '10' }],
    ['setor inexistente', { departmentKey: 'nao-existe' }],
    ['turno inválido', { shift: 'tarde' }],
    ['data inválida', { date: '2026-02-31' }],
    ['data em formato errado', { date: '05/10/2026' }],
  ])('payload inválido: %s → 400 sem gravar', async (_nome, over) => {
    const res = await post(payload(over))
    expect(res.status).toBe(400)
    expect(db.upsert).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('campo null (ex.: Infinity serializado em JSON) é aceito e gravado como 0', async () => {
    db.findUnique.mockResolvedValue(row('mont', 'day', 10))
    const res = await post(payload({ quadro: Infinity }))
    expect(res.status).toBe(201)
    expect(db.update.mock.calls[0][0].data.quadro).toBe(0)
  })

  it('bloqueia edição de mais de 30 dias atrás (403)', async () => {
    const res = await post(payload({ date: '2026-09-01' }))
    expect(res.status).toBe(403)
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it('aceita exatamente 30 dias atrás', async () => {
    db.findUnique.mockResolvedValue(row('mont', 'day'))
    const res = await post(payload({ date: '2026-09-05' }))
    expect(res.status).toBe(201)
  })
})

describe('POST /api/attendance — onde grava e propagação', () => {
  it('1º turno grava na própria data e NÃO dispara propagação', async () => {
    db.findUnique.mockResolvedValue(row('mont', 'day', 10))
    const res = await post(payload({ shift: 'day' }))
    expect(res.status).toBe(201)
    expect(db.update.mock.calls[0][0].where.date_departmentKey_shift.date.toISOString().slice(0, 10)).toBe('2026-10-05')
    expect(db.count).not.toHaveBeenCalled() // propagação nem começou
  })

  it('2º turno de segunda grava na SEXTA (dia útil anterior)', async () => {
    db.findUnique.mockResolvedValue(row('mont', 'night', 61))
    db.count.mockResolvedValue(0)
    await post(payload({ shift: 'night', date: '2026-10-05' }))
    const used = db.update.mock.calls[0][0].where.date_departmentKey_shift.date.toISOString().slice(0, 10)
    expect(used).toBe('2026-10-02')
  })

  it('2º turno editado na terça: grava na segunda e propaga para as linhas-cópia de hoje', async () => {
    // hoje = seg 10-05. Editando "terça 10-06" não é futuro editável? (futuro é permitido pelo POST)
    // Cenário real: edita hoje (seg) → grava sex 10-02; seg 10-05 já existe com cópia antiga.
    const old = row('mont', 'night', 0)
    db.findUnique.mockImplementation(({ where }: { where: { date_departmentKey_shift: { date: Date } } }) => {
      const d = where.date_departmentKey_shift.date.toISOString().slice(0, 10)
      if (d === '2026-10-02') return Promise.resolve({ ...old }) // linha editada (antes)
      if (d === '2026-10-05') return Promise.resolve({ ...old }) // cópia ainda igual ao antigo
      return Promise.resolve(null)
    })
    db.count.mockResolvedValue(18)
    const res = await post(payload({ shift: 'night', date: '2026-10-05', quadro: 61 }))
    expect(res.status).toBe(201)
    // 1ª update = a edição em sex 10-02; 2ª = propagação para seg 10-05
    expect(db.update).toHaveBeenCalledTimes(2)
    const second = db.update.mock.calls[1][0]
    expect(second.where.date_departmentKey_shift.date.toISOString().slice(0, 10)).toBe('2026-10-05')
    expect(second.data.quadro).toBe(61)
  })

  it('falha na propagação NÃO derruba a edição (201) e é só logada', async () => {
    db.findUnique.mockResolvedValue(row('mont', 'night', 0))
    db.count.mockRejectedValue(new Error('banco caiu na propagação'))
    const res = await post(payload({ shift: 'night', quadro: 61 }))
    expect(res.status).toBe(201)
    expect(console.error).toHaveBeenCalled()
  })

  it('primeira edição (sem linha): copia dia anterior, faz upsert e audita before=null', async () => {
    fakeDays({ '2026-10-02': [row('mont', 'day', 10), row('pick', 'day', 5)] })
    db.findUnique.mockResolvedValue(null)
    const res = await post(payload({ shift: 'day', date: '2026-10-05' }))
    expect(res.status).toBe(201)
    expect(db.createMany).toHaveBeenCalledTimes(1)
    expect(db.upsert).toHaveBeenCalledTimes(1)
    const audit = vi.mocked(logAudit).mock.calls[0][0]
    expect(audit.action).toBe('attendance.update')
    expect((audit.details as { before: unknown }).before).toBeNull()
  })

  it('erro no createMany do backfill é engolido e a edição ainda é salva', async () => {
    fakeDays({ '2026-10-02': [row('mont', 'day', 10)] })
    db.createMany.mockRejectedValue(new Error('duplicado'))
    const res = await post(payload({ shift: 'day' }))
    expect(res.status).toBe(201)
    expect(db.upsert).toHaveBeenCalled()
  })

  it('auditoria nunca contém senha/hash e registra o usuário', async () => {
    db.findUnique.mockResolvedValue(row('mont', 'day', 10))
    await post(payload())
    const audit = vi.mocked(logAudit).mock.calls[0][0]
    expect(audit.username).toBe('tester')
    expect(audit.userId).toBe('u1')
    expect(JSON.stringify(audit)).not.toMatch(/password|hash/i)
  })
})
