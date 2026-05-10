import { useState } from 'react'
import { X, Plus, Minus, Loader2, Banknote, CreditCard, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/api/client'
import type { ActiveOrder } from '@/types'

interface Props {
  order: ActiveOrder
  onClose: () => void
  onCompleted: () => void
}

function formatMoney(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }

export default function CompletionModal({ order, onClose, onCompleted }: Props) {
  const [containers, setContainers] = useState(0)
  const [cashAmount, setCashAmount] = useState(0)
  const [cardAmount, setCardAmount] = useState(0)
  const [paymeAmount, setPaymeAmount] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Track delivered quantities for each item (initialize with ordered quantity)
  const [deliveredQty, setDeliveredQty] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    order.items.forEach(item => {
      initial[item.product_id] = item.quantity
    })
    return initial
  })

  // Calculate actual total based on delivered quantities
  const actualTotal = order.items.reduce((sum, item) => {
    const qty = deliveredQty[item.product_id] ?? item.quantity
    return sum + (qty * item.price_at_order)
  }, 0)

  const discount = Math.max(0, Math.min(discountAmount, actualTotal))
  const payableTotal = actualTotal - discount
  const advanceAvailable = order.client_advance ?? 0
  const advanceUsed = Math.min(advanceAvailable, payableTotal)
  const payableAfterAdvance = payableTotal - advanceUsed
  const totalPaid = cashAmount + cardAmount + paymeAmount
  const debtAmount = Math.max(0, payableAfterAdvance - totalPaid)
  const overpayment = Math.max(0, totalPaid - payableAfterAdvance)

  // Quick-fill buttons fill only the remaining after advance
  const fillAllCash = () => { setCashAmount(payableAfterAdvance); setCardAmount(0); setPaymeAmount(0) }
  const fillAllCard = () => { setCardAmount(payableAfterAdvance); setCashAmount(0); setPaymeAmount(0) }
  const fillAllPayme = () => { setPaymeAmount(payableAfterAdvance); setCashAmount(0); setCardAmount(0) }
  const fillAllDebt = () => { setCashAmount(0); setCardAmount(0); setPaymeAmount(0) }

  const updateDeliveredQty = (productId: string, qty: number) => {
    const item = order.items.find(i => i.product_id === productId)
    if (!item) return
    // Clamp to minimum 0 (can deliver more than ordered)
    const clampedQty = Math.max(0, qty)
    setDeliveredQty(prev => ({ ...prev, [productId]: clampedQty }))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      // Determine payment type
      const paymentType = totalPaid >= actualTotal ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'

      // Build delivered_quantities array
      const deliveredQuantities = order.items.map(item => ({
        product_id: item.product_id,
        delivered_quantity: deliveredQty[item.product_id] ?? item.quantity,
      }))

      await api.post(`/orders/${order.id}/complete`, {
        containers_returned: containers,
        payment_type: paymentType,
        cash_amount: cashAmount,
        card_amount: cardAmount,
        payme_amount: paymeAmount,
        paid_amount: totalPaid,
        discount_amount: discount,
        note: note || undefined,
        delivered_quantities: deliveredQuantities,
      })
      onCompleted()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Xatolik yuz berdi'
      alert(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />

        <motion.div
          className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-gray-900 rounded-t-3xl max-h-[90vh] overflow-y-auto"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              <p className="font-bold text-gray-900 dark:text-white">Buyurtmani yakunlash</p>
              <p className="text-xs text-gray-400">#{order.order_number} · {order.client_name}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"
            >
              <X size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Order summary with quantity adjustment */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Yetkazilgan mahsulotlar</p>
              {order.items.map((item, i) => {
                const qty = deliveredQty[item.product_id] ?? item.quantity
                const itemTotal = qty * item.price_at_order
                return (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-start text-sm">
                      <div className="flex-1">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{item.product_name}</span>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Buyurtma: {item.quantity} dona × {formatMoney(item.price_at_order)}
                        </div>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(itemTotal)}</span>
                    </div>
                    {/* Quantity adjuster */}
                    <div className="flex items-center justify-between bg-white dark:bg-gray-700 rounded-xl px-3 py-2">
                      <span className="text-xs text-gray-500">Yetkazildi:</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateDeliveredQty(item.product_id, qty - 1)}
                          className="w-7 h-7 bg-gray-100 dark:bg-gray-600 rounded-lg flex items-center justify-center active:scale-90"
                          disabled={qty === 0}
                        >
                          <Minus size={12} className="text-gray-600 dark:text-gray-300" />
                        </button>
                        <span className="font-bold text-base w-10 text-center text-gray-900 dark:text-white">
                          {qty}
                        </span>
                        <button
                          onClick={() => updateDeliveredQty(item.product_id, qty + 1)}
                          className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center active:scale-90"
                          disabled={false}
                        >
                          <Plus size={12} className="text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="font-bold text-gray-700 dark:text-gray-300">Mahsulot jami</span>
                <span className="font-bold text-lg text-gray-900 dark:text-white">{formatMoney(actualTotal)}</span>
              </div>
              {/* Discount input */}
              <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded-lg">
                <span className="text-sm text-yellow-700 dark:text-yellow-300 flex-1">Chegirma</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={actualTotal}
                  value={discountAmount || ''}
                  placeholder="0"
                  onChange={e => setDiscountAmount(Math.max(0, Math.min(actualTotal, Number(e.target.value))))}
                  className="w-28 text-right bg-transparent font-semibold text-yellow-700 dark:text-yellow-300 outline-none border-b border-yellow-400 text-sm"
                />
                <span className="text-xs text-yellow-600">so'm</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between items-center text-sm font-bold px-1">
                  <span className="text-gray-700 dark:text-gray-300">To'lov summasi</span>
                  <span className="text-gray-900 dark:text-white">{formatMoney(payableTotal)}</span>
                </div>
              )}
              {advanceUsed > 0 && (
                <div className="flex justify-between items-center text-sm bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                  <span className="text-green-700 dark:text-green-300 font-medium">✅ Avansdan ({formatMoney(advanceAvailable)} mavjud)</span>
                  <span className="font-bold text-green-700 dark:text-green-300">−{formatMoney(advanceUsed)}</span>
                </div>
              )}
              {advanceUsed > 0 && payableAfterAdvance > 0 && (
                <div className="flex justify-between items-center text-sm font-bold px-1">
                  <span className="text-gray-700 dark:text-gray-300">Qolgan to'lov</span>
                  <span className="text-orange-600 dark:text-orange-400">{formatMoney(payableAfterAdvance)}</span>
                </div>
              )}
              {advanceUsed >= payableTotal && payableTotal > 0 && (
                <div className="flex justify-between items-center text-sm font-bold px-1">
                  <span className="text-green-600 dark:text-green-400">Avans bilan to'liq qoplandi</span>
                  <span className="text-green-600 dark:text-green-400">✅</span>
                </div>
              )}
              {order.client_debt > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-red-500">Oldingi qarz</span>
                  <span className="font-semibold text-red-500">{formatMoney(order.client_debt)}</span>
                </div>
              )}
            </div>

            {/* Containers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bo'sh idishlar qaytarish</p>
                {order.client_container_balance > 0 && (
                  <span className="text-xs font-semibold text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">
                    Mijozda: {order.client_container_balance} ta
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-2xl px-3 py-2.5">
                <button
                  onClick={() => setContainers(c => Math.max(0, c - 1))}
                  className="w-8 h-8 bg-white dark:bg-gray-700 rounded-xl flex items-center justify-center shadow-sm active:scale-90"
                >
                  <Minus size={14} className="text-gray-600 dark:text-gray-300" />
                </button>
                <div className="text-center">
                  <span className="font-bold text-lg text-gray-900 dark:text-white">{containers}</span>
                  {order.client_container_balance > 0 && (
                    <p className="text-xs text-gray-400">/ {order.client_container_balance} ta kutilmoqda</p>
                  )}
                </div>
                <button
                  onClick={() => setContainers(c => c + 1)}
                  className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm active:scale-90"
                >
                  <Plus size={14} className="text-white" />
                </button>
              </div>
              {order.client_container_balance > 0 && (
                <button
                  onClick={() => setContainers(order.client_container_balance)}
                  className="mt-2 w-full text-xs text-blue-600 dark:text-blue-400 font-medium py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl"
                >
                  Hammasini qaytardi ({order.client_container_balance} ta)
                </button>
              )}
            </div>

            {/* ── Payment: Quick-fill buttons ── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">To'lov usuli</p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={fillAllCash}
                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 ${
                    cashAmount === payableTotal && cardAmount === 0 && paymeAmount === 0 && payableTotal > 0
                      ? 'bg-green-600 text-white shadow-lg'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <Banknote size={18} />
                  <span>Naqd</span>
                </button>
                <button
                  onClick={fillAllCard}
                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 ${
                    cardAmount === payableTotal && cashAmount === 0 && paymeAmount === 0 && payableTotal > 0
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <CreditCard size={18} />
                  <span>Karta</span>
                </button>
                <button
                  onClick={fillAllPayme}
                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 ${
                    paymeAmount === payableTotal && cashAmount === 0 && cardAmount === 0 && payableTotal > 0
                      ? 'bg-cyan-600 text-white shadow-lg'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <CreditCard size={18} />
                  <span>Payme</span>
                </button>
                <button
                  onClick={fillAllDebt}
                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 ${
                    cashAmount === 0 && cardAmount === 0 && paymeAmount === 0
                      ? 'bg-red-600 text-white shadow-lg'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <AlertTriangle size={18} />
                  <span>Qarz</span>
                </button>
              </div>
            </div>

            {/* ── Split amounts ── */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To'lov summasi</p>

              {/* Cash */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                  <Banknote size={14} /> Naqd pul
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 pr-16"
                    value={cashAmount || ''}
                    placeholder="0"
                    onChange={e => setCashAmount(Math.max(0, Number(e.target.value)))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">so'm</span>
                </div>
              </div>

              {/* Card */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                  <CreditCard size={14} /> Karta (Humo/Uzcard)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-16"
                    value={cardAmount || ''}
                    placeholder="0"
                    onChange={e => setCardAmount(Math.max(0, Number(e.target.value)))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">so'm</span>
                </div>
              </div>

              {/* Payme/Click */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400 mb-1">
                  <CreditCard size={14} /> Payme/Click
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 pr-16"
                    value={paymeAmount || ''}
                    placeholder="0"
                    onChange={e => setPaymeAmount(Math.max(0, Number(e.target.value)))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">so'm</span>
                </div>
              </div>
            </div>

            {/* ── Payment summary ── */}
            <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
              {advanceUsed > 0 && (
                <div className="flex justify-between items-center px-4 py-2.5 bg-green-50 dark:bg-green-900/20">
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Avansdan</span>
                  <span className="font-bold text-green-700 dark:text-green-300">{formatMoney(advanceUsed)}</span>
                </div>
              )}
              {cashAmount > 0 && (
                <div className="flex justify-between items-center px-4 py-2.5 bg-green-50 dark:bg-green-900/20">
                  <span className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-1.5">
                    <Banknote size={14} /> Naqd
                  </span>
                  <span className="font-bold text-green-700 dark:text-green-300">{formatMoney(cashAmount)}</span>
                </div>
              )}
              {cardAmount > 0 && (
                <div className="flex justify-between items-center px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20">
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                    <CreditCard size={14} /> Karta
                  </span>
                  <span className="font-bold text-blue-700 dark:text-blue-300">{formatMoney(cardAmount)}</span>
                </div>
              )}
              {paymeAmount > 0 && (
                <div className="flex justify-between items-center px-4 py-2.5 bg-cyan-50 dark:bg-cyan-900/20">
                  <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                    <CreditCard size={14} /> Payme/Click
                  </span>
                  <span className="font-bold text-cyan-700 dark:text-cyan-300">{formatMoney(paymeAmount)}</span>
                </div>
              )}
              {debtAmount > 0 && (
                <div className="flex justify-between items-center px-4 py-2.5 bg-red-50 dark:bg-red-900/20">
                  <span className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> Qarzga yoziladi
                  </span>
                  <span className="font-bold text-red-700 dark:text-red-300">{formatMoney(debtAmount)}</span>
                </div>
              )}
              {overpayment > 0 && (
                <div className="flex justify-between items-center px-4 py-2.5 bg-yellow-50 dark:bg-yellow-900/20">
                  <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Ortiqcha to'lov</span>
                  <span className="font-bold text-yellow-700 dark:text-yellow-300">{formatMoney(overpayment)}</span>
                </div>
              )}
              {cashAmount === 0 && cardAmount === 0 && paymeAmount === 0 && payableAfterAdvance > 0 && (
                <div className="flex justify-between items-center px-4 py-2.5 bg-red-50 dark:bg-red-900/20">
                  <span className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> To'liq qarzga yoziladi
                  </span>
                  <span className="font-bold text-red-700 dark:text-red-300">{formatMoney(payableAfterAdvance)}</span>
                </div>
              )}
            </div>

            {/* Note */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">📝 Izoh (ixtiyoriy)</p>
              <textarea
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Ixtiyoriy..."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 bg-green-500 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {submitting
                ? <><Loader2 size={18} className="animate-spin" /> Yuborilmoqda...</>
                : '✅ Topshirdim'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
