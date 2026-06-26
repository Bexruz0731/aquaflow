import { useState } from 'react'
import { Search, ChevronRight, ChevronDown, MapPin, Pencil } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/api/client'
import type { CompletedOrder } from '@/types'
import { useAuthStore } from '@/store/auth'
import CourierOrderEditModal from '@/components/CourierOrderEditModal'

function formatMoney(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }
function formatDateTime(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function fmt(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }

function paymentLines(o: CompletedOrder): { text: string; color: string }[] {
  const lines: { text: string; color: string }[] = []
  if (o.advance_used > 0)  lines.push({ text: `Avans: ${fmt(o.advance_used)}`,  color: 'text-blue-500' })
  if (o.card_amount > 0)   lines.push({ text: `Karta: ${fmt(o.card_amount)}`,   color: 'text-purple-500' })
  if (o.payme_amount > 0)  lines.push({ text: `Payme: ${fmt(o.payme_amount)}`,  color: 'text-indigo-500' })
  if (o.cash_amount > 0)   lines.push({ text: `Naqd: ${fmt(o.cash_amount)}`,    color: 'text-green-600' })
  if (o.debt_amount > 0)   lines.push({ text: `Qarz: ${fmt(o.debt_amount)}`,    color: 'text-red-500' })
  if (lines.length === 0 && o.total_amount === 0) lines.push({ text: 'Avans (to\'liq)', color: 'text-blue-500' })
  return lines
}

function HistoryCard({ order, onEdit }: { order: CompletedOrder; onEdit?: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const payInfo = paymentLines(order)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-0">
        <button
          className="flex-1 flex items-center gap-3 p-4 text-left min-w-0"
          onClick={() => setExpanded(e => !e)}
        >
          <div className="w-2 h-2 bg-green-500 rounded-full shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 dark:text-white text-sm">#{order.order_number}</span>
              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 px-2 py-0.5 rounded-full font-medium">
                Yetkazildi
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{order.client_name}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm text-gray-900 dark:text-white">{formatMoney(order.total_amount)}</p>
            {payInfo.map((p, i) => (
              <p key={i} className={`text-xs font-medium ${p.color}`}>{p.text}</p>
            ))}
          </div>
          {expanded
            ? <ChevronDown size={14} className="text-gray-400 shrink-0 ml-1" />
            : <ChevronRight size={14} className="text-gray-400 shrink-0 ml-1" />}
        </button>

        {onEdit && (
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            className="p-3 mr-1 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 shrink-0"
            title="Tuzatish"
          >
            <Pencil size={15} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
          <div className="flex items-start gap-2">
            <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-500">{order.address_text}</p>
          </div>

          <div className="space-y-1.5">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">{item.product_name} × {item.quantity}</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatMoney(item.price_at_order * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            {(order.containers_delivered ?? 0) > 0 && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2.5 text-center">
                <p className="text-xs text-gray-400">Yetkazildi</p>
                <p className="font-bold text-gray-900 dark:text-white">{order.containers_delivered} ta</p>
              </div>
            )}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2.5 text-center">
              <p className="text-xs text-gray-400">Qaytarildi</p>
              <p className="font-bold text-gray-900 dark:text-white">{order.containers_returned} ta</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2.5 text-center">
              <p className="text-xs text-gray-400">Vaqt</p>
              <p className="font-bold text-gray-900 dark:text-white text-xs">{formatDateTime(order.completed_at)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function HistoryTab() {
  const [search, setSearch] = useState('')
  const [editOrder, setEditOrder] = useState<CompletedOrder | null>(null)
  const { profile } = useAuthStore()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['courier-history'],
    queryFn: async () => {
      const { data } = await api.get('/orders/courier/history')
      return data as CompletedOrder[]
    },
  })

  const orders = data ?? []
  const filtered = search
    ? orders.filter(o =>
        o.client_name.toLowerCase().includes(search.toLowerCase()) ||
        String(o.order_number).includes(search)
      )
    : orders

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 animate-pulse h-16" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Tarixdan qidirish..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">Yakunlangan buyurtmalar</p>
        <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
          {filtered.length} ta
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-400 font-medium">Tarix bo'sh</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <HistoryCard
              key={order.id}
              order={order}
              onEdit={profile?.shift_open ? () => setEditOrder(order) : undefined}
            />
          ))}
        </div>
      )}

      {editOrder && (
        <CourierOrderEditModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={() => {
            setEditOrder(null)
            qc.invalidateQueries({ queryKey: ['courier-history'] })
          }}
        />
      )}
    </div>
  )
}
