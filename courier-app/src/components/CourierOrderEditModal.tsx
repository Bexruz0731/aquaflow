import { useState } from 'react'
import { X, Save } from 'lucide-react'
import api from '@/api/client'
import type { CompletedOrder } from '@/types'

interface Props {
  order: CompletedOrder
  onClose: () => void
  onSaved: () => void
}

function formatMoney(n: number) {
  return `${n.toLocaleString('uz-UZ')} so'm`
}

export default function CourierOrderEditModal({ order, onClose, onSaved }: Props) {
  const [delivered, setDelivered] = useState(String(order.containers_delivered ?? 0))
  const [returned, setReturned] = useState(String(order.containers_returned ?? 0))
  const [totalAmount, setTotalAmount] = useState(String(order.total_amount))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const d = parseInt(delivered)
    const r = parseInt(returned)
    const t = parseInt(totalAmount)

    if (isNaN(d) || d < 0) { setError("Yetkazilgan tara noto'g'ri"); return }
    if (isNaN(r) || r < 0) { setError("Qaytarilgan tara noto'g'ri"); return }
    if (isNaN(t) || t < 0) { setError("Summa noto'g'ri"); return }

    const payload: Record<string, number> = {}
    if (d !== (order.containers_delivered ?? 0)) payload.containers_delivered = d
    if (r !== (order.containers_returned ?? 0)) payload.containers_returned = r
    if (t !== order.total_amount) payload.total_amount = t

    if (Object.keys(payload).length === 0) { onClose(); return }

    setSaving(true)
    setError(null)
    try {
      await api.patch(`/orders/${order.id}/courier-edit`, payload)
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-2xl p-5 pb-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
              #{order.order_number} — tuzatish
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{order.client_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Current values for reference */}
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-xs text-gray-500 space-y-1">
          <p>Hozirgi summa: <span className="font-semibold text-gray-700 dark:text-gray-300">{formatMoney(order.total_amount)}</span></p>
          <p>Hozirgi tara: yetkazildi <span className="font-semibold">{order.containers_delivered ?? 0}</span>, qaytarildi <span className="font-semibold">{order.containers_returned ?? 0}</span></p>
        </div>

        {error && (
          <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Yetkazilgan tara
              </label>
              <input
                type="number"
                min="0"
                value={delivered}
                onChange={e => setDelivered(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white bg-white dark:bg-gray-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Qaytarilgan tara
              </label>
              <input
                type="number"
                min="0"
                value={returned}
                onChange={e => setReturned(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white bg-white dark:bg-gray-800 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Jami summa (so'm)
            </label>
            <input
              type="number"
              min="0"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white bg-white dark:bg-gray-800 text-sm"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 w-full py-3 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </div>
    </div>
  )
}
