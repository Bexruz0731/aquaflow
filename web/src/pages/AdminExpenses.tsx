import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit2, X, Check, Search } from 'lucide-react'
import { formatMoney, formatDateTime } from '@/utils/format'
import api from '@/api/client'

const PAYMENT_METHODS = [
  { value: 'NAQD', label: 'Naqd' },
  { value: 'KARTA', label: 'Humo/Uzcard' },
  { value: 'PAYME', label: 'Payme/Click' },
]

interface Expense {
  id: string
  type: 'admin' | 'courier'
  title: string
  amount: number
  payment_method: string
  note: string | null
  courier_name: string | null
  created_at: string
}

interface ExpenseForm {
  title: string
  amount: string
  payment_method: string
  note: string
}

const EMPTY_FORM: ExpenseForm = { title: '', amount: '', payment_method: 'NAQD', note: '' }

export default function AdminExpenses() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-expenses', page, search, dateFrom, dateTo],
    queryFn: () => api.get('/admin-expenses/', {
      params: {
        page,
        per_page: 20,
        ...(search ? { search } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      }
    }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (d: object) => api.post('/admin-expenses/', d).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-expenses'] })
      setShowForm(false)
      setForm(EMPTY_FORM)
      setFormError('')
    },
    onError: (e: any) => setFormError(e?.response?.data?.detail || 'Xatolik'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: string; d: object }) => api.put(`/admin-expenses/${id}`, d).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-expenses'] })
      setEditingId(null)
      setForm(EMPTY_FORM)
      setFormError('')
    },
    onError: (e: any) => setFormError(e?.response?.data?.detail || 'Xatolik'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin-expenses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-expenses'] }),
  })

  const handleSubmit = () => {
    if (!form.title.trim()) { setFormError("Sarlavha kiritilishi shart"); return }
    const amount = parseInt(form.amount)
    if (!amount || amount <= 0) { setFormError("To'g'ri summa kiriting"); return }
    setFormError('')
    const payload = { title: form.title.trim(), amount, payment_method: form.payment_method, note: form.note || null }
    if (editingId) {
      updateMutation.mutate({ id: editingId, d: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const startEdit = (e: Expense) => {
    setEditingId(e.id)
    setForm({ title: e.title, amount: String(e.amount), payment_method: e.payment_method, note: e.note || '' })
    setShowForm(true)
    setFormError('')
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const pmLabel = (v: string) => PAYMENT_METHODS.find(m => m.value === v)?.label ?? v

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Xarajatlar</h1>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); setFormError('') }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={16} /> Qo'shish
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card border border-blue-200 dark:border-blue-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
            {editingId ? 'Xarajatni tahrirlash' : 'Yangi xarajat'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sarlavha *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="masalan: Benzin, Ofis ijara..."
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Summa (so'm) *</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                className="input w-full"
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To'lov usuli</label>
              <select
                value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                className="input w-full"
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Izoh</label>
              <input
                type="text"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="ixtiyoriy..."
                className="input w-full"
              />
            </div>
          </div>
          {formError && <p className="text-red-500 text-sm mt-2">{formError}</p>}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="btn btn-primary flex items-center gap-2"
            >
              <Check size={16} /> Saqlash
            </button>
            <button onClick={cancelForm} className="btn btn-secondary flex items-center gap-2">
              <X size={16} /> Bekor
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Qidirish</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Sarlavha bo'yicha..."
                className="input flex-1"
              />
              <button onClick={handleSearch} className="btn btn-secondary p-2">
                <Search size={16} />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Dan</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} className="input" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Gacha</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} className="input" />
          </div>
          {(search || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearch(''); setSearchInput(''); setDateFrom(''); setDateTo(''); setPage(1) }}
              className="btn btn-secondary flex items-center gap-1 text-sm"
            >
              <X size={14} /> Tozalash
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Yuklanmoqda...</div>
        ) : !data?.items?.length ? (
          <div className="p-8 text-center text-gray-500">Xarajatlar topilmadi</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Sarlavha</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400">Summa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">To'lov</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Sana</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Izoh</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.items.map((e: Expense) => (
                  <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {e.type === 'courier' && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">Kuryer</span>
                        )}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{e.title}</p>
                          {e.courier_name && <p className="text-xs text-gray-400">{e.courier_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatMoney(e.amount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{pmLabel(e.payment_method)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(e.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{e.note || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {e.type === 'admin' && (
                          <>
                            <button
                              onClick={() => startEdit(e)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => { if (confirm('O\'chirilsinmi?')) deleteMutation.mutate(e.id) }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Jami: {data.total} ta xarajat
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="btn btn-secondary text-sm disabled:opacity-50"
            >
              ← Oldingi
            </button>
            <span className="flex items-center px-3 text-sm text-gray-600 dark:text-gray-400">
              {page} / {data.pages}
            </span>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage(p => p + 1)}
              className="btn btn-secondary text-sm disabled:opacity-50"
            >
              Keyingi →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
