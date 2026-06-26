import { useState } from 'react'
import { Phone, MapPin, ChevronRight, Search, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/api/client'
import CompletionModal from '@/components/CompletionModal'
import ProblemModal from '@/components/ProblemModal'
import type { ActiveOrder } from '@/types'

function formatMoney(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }
function formatTime(s: string) {
  const d = new Date(s)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  onOpenMap: (order: ActiveOrder) => void
}

export default function OrdersTab({ onOpenMap }: Props) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [completing, setCompleting] = useState<ActiveOrder | null>(null)
  const [reporting, setReporting] = useState<ActiveOrder | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['courier-orders'],
    queryFn: async () => {
      const { data } = await api.get('/orders/courier/active')
      return data as { orders: ActiveOrder[]; today_total: number; today_delivered: number }
    },
    refetchInterval: 30000,
  })

  const orders = data?.orders ?? []
  const filtered = search
    ? orders.filter(o =>
        o.client_name.toLowerCase().includes(search.toLowerCase()) ||
        o.address_text.toLowerCase().includes(search.toLowerCase()) ||
        String(o.order_number).includes(search)
      )
    : orders

  const callClient = (order: ActiveOrder) => {
    // Use contact_phone if available, otherwise fall back to client_phone
    const phone = order.contact_phone
      ? `998${order.contact_phone.replace(/\s/g, '')}`
      : order.client_phone
    window.location.href = `tel:+${phone}`
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 animate-pulse h-20" />
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 animate-pulse h-20" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 animate-pulse h-32" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bugun jami</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{data?.today_total ?? 0} ta</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Yetkazildi</p>
          <p className="text-2xl font-bold text-green-500">{data?.today_delivered ?? 0} ta</p>
        </div>
      </div>

      {/* Search + Refresh */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Qidirish..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => refetch()}
          className="w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
        >
          <RefreshCw size={16} className="text-gray-500" />
        </button>
      </div>

      {/* Active orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <p className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">Aktiv buyurtmalar</p>
          </div>
          <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filtered.length} ta
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-gray-400 font-medium">Aktiv buyurtma yo'q</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(order => (
              <div key={order.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between p-4 pb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900 dark:text-white">#{order.order_number}</span>
                      <span className="text-xs text-gray-400">{formatTime(order.created_at)}</span>
                    </div>
                    <p className="font-semibold text-sm text-gray-800 dark:text-white">{order.client_name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-blue-600">{formatMoney(order.total_amount)}</p>
                      {order.client_debt > 0 && (
                        <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">
                          Qarz: {formatMoney(order.client_debt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {/* open detail */}}
                    className="w-8 h-8 flex items-center justify-center text-gray-400"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                {/* Address + phone */}
                <div className="px-4 pb-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Phone size={12} />
                    <span className="text-xs">
                      {order.contact_phone ? `+998 ${order.contact_phone}` : `+${order.client_phone}`}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 text-gray-500">
                    <MapPin size={12} className="mt-0.5 shrink-0" />
                    <span className="text-xs leading-tight">{order.address_text}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 px-4 pb-4">
                  <button
                    onClick={() => callClient(order)}
                    className="w-12 h-12 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                  >
                    <Phone size={18} className="text-blue-600" />
                  </button>
                  <button
                    onClick={() => onOpenMap(order)}
                    className="w-12 h-12 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                  >
                    <MapPin size={18} className="text-red-500" />
                  </button>
                  <button
                    onClick={() => setCompleting(order)}
                    className="flex-1 h-12 bg-green-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    ✅ Topshirish
                  </button>
                </div>

                {/* Cannot deliver */}
                <div className="px-4 pb-4 -mt-1">
                  <button
                    onClick={() => setReporting(order)}
                    className="w-full py-2 text-xs text-red-400 font-medium border border-red-200 dark:border-red-800 rounded-xl active:scale-[0.98] transition-transform"
                  >
                    ❌ Yetkazib bo'lmadi
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {completing && (
        <CompletionModal
          order={completing}
          onClose={() => setCompleting(null)}
          onCompleted={() => {
            setCompleting(null)
            qc.invalidateQueries({ queryKey: ['courier-orders'] })
            qc.invalidateQueries({ queryKey: ['courier-history'] })
          }}
        />
      )}

      {reporting && (
        <ProblemModal
          orderId={reporting.id}
          orderNumber={reporting.order_number}
          onClose={() => setReporting(null)}
          onReported={() => {
            setReporting(null)
            qc.invalidateQueries({ queryKey: ['courier-orders'] })
          }}
        />
      )}
    </div>
  )
}
