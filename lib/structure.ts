export type RowType = 'leaf' | 'subtotal' | 'group-header' | 'total'

export interface LeafRow {
  type: 'leaf'
  key: string
  name: string
  namePt: string
  group: string
}

export interface SubtotalRow {
  type: 'subtotal'
  name: string
  childKeys: string[]
  group: string
}

export interface GroupHeader {
  type: 'group-header'
  name: string
}

export interface TotalRow {
  type: 'total'
  name: string
  // keys of all leaf rows
  childKeys: string[]
}

export type TableRow = LeafRow | SubtotalRow | GroupHeader | TotalRow

// All leaf department keys in order (for total calculation)
export const ALL_LEAF_KEYS = [
  'adm', 'rh', 'fin', 'ti', 'sst',
  'log', 'comp', 'com',
  'eng', 'pint_int',
  'manut',
  'qual',
  'prensa', 'cald', 'ferr',
  'mont', 'pint', 'pick',
]

export const TABLE_ROWS: TableRow[] = [
  // OUTROS group
  { type: 'group-header', name: 'OUTROS' },
  { type: 'leaf', key: 'adm', name: 'Administrativo', namePt: '総務', group: 'OUTROS' },
  { type: 'leaf', key: 'rh', name: 'RH/DP', namePt: '人事', group: 'OUTROS' },
  { type: 'leaf', key: 'fin', name: 'Financeiro/Fiscal/Contabilidade', namePt: '経理', group: 'OUTROS' },
  { type: 'leaf', key: 'ti', name: 'Tecnologia da Informação', namePt: 'IT', group: 'OUTROS' },
  { type: 'leaf', key: 'sst', name: 'SST/MA', namePt: '安全環境', group: 'OUTROS' },
  { type: 'subtotal', name: 'sub-total 小計', childKeys: ['adm', 'rh', 'fin', 'ti', 'sst'], group: 'OUTROS' },

  // PCP group
  { type: 'group-header', name: 'PCP' },
  { type: 'leaf', key: 'log', name: 'Logística', namePt: '物流', group: 'PCP' },
  { type: 'leaf', key: 'comp', name: 'Compras', namePt: '購買', group: 'PCP' },
  { type: 'leaf', key: 'com', name: 'Comercial', namePt: '営業', group: 'PCP' },
  { type: 'subtotal', name: 'sub-total 小計', childKeys: ['log', 'comp', 'com'], group: 'PCP' },

  // Eng group
  { type: 'group-header', name: 'Eng' },
  { type: 'leaf', key: 'eng', name: 'Engenharia', namePt: '技術', group: 'Eng' },
  { type: 'leaf', key: 'pint_int', name: 'Pintura Interna', namePt: '塗装技術', group: 'Eng' },
  { type: 'subtotal', name: 'sub-total 小計', childKeys: ['eng', 'pint_int'], group: 'Eng' },

  // Manutenção (standalone)
  { type: 'leaf', key: 'manut', name: 'Manutenção', namePt: '保全', group: 'Manutenção' },

  // Qualidade (standalone)
  { type: 'leaf', key: 'qual', name: 'Qualidade', namePt: '品証', group: 'Qualidade' },

  // PRENSA group
  { type: 'group-header', name: 'PRENSA' },
  { type: 'leaf', key: 'prensa', name: 'Prensa', namePt: '圧造', group: 'PRENSA' },
  { type: 'leaf', key: 'cald', name: 'Caldeiraria', namePt: '改善', group: 'PRENSA' },
  { type: 'leaf', key: 'ferr', name: 'Ferramentaria', namePt: '工機', group: 'PRENSA' },
  { type: 'subtotal', name: 'sub-total 小計', childKeys: ['prensa', 'cald', 'ferr'], group: 'PRENSA' },

  // Produção group
  { type: 'group-header', name: 'Produção' },
  { type: 'leaf', key: 'mont', name: 'Montagem/Solda', namePt: '組み立て', group: 'Produção' },
  { type: 'leaf', key: 'pint', name: 'Pintura', namePt: '塗装', group: 'Produção' },
  { type: 'leaf', key: 'pick', name: 'Picking', namePt: 'ピッキング', group: 'Produção' },
  { type: 'subtotal', name: 'sub-total 小計', childKeys: ['mont', 'pint', 'pick'], group: 'Produção' },

  // Total
  { type: 'total', name: 'Total 合計', childKeys: ALL_LEAF_KEYS },
]

export type Shift = 'day' | 'night' | 'zero'

// isPrevDay = true means this shift's data is stored under the PREVIOUS working day
export const SHIFTS: { key: Shift; label: string; labelJp: string; isPrevDay: boolean }[] = [
  { key: 'day',   label: 'Diurno (1ºturno)',    labelJp: '昼勤',   isPrevDay: false },
  { key: 'night', label: 'Noturno (2ºturno)',   labelJp: '夜勤',   isPrevDay: true  },
  { key: 'zero',  label: 'Zero Hora (3ºturno)', labelJp: '深夜勤', isPrevDay: false },
]
