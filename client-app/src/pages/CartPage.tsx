import { useState } from 'react'
import { Plus, Minus, Trash2, MapPin, ChevronDown, CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/api/client'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { getT } from '@/i18n'
import AddressSheet from '@/components/AddressSheet'

interface Props { onOrderPlaced: () => void }

function formatMoney(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }

type Stage = 'cart' | 'confirm' | 'success'

export default function CartPage({ onOrderPlaced }: Props) {
  const { items, setQty, remove, total, comment, setComment, contactPhone, setContactPhone, selectedAddressId, setAddress, clear } = useCartStore()
  const { profile } = useAuthStore()
  const lang = useAuthStore(s => s.profile?.language)
  const t = getT(lang)
  const [showAddresses, setShowAddresses] = useState(false)
  const [stage, setStage] = useState<Stage>('cart')
  const [placing, setPlacing] = useState(false)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)

  const selectedAddress = profile?.addresses.find(a => a.id === selectedAddressId) ?? profile?.addresses[0]

  const placeOrder = async () => {
    if (!selectedAddress || !contactPhone) return
    setPlacing(true)
    try {
      const { data } = await api.post('/orders/', {
        address_id: selectedAddress.id,
        comment: comment || undefined,
        contact_phone: contactPhone,
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      })
      setOrderId(String(data.id))
      clear()
      setStage('success')
    } catch {
      setOrderError(t.orderError)
    } finally {
      setPlacing(false)
    }
  }

  if (stage === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t.orderSuccess}</h2>
          <p className="text-gray-500 text-sm mb-1">{t.orderNumber}</p>
          <p className="font-mono text-blue-600 font-bold mb-6">#{orderId?.slice(0, 8).toUpperCase()}</p>
          <p className="text-sm text-gray-400 mb-6">{t.orderSuccessDesc}</p>
          <button
            onClick={() => { setStage('cart'); onOrderPlaced() }}
            className="btn-primary-mobile px-6 py-3"
          >
            {t.viewOrders}
          </button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-5xl mb-4">🛒</p>
          <p className="text-gray-400">{t.cartEmpty}</p>
          <p className="text-sm text-gray-300 mt-1">Katalogdan mahsulot qo'shing</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Savat</h1>

      {/* Items */}
      <AnimatePresence>
        {items.map(item => (
          <motion.div
            key={item.product_id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-3 flex items-center gap-3 shadow-sm"
          >
            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
              {item.image_url
                ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover rounded-xl" />
                : <span className="text-2xl">💧</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{item.name}</p>
              <p className="text-blue-600 font-bold text-sm">{formatMoney(item.price)}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                <button onClick={() => setQty(item.product_id, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center rounded-lg bg-white dark:bg-gray-600 active:scale-90">
                  <Minus size={12} />
                </button>
                <span className="w-5 text-center text-sm font-bold">{item.quantity}</span>
                <button onClick={() => setQty(item.product_id, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center rounded-lg bg-blue-600 text-white active:scale-90">
                  <Plus size={12} />
                </button>
              </div>
              <button onClick={() => remove(item.product_id)} className="text-gray-300 hover:text-red-400 active:scale-90">
                <Trash2 size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Address selector */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 mb-2">{t.address}</p>
        <button
          onClick={() => setShowAddresses(true)}
          className="w-full flex items-center gap-2.5 text-left"
        >
          <MapPin size={18} className="text-blue-500 shrink-0" />
          {selectedAddress
            ? (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedAddress.label}</p>
                <p className="text-xs text-gray-400 truncate">{selectedAddress.address_text}</p>
              </div>
            )
            : <span className="text-sm text-gray-400 flex-1">{t.noAddress}</span>}
          <ChevronDown size={16} className="text-gray-400 shrink-0" />
        </button>
      </div>

      {/* Phone number */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 mb-2">Bog'lanish uchun telefon raqam *</p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">+998</span>
          <input
            type="tel"
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
            placeholder="90 500 50 50"
            value={contactPhone}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 9)
              const formatted = val.replace(/(\d{2})(\d{0,3})(\d{0,2})(\d{0,2})/, (_, a, b, c, d) => {
                let result = a
                if (b) result += ' ' + b
                if (c) result += ' ' + c
                if (d) result += ' ' + d
                return result
              })
              setContactPhone(formatted)
            }}
          />
        </div>
      </div>

      {/* Comment */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 mb-2">{t.comment}</p>
        <textarea
          className="w-full text-sm bg-transparent outline-none resize-none text-gray-700 dark:text-gray-300 placeholder-gray-300"
          rows={2}
          placeholder="Kuryer uchun izoh (ixtiyoriy)..."
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
      </div>

      {/* Total + Order */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{t.total}</span>
          <span className="text-xl font-bold text-gray-900 dark:text-white">{formatMoney(total())}</span>
        </div>
        {orderError && (
          <div className="mb-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
            {orderError}
          </div>
        )}
        <button
          onClick={() => { setOrderError(null); placeOrder() }}
          disabled={placing || !selectedAddress || !contactPhone || contactPhone.replace(/\s/g, '').length < 9}
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {placing ? t.placing : t.placeOrder}
        </button>
      </div>

      {showAddresses && profile && (
        <AddressSheet
          addresses={profile.addresses}
          selectedId={selectedAddressId ?? profile.addresses[0]?.id}
          onSelect={id => { setAddress(id); setShowAddresses(false) }}
          onClose={() => setShowAddresses(false)}
        />
      )}
    </div>
  )
}
