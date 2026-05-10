import { useState } from 'react'
import { ChevronRight, ChevronDown, RotateCcw, MapPin } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { getT } from '@/i18n'
import type { T } from '@/i18n'
import type { Order } from '@/types'

function formatMoney(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }
function formatDate(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_CONFIG = (t: T): Record<string, { label: string; color: string; bg: string }> => ({
  YANGI:         { label: t.statusNew,       color: 'text-blue-600',   bg: 'bg-blue-100 dark:bg-blue-900/30' },
  QABUL_QILINDI: { label: t.statusAccepted,  color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  TAYINLANDI:    { label: t.statusAssigned,  color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  YOLDA:         { label: t.statusOnWay,     color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  YETKAZILDI:    { label: t.statusDelivered, color: 'text-green-600',  bg: 'bg-green-100 dark:bg-green-900/30' },
  BEKOR_QILINDI: { label: t.statusCancelled, color: 'text-red-600',   bg: 'bg-red-100 dark:bg-red-900/30' },
  MUAMMO:        { label: t.statusProblem,   color: 'text-gray-600',  bg: 'bg-gray-100 dark:bg-gray-800' },
  YOPILDI:       { label: t.statusClosed,    color: 'text-emerald-700',bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
})

const PAY_STATUS = (t: T): Record<string, { label: string; color: string }> => ({
  tolangan:   { label: t.payPaid,    color: 'text-green-600' },
  tolanmagan: { label: t.payUnpaid,  color: 'text-red-500' },
  qisman:     { label: t.payPartial, color: 'text-yellow-600' },
})

function StatusBadge({ status, t }: { status: string; t: T }) {
  const cfg = STATUS_CONFIG(t)[status] ?? { label: status, color: 'text-gray-600', bg: 'bg-gray-100' }
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  )
}

interface OrderCardProps {
  order: Order
  onReorder: (order: Order) => void
  t: T
}

function OrderCard({ order, onReorder, t }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false)
  const payCfg = PAY_STATUS(t)[order.payment_status] ?? { label: order.payment_status, color: 'text-gray-500' }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <button
        className="w-full p-4 flex items-center gap-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-bold text-gray-900 dark:text-white text-sm">
              #{String(order.id).padStart(6, '0')}
            </span>
            <StatusBadge status={order.status} t={t} />
          </div>
          <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {order.items.map(i => `${i.product_name ?? 'Mahsulot'} × ${i.quantity}`).join(', ')}
          </p>
        </div>
        <div className="text-right shrink-0 ml-2">
          <p className="font-bold text-gray-900 dark:text-white text-sm">{formatMoney(order.total_amount)}</p>
          <p className={`text-xs font-medium ${payCfg.color}`}>{payCfg.label}</p>
        </div>
        {expanded
          ? <ChevronDown size={16} className="text-gray-400 shrink-0" />
          : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
          {/* Items */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.products}</p>
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300">{item.product_name ?? 'Mahsulot'} × {item.quantity}</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatMoney(item.price_at_order * item.quantity)}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1 border-t border-gray-100 dark:border-gray-700">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{t.total}</span>
              <span className="font-bold text-gray-900 dark:text-white">{formatMoney(order.total_amount)}</span>
            </div>
          </div>

          {/* Address */}
          {order.address_text && (
            <div className="flex items-start gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <MapPin size={14} className="text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-600 dark:text-gray-300">{order.address_text}</p>
            </div>
          )}

          {/* Courier */}
          {order.courier_name && (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
              <span className="text-sm">🚗</span>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Kuryer: <span className="font-semibold">{order.courier_name}</span>
              </p>
            </div>
          )}

          {/* Reorder */}
          {(order.status === 'YETKAZILDI' || order.status === 'YOPILDI') && (
            <button
              onClick={() => onReorder(order)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              <RotateCcw size={14} />
              {t.reorder}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  onGoCart?: () => void
}

export default function OrdersPage({ onGoCart }: Props) {
  const { add } = useCartStore()
  const lang = useAuthStore(s => s.profile?.language)
  const t = getT(lang)

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await api.get('/orders/my')
      return data as Order[]
    },
    refetchInterval: 30000,
  })

  const reorder = (order: Order) => {
    order.items.forEach(item => {
      add({
        product_id: item.product_id,
        name: item.product_name ?? 'Mahsulot',
        price: item.price_at_order,
        volume_liters: item.volume_liters,
        image_url: null,
      })
    })
    onGoCart?.()
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Buyurtmalar</h1>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-5xl mb-4">📦</p>
          <p className="text-gray-500 font-medium">{t.noOrders}</p>
          <p className="text-sm text-gray-400 mt-1">Buyurtmalaringiz bu yerda ko'rinadi</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Buyurtmalar</h1>
        <span className="text-sm text-gray-400">{orders.length} ta</span>
      </div>
      {orders.map(order => (
        <OrderCard key={order.id} order={order} onReorder={reorder} t={t} />
      ))}
    </div>
  )
}
