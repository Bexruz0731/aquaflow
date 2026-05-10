import { useState, useEffect } from 'react'
import {
  Wallet, TrendingUp, TrendingDown, CreditCard,
  DollarSign, Plus, X, ChevronLeft, ChevronRight, Calendar,
} from 'lucide-react'
import api from '@/api/client'
import { formatMoney, formatDateTime, formatDateToString } from '@/utils/format'
import { useToastStore } from '@/store/toast'

interface TreasurySummary {
  total_income: number
  total_expense: number
  balance: number
}

interface TreasuryTx {
  id: string
  transaction_type: 'kirim' | 'chiqim'
  category: string | null
  amount: number
  payment_method: string
  description: string | null
  transaction_date: string
}

type FilterType = 'all' | 'kirim' | 'chiqim'

export default function Treasury() {
  const toast = useToastStore()
  const [summary, setSummary] = useState<TreasurySummary | null>(null)
  const [transactions, setTransactions] = useState<TreasuryTx[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<'kirim' | 'chiqim'>('kirim')
  const [formAmount, setFormAmount] = useState('')
  const [formMethod, setFormMethod] = useState('naqd')
  const [formCategory, setFormCategory] = useState('')
  const [formNote, setFormNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, per_page: 25 }
      if (filter !== 'all') params.transaction_type = filter
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const txRes = await api.get('/treasury/', { params })
      const items = txRes.data.items ?? txRes.data
      setTransactions(items)
      setTotal(txRes.data.total ?? items.length)
      setPages(txRes.data.pages ?? 1)
      if (txRes.data.summary) {
        setSummary(txRes.data.summary)
      }
    } catch {
      toast.error('G\'azna ma\'lumotlarini yuklashda xatolik')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [filter, page, dateFrom, dateTo])

  const setQuickPeriod = (days: number) => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    setDateFrom(formatDateToString(from))
    setDateTo(formatDateToString(to))
    setPage(1)
  }

  const submitForm = async () => {
    const amount = parseInt(formAmount)
    if (!amount || amount <= 0) { toast.error('Summa kiriting'); return }
    setSaving(true)
    try {
      await api.post('/treasury/', {
        transaction_type: formType,
        amount,
        payment_method: formMethod,
        category: formCategory || null,
        description: formNote || undefined,
      })
      toast.success(formType === 'kirim' ? 'Kirim qo\'shildi' : 'Chiqim qo\'shildi')
      setShowForm(false)
      setFormAmount(''); setFormCategory(''); setFormNote('')
      fetchData()
    } catch {
      toast.error('Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const BALANCE_CARDS = [
    { label: 'Jami kirim', value: summary?.total_income ?? 0, icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'Jami chiqim', value: summary?.total_expense ?? 0, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: 'Balans', value: summary?.balance ?? 0, icon: DollarSign, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Karta', value: 0, icon: CreditCard, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  ]

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    naqd: 'Naqd', plastik: 'Karta', click: 'Click', qarz: 'Qarz',
    cash: 'Naqd', card: 'Karta', transfer: "O'tkazma",
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">G'azna</h1>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary flex items-center gap-1.5"
        >
          <Plus size={15} /> Tranzaksiya qo'shish
        </button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {BALANCE_CARDS.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{formatMoney(value)}</p>
          </div>
        ))}
      </div>

      {/* Date filter + quick periods */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={15} className="text-gray-400 shrink-0" />
          <input type="date" className="input text-sm" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
          <span className="text-gray-400 text-sm">—</span>
          <input type="date" className="input text-sm" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
        </div>
        <div className="flex items-center gap-1">
          {[{ label: 'Bugun', days: 0 }, { label: '7 kun', days: 7 }, { label: '30 kun', days: 30 }, { label: '90 kun', days: 90 }].map(p => (
            <button key={p.label} onClick={() => setQuickPeriod(p.days)} className="btn btn-secondary text-xs py-1 px-2">{p.label}</button>
          ))}
        </div>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-1">
        {(['all', 'kirim', 'chiqim'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1) }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? 'Barchasi' : f === 'kirim' ? 'Kirim' : 'Chiqim'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Sana</th>
                <th className="hidden sm:table-cell table-header">Kategoriya</th>
                <th className="table-header">Tur</th>
                <th className="hidden sm:table-cell table-header">Usul</th>
                <th className="table-header">Summa</th>
                <th className="hidden md:table-cell table-header">Izoh</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="table-cell">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : transactions.map(tx => (
                    <tr key={tx.id} className="border-t border-gray-100 dark:border-gray-800 table-row-hover">
                      <td className="table-cell text-xs text-gray-500">{formatDateTime(tx.transaction_date)}</td>
                      <td className="hidden sm:table-cell table-cell font-medium text-gray-800 dark:text-gray-200">{tx.category ?? '—'}</td>
                      <td className="table-cell">
                        <span className={`badge ${tx.transaction_type === 'kirim' ? 'badge-success' : 'badge-danger'}`}>
                          {tx.transaction_type === 'kirim' ? <><TrendingUp size={10} className="inline mr-0.5" />Kirim</> : <><TrendingDown size={10} className="inline mr-0.5" />Chiqim</>}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell table-cell text-gray-500">
                        {PAYMENT_METHOD_LABELS[tx.payment_method] ?? tx.payment_method}
                      </td>
                      <td className="table-cell">
                        <span className={`font-semibold ${tx.transaction_type === 'kirim' ? 'text-green-600' : 'text-red-500'}`}>
                          {tx.transaction_type === 'kirim' ? '+' : '−'}{formatMoney(tx.amount)}
                        </span>
                      </td>
                      <td className="hidden md:table-cell table-cell text-gray-400 text-xs">{tx.description ?? '—'}</td>
                    </tr>
                  ))}
              {!loading && transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="table-cell text-center text-gray-400 py-8">Tranzaksiyalar yo'q</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-sm text-gray-500">Jami: {total}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm px-2">{page} / {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Transaction Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Wallet size={18} /> Tranzaksiya
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Type toggle */}
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                {(['kirim', 'chiqim'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setFormType(t)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      formType === t
                        ? t === 'kirim' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                        : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t === 'kirim' ? <><TrendingUp size={14} className="inline mr-1" />Kirim</> : <><TrendingDown size={14} className="inline mr-1" />Chiqim</>}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Summa (so'm) *</label>
                <input className="input w-full" type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Kategoriya</label>
                <input className="input w-full" value={formCategory} onChange={e => setFormCategory(e.target.value)} placeholder="Masalan: Yetkazib berish, Ijara..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To'lov usuli</label>
                <select className="input w-full" value={formMethod} onChange={e => setFormMethod(e.target.value)}>
                  <option value="naqd">Naqd</option>
                  <option value="plastik">Karta</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Izoh</label>
                <input className="input w-full" value={formNote} onChange={e => setFormNote(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="btn btn-secondary flex-1">Bekor</button>
                <button
                  onClick={submitForm}
                  disabled={saving}
                  className={`btn flex-1 ${formType === 'kirim' ? 'btn-success' : 'btn-danger'}`}
                >
                  {saving ? 'Saqlanmoqda...' : 'Qo\'shish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
