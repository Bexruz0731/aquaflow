import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/api/client'

const REASONS = [
  "Mijoz eshik ochmadi",
  "Mijoz bekor qildi",
  "Kerakli mahsulot yo'q",
  "Boshqa",
]

interface Props {
  orderId: string
  orderNumber: number
  onClose: () => void
  onReported: () => void
}

export default function ProblemModal({ orderId, orderNumber, onClose, onReported }: Props) {
  const [reason, setReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const finalReason = reason === 'Boshqa' ? customReason : reason

  const handleSubmit = async () => {
    if (!finalReason.trim()) return
    setSubmitting(true)
    try {
      await api.post(`/orders/${orderId}/problem`, { reason: finalReason })
      onReported()
    } catch {
      alert('Xatolik yuz berdi')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <motion.div
          className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-gray-900 rounded-t-3xl"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              <p className="font-bold text-gray-900 dark:text-white">❌ Yetkazib bo'lmadi</p>
              <p className="text-xs text-gray-400">#{orderNumber}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <X size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sabab tanlang:</p>
            {REASONS.map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-medium transition-colors ${
                  reason === r
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border-2 border-red-400'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-transparent'
                }`}
              >
                {r}
              </button>
            ))}
            {reason === 'Boshqa' && (
              <textarea
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                rows={3}
                placeholder="Sababni yozing..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
              />
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting || !finalReason.trim()}
              className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 mt-2"
            >
              {submitting ? <><Loader2 size={18} className="animate-spin" /> Yuborilmoqda...</> : 'Xabar berish'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
