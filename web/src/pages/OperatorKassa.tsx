import { useState, useEffect } from 'react'
import { Wallet, ArrowUpCircle, RefreshCw } from 'lucide-react'
import api from '@/api/client'
import { formatMoney, formatDateTime } from '@/utils/format'
import { useToastStore } from '@/store/toast'

interface Balance { cash_balance: number; card_balance: number; total: number }
interface Submission {
  id: string
  cash_amount: number
  card_amount: number
  total_amount: number
  note: string | null
  submission_date: string
}

export default function OperatorKassa() {
  const toast = useToastStore()
  const [balance, setBalance] = useState<Balance | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [note, setNote] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const fetchBalance = async () => {
    try {
      const { data } = await api.get('/operator/balance')
      setBalance(data)
    } catch { /* ignore */ }
  }

  const fetchSubmissions = async () => {
    try {
      const { data } = await api.get('/operator/submissions', { params: { per_page: 20 } })
      setSubmissions(data.items ?? [])
    } catch { /* ignore */ }
  }

  const load = async () => {
    setLoading(true)
    await Promise.all([fetchBalance(), fetchSubmissions()])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const { data } = await api.post('/operator/submit-cash', { note: note || undefined })
      toast.success(`${formatMoney(data.total)} topshirildi`)
      setNote('')
      setShowConfirm(false)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mening kassam</h1>
        <button onClick={load} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Current balance card */}
      <div className="card">
        <p className="text-xs font-medium text-gray-500 mb-4">Hozirgi balans (topshirilmagan)</p>
        {loading ? (
          <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
                <p className="text-xs text-green-700 dark:text-green-400 mb-1">Naqd</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-400">{formatMoney(balance?.cash_balance ?? 0)}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                <p className="text-xs text-blue-700 dark:text-blue-400 mb-1">Plastik</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{formatMoney(balance?.card_balance ?? 0)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Jami topshirilishi kerak:</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{formatMoney(balance?.total ?? 0)}</span>
            </div>
            {(balance?.total ?? 0) > 0 && !showConfirm && (
              <button
                onClick={() => setShowConfirm(true)}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
              >
                <ArrowUpCircle size={18} /> Boshliqqа topshirish
              </button>
            )}
            {showConfirm && (
              <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Topshirishni tasdiqlaysizmi?</p>
                <input
                  className="input w-full"
                  placeholder="Izoh (ixtiyoriy)..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
                <div className="flex gap-3">
                  <button onClick={() => setShowConfirm(false)} className="btn btn-secondary flex-1">Bekor</button>
                  <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary flex-1">
                    {submitting ? 'Topshirilmoqda...' : 'Tasdiqlash'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submission history */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Wallet size={16} /> Topshirishlar tarixi
          </h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}
          </div>
        ) : submissions.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">Hali topshirishlar yo'q</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {submissions.map(s => (
              <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{formatMoney(s.total_amount)}</p>
                  <p className="text-xs text-gray-500">
                    Naqd: {formatMoney(s.cash_amount)} · Plastik: {formatMoney(s.card_amount)}
                    {s.note && <span className="ml-2 text-gray-400">· {s.note}</span>}
                  </p>
                </div>
                <p className="text-xs text-gray-400">{formatDateTime(s.submission_date)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
