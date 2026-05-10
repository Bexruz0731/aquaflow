import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, History, DollarSign, TrendingDown, CheckCircle,
  Search, ChevronLeft, ChevronRight, X,
} from 'lucide-react'
import api from '@/api/client'
import { formatMoney, formatDate, formatDateTime, formatPhone, getInitials, getAvatarColor } from '@/utils/format'
import { useToastStore } from '@/store/toast'
import { useAuthStore } from '@/store/auth'

interface Debtor {
  client_id: string
  name: string
  phone: string
  debt_amount: number
  advance_amount: number
  last_order_at: string | null
}

interface DebtTx {
  id: string
  client_name: string
  amount: number
  type: 'created' | 'paid' | 'cancelled' | 'advance' | 'advance_used' | 'adjustment'
  payment_method: string | null
  note: string | null
  created_at: string
}

interface PayForm { amount: string; method: string; note: string }

export default function Debts() {
  const navigate = useNavigate()
  const toast = useToastStore()
  const { user } = useAuthStore()
  const isAgent = user?.role === 'agent'

  const [tab, setTab] = useState<'debtors' | 'history'>('debtors')
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [history, setHistory] = useState<DebtTx[]>([])
  const [search, setSearch] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historySearchInput, setHistorySearchInput] = useState('')
  const [historyTotal, setHistoryTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [payTarget, setPayTarget] = useState<Debtor | null>(null)
  const [payAll, setPayAll] = useState(false)
  const [payForm, setPayForm] = useState<PayForm>({ amount: '', method: 'cash', note: '' })
  const [paying, setPaying] = useState(false)

  const totalDebt = debtors.reduce((s, d) => s + d.debt_amount, 0)

  const fetchDebtors = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/debts/', { params: { search, page, per_page: 25 } })
      const items = data.items ?? data
      setDebtors(items)
      setTotal(data.total ?? items.length)
      setPages(data.pages ?? 1)
    } catch {
      toast.error('Qarzdorlarni yuklashda xatolik')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    const { data } = await api.get('/debts/history', {
      params: { page, per_page: 50, ...(historySearch ? { search: historySearch } : {}) }
    })
    setHistory(data.items ?? data)
    setPages(data.pages ?? 1)
    setHistoryTotal(data.total ?? (data.items ?? data).length)
  }

  useEffect(() => {
    if (tab === 'debtors') fetchDebtors()
    else fetchHistory()
  }, [tab, search, historySearch, page])

  const openPay = (debtor: Debtor, all = false) => {
    setPayTarget(debtor)
    setPayAll(all)
    setPayForm({ amount: all ? String(debtor.debt_amount) : '', method: 'NAQD', note: '' })
  }

  const submitPay = async () => {
    if (!payTarget) return
    const amount = parseInt(payForm.amount)
    if (!amount || amount <= 0) { toast.error('Summa kiriting'); return }
    setPaying(true)
    try {
      await api.post(`/debts/${payTarget.client_id}/pay`, {
        amount,
        payment_method: payForm.method,
        note: payForm.note || undefined,
      })
      toast.success('Qarz to\'landi')
      setPayTarget(null)
      fetchDebtors()
    } catch {
      toast.error('Xatolik yuz berdi')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Qarzdorlar</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Jami qarz</span>
            <AlertCircle size={16} className="text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-500">{formatMoney(totalDebt)}</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Qarzdorlar soni</span>
            <TrendingDown size={16} className="text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{total}</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">O'rtacha qarz</span>
            <DollarSign size={16} className="text-yellow-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {total > 0 ? formatMoney(Math.round(totalDebt / total)) : '—'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(['debtors', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); setSearch(''); setHistorySearch(''); setHistorySearchInput('') }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'debtors' ? 'Qarzdorlar' : <span className="flex items-center gap-1.5"><History size={14} />Tarix</span>}
          </button>
        ))}
      </div>

      {tab === 'debtors' && (
        <>
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9 w-full"
              placeholder="Mijoz qidirish..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">Mijoz</th>
                    <th className="table-header">Telefon</th>
                    <th className="table-header">Qarz summasi</th>
                    <th className="table-header">Oxirgi buyurtma</th>
                    <th className="table-header">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j} className="table-cell">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : debtors.map(d => {
                        const initials = getInitials(d.name)
                        const avatarColor = getAvatarColor(d.name)
                        return (
                          <tr key={d.client_id} className="table-row-hover border-t border-gray-100 dark:border-gray-800">
                            <td className="table-cell">
                              <div className="flex items-center gap-2.5">
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${avatarColor}`}>
                                  {initials}
                                </span>
                                <button
                                  onClick={() => navigate(`/clients/${d.client_id}`)}
                                  className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                  {d.name}
                                </button>
                              </div>
                            </td>
                            <td className="table-cell text-gray-500">{formatPhone(d.phone)}</td>
                            <td className="table-cell">
                              <span className="badge badge-danger font-semibold">{formatMoney(d.debt_amount)}</span>
                            </td>
                            <td className="table-cell text-gray-500 text-xs">{d.last_order_at ? formatDate(d.last_order_at) : '—'}</td>
                            {!isAgent && (
                              <td className="table-cell">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => openPay(d)}
                                    className="btn btn-secondary text-xs py-1 px-2"
                                  >
                                    To'lash
                                  </button>
                                  <button
                                    onClick={() => openPay(d, true)}
                                    className="btn btn-success text-xs py-1 px-2 flex items-center gap-1"
                                  >
                                    <CheckCircle size={12} /> Yopish
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                  {!loading && debtors.length === 0 && (
                    <tr>
                      <td colSpan={5} className="table-cell text-center text-gray-400 py-8">
                        Qarzdorlar yo'q
                      </td>
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
        </>
      )}

      {tab === 'history' && (
        <>
          <div className="flex gap-2 max-w-sm">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-9 w-full"
                placeholder="Mijoz qidirish..."
                value={historySearchInput}
                onChange={e => setHistorySearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setHistorySearch(historySearchInput); setPage(1) } }}
              />
            </div>
            <button
              onClick={() => { setHistorySearch(historySearchInput); setPage(1) }}
              className="btn btn-secondary p-2"
            >
              <Search size={16} />
            </button>
            {historySearch && (
              <button
                onClick={() => { setHistorySearch(''); setHistorySearchInput(''); setPage(1) }}
                className="btn btn-secondary p-2"
              >
                <X size={16} />
              </button>
            )}
          </div>

        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Sana</th>
                  <th className="table-header">Mijoz</th>
                  <th className="table-header">Tur</th>
                  <th className="table-header">Summa</th>
                  <th className="table-header hidden md:table-cell">To'lov usuli</th>
                  <th className="table-header hidden sm:table-cell">Izoh</th>
                </tr>
              </thead>
              <tbody>
                {history.map(tx => (
                  <tr key={tx.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="table-cell text-xs text-gray-500">{formatDateTime(tx.created_at)}</td>
                    <td className="table-cell font-medium text-gray-800 dark:text-gray-200">{tx.client_name}</td>
                    <td className="table-cell">
                      <span className={`badge ${
                        tx.type === 'paid' ? 'badge-success' :
                        tx.type === 'created' ? 'badge-danger' :
                        tx.type === 'advance' ? 'badge-info' :
                        tx.type === 'advance_used' ? 'badge-success' :
                        tx.type === 'adjustment' ? 'badge-warning' :
                        'badge-gray'
                      }`}>
                        {tx.type === 'paid' ? 'To\'landi' :
                         tx.type === 'created' ? 'Qo\'shildi' :
                         tx.type === 'advance' ? 'Avans' :
                         tx.type === 'advance_used' ? 'Avans ishlatildi' :
                         tx.type === 'adjustment' ? 'Tuzatish' :
                         'Bekor'}
                      </span>
                    </td>
                    <td className="table-cell font-semibold text-gray-900 dark:text-white">{formatMoney(Math.abs(tx.amount))}</td>
                    <td className="table-cell text-gray-500 hidden md:table-cell">{tx.payment_method ?? '—'}</td>
                    <td className="table-cell text-gray-400 text-xs hidden sm:table-cell">{tx.note ?? '—'}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">Tarix yo'q</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
              <span className="text-sm text-gray-500">Jami: {historyTotal}</span>
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
        </>
      )}

      {/* Pay Modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Qarz to'lash</h2>
              <button onClick={() => setPayTarget(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Jami qarz</p>
                <p className="text-xl font-bold text-red-500">{formatMoney(payTarget.debt_amount)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Summa (so'm)</label>
                <input
                  className="input w-full"
                  type="number"
                  value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
                {payAll && (
                  <button onClick={() => setPayForm(f => ({ ...f, amount: String(payTarget.debt_amount) }))} className="text-xs text-blue-500 mt-1">
                    Hammasini yopish
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To'lov usuli</label>
                <select className="input w-full" value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>
                  <option value="NAQD">Naqd</option>
                  <option value="KARTA">Humo/Uzcard</option>
                  <option value="PAYME">Payme/Click</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Izoh</label>
                <input className="input w-full" value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPayTarget(null)} className="btn btn-secondary flex-1">Bekor</button>
                <button onClick={submitPay} disabled={paying} className="btn btn-primary flex-1">
                  {paying ? 'To\'lanmoqda...' : 'Tasdiqlash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
