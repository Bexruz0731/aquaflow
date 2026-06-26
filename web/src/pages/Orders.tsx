import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Printer, Download, ChevronDown, X, Trash2, Edit2 } from 'lucide-react'
import { clsx } from 'clsx'
import { OrderStatusBadge, PaymentStatusText } from '@/utils/orderStatus'
import { formatMoney, formatDateTime } from '@/utils/format'
import Pagination from '@/components/ui/Pagination'
import { keepPreviousData } from '@tanstack/react-query'
import api from '@/api/client'
import { useAuthStore } from '@/store/auth'
import type { Order } from '@/types'

function paymentInfo(o: Order): { text: string; color: string }[] {
  const lines: { text: string; color: string }[] = []
  if (o.advance_used > 0)  lines.push({ text: `Avans: ${formatMoney(o.advance_used)}`,  color: 'text-blue-500' })
  if (o.card_amount > 0)   lines.push({ text: `Karta: ${formatMoney(o.card_amount)}`,   color: 'text-purple-500' })
  if (o.payme_amount > 0)  lines.push({ text: `Payme: ${formatMoney(o.payme_amount)}`,  color: 'text-indigo-500' })
  if (o.cash_amount > 0)   lines.push({ text: `Naqd: ${formatMoney(o.cash_amount)}`,    color: 'text-green-600' })
  if (o.debt_amount > 0)   lines.push({ text: `Qarz: ${formatMoney(o.debt_amount)}`,    color: 'text-red-500' })
  if (lines.length === 0) {
    if (o.payment_status === 'tolanmagan' && o.total_amount > 0)
      lines.push({ text: `Qarz: ${formatMoney(o.total_amount)}`, color: 'text-red-500' })
    else if (o.total_amount === 0)
      lines.push({ text: "Avans (to'liq)", color: 'text-blue-500' })
  }
  return lines
}

const STATUS_TABS = [
  { key: null,              label: 'Barcha',       count_key: 'total' },
  { key: 'yetkazildi',     label: 'Yetkazildi',   color: 'text-green-600' },
  { key: 'yolda',          label: "Yo'lda",        color: 'text-yellow-600' },
  { key: 'bekor_qilindi',  label: 'Bekor qilindi', color: 'text-red-600' },
] as const

// ── Delete Preview Modal ───────────────────────────────────────────────────────

function DeletePreviewModal({ orderId, onClose, onDeleted }: { orderId: number; onClose: () => void; onDeleted: () => void }) {
  const [preview, setPreview] = useState<{ changes: { label: string }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get(`/orders/${orderId}/delete-preview`)
      .then(r => setPreview(r.data))
      .catch(e => setError(e?.response?.data?.detail ?? 'Xatolik'))
      .finally(() => setLoading(false))
  }, [orderId])

  const doDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await api.delete(`/orders/${orderId}`)
      onDeleted()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white text-red-600">Buyurtma #{orderId} o'chirish</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {loading && <p className="text-center text-gray-400 py-4">Yuklanmoqda...</p>}
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          {preview && (
            <>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Quyidagi o'zgarishlar bo'ladi:</p>
              <div className="space-y-2">
                {preview.changes.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span className="text-gray-700 dark:text-gray-300">{c.label}</span>
                  </div>
                ))}
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">
                <p className="text-xs text-red-600 font-medium">Bu amal qaytarib bo'lmaydi. Davom etasizmi?</p>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-3 p-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="btn btn-secondary flex-1">Bekor</button>
          <button
            onClick={doDelete}
            disabled={!preview || deleting}
            className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {deleting ? 'O\'chirilmoqda...' : 'O\'chirish'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Order Modal ───────────────────────────────────────────────────────────

interface EditItem { product_id: string; quantity: number; product_name?: string | null; price?: number }
interface EditPreview { old_total: number; new_total: number; old_payable: number; new_payable: number; delta: number; changes: { label: string }[] }

function EditOrderModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const [clients, setClients] = useState<{ id: string; display_name?: string | null; phone: string; addresses?: { address_text: string; is_primary: boolean }[] }[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [products, setProducts] = useState<{ id: string; name: string; price: number }[]>([])
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [editDropdownStyle, setEditDropdownStyle] = useState<React.CSSProperties>({})
  const editProductBtnRef = useRef<HTMLButtonElement>(null)

  const [clientId, setClientId] = useState<string>(order.client_id ?? '')
  const [clientName, setClientName] = useState<string>(order.client_name ?? '')
  const [addressText, setAddressText] = useState<string>(order.address_text ?? order.walkin_address ?? '')
  const [items, setItems] = useState<EditItem[]>(
    order.items?.map(i => ({ product_id: i.product_id ?? '', quantity: i.quantity, product_name: i.product_name, price: i.price_at_order })) ?? []
  )
  const [discountAmount, setDiscountAmount] = useState<string>(String(order.discount_amount ?? 0))
  const [comment, setComment] = useState<string>(order.comment ?? '')

  const [preview, setPreview] = useState<EditPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'edit' | 'preview'>('edit')

  useEffect(() => {
    api.get('/products/', { params: { per_page: 200 } }).then(({ data }) => {
      setProducts(Array.isArray(data) ? data : (data?.items || []))
    })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!clientSearch) return
      api.get('/clients/', { params: { search: clientSearch, per_page: 30 } }).then(({ data }) => {
        setClients(Array.isArray(data) ? data : (data?.items || []))
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [clientSearch])

  const addItem = (p: { id: string; name: string; price: number }) => {
    const existing = items.find(i => i.product_id === p.id)
    if (existing) {
      setItems(items.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setItems([...items, { product_id: p.id, quantity: 1, product_name: p.name, price: p.price }])
    }
    setShowProductDropdown(false)
  }

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))
  const updateQty = (idx: number, qty: number) => setItems(items.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, qty) } : it))

  const buildPayload = () => ({
    client_id: clientId || undefined,
    address_text: addressText || undefined,
    items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
    discount_amount: parseInt(discountAmount) || 0,
    comment: comment || undefined,
  })

  const loadPreview = async () => {
    if (items.length === 0) { setError('Kamida 1 ta mahsulot bo\'lishi kerak'); return }
    setPreviewLoading(true)
    setError(null)
    try {
      const r = await api.post(`/orders/${order.id}/edit-preview`, buildPayload())
      setPreview(r.data)
      setStep('preview')
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setPreviewLoading(false)
    }
  }

  const doSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/orders/${order.id}/edit`, buildPayload())
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
      setSaving(false)
    }
  }

  const newTotal = items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0)
  const discount = parseInt(discountAmount) || 0
  const payable = Math.max(0, newTotal - discount)

  if (step === 'preview' && preview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white">O'zgarishlarni tasdiqlash</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"><X size={16} /></button>
          </div>
          <div className="p-4 space-y-3">
            {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Moliyaviy o'zgarishlar:</p>
            <div className="space-y-2">
              {preview.changes.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span className="text-gray-700 dark:text-gray-300">{c.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 p-4 border-t border-gray-100 dark:border-gray-700">
            <button onClick={() => setStep('edit')} className="btn btn-secondary flex-1">Orqaga</button>
            <button onClick={doSave} disabled={saving} className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
              {saving ? 'Saqlanmoqda...' : 'Tasdiqlash'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl shadow-xl max-h-[92vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">Buyurtma #{order.id} tahrirlash</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

          {/* Client */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mijoz</label>
            <input
              type="text"
              value={clientId ? clientName : clientSearch}
              onChange={e => { setClientSearch(e.target.value); setClientId(''); setClientName(''); setShowClientDropdown(true) }}
              onFocus={() => setShowClientDropdown(true)}
              placeholder="Ism yoki telefon..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
            {showClientDropdown && !clientId && clients.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {clients.map(c => (
                  <button key={c.id} type="button"
                    onClick={() => { setClientId(c.id); setClientName(c.display_name ?? c.addresses?.find(a => a.is_primary)?.address_text ?? c.addresses?.[0]?.address_text ?? c.phone); setShowClientDropdown(false) }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-600 text-sm border-b border-gray-100 dark:border-gray-600 last:border-0"
                  >
                    <span className="font-medium">{c.display_name ?? c.addresses?.find(a => a.is_primary)?.address_text ?? c.addresses?.[0]?.address_text ?? c.phone}</span>
                    <span className="text-gray-400 ml-2">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Manzil</label>
            <input
              type="text"
              value={addressText}
              onChange={e => setAddressText(e.target.value)}
              placeholder="Yetkazib berish manzili"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mahsulotlar</label>
              <div className="relative">
                <button ref={editProductBtnRef} type="button" onClick={() => {
                  if (showProductDropdown) { setShowProductDropdown(false); return }
                  if (editProductBtnRef.current) {
                    const rect = editProductBtnRef.current.getBoundingClientRect()
                    const style: React.CSSProperties = {
                      position: 'fixed',
                      right: window.innerWidth - rect.right,
                      width: Math.min(288, window.innerWidth - 16),
                      zIndex: 9999,
                    }
                    if (window.innerHeight - rect.bottom < 260) {
                      style.bottom = window.innerHeight - rect.top + 4
                    } else {
                      style.top = rect.bottom + 4
                    }
                    setEditDropdownStyle(style)
                  }
                  setShowProductDropdown(true)
                }}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <Plus size={14} /> Qo'shish
                </button>
                {showProductDropdown && (
                  <>
                    <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setShowProductDropdown(false)} />
                    <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto" style={editDropdownStyle}>
                      {products.map(p => (
                        <button key={p.id} type="button" onClick={() => addItem(p)}
                          className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-600 border-b border-gray-100 dark:border-gray-600 last:border-0">
                          <div className="font-medium text-sm text-gray-900 dark:text-white">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.price.toLocaleString()} so'm</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const prod = products.find(p => p.id === item.product_id)
                const name = item.product_name || prod?.name || 'Mahsulot'
                const price = item.price || prod?.price || 0
                return (
                  <div key={idx} className="flex gap-2 items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">{name}</p>
                      <p className="text-xs text-gray-500">{(price * item.quantity).toLocaleString()} so'm</p>
                    </div>
                    <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                      <button type="button" onClick={() => updateQty(idx, item.quantity - 1)}
                        className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600">−</button>
                      <input
                        type="text" inputMode="numeric" value={item.quantity}
                        onChange={e => { const v = parseInt(e.target.value.replace(/\D/g, '')); if (!isNaN(v)) updateQty(idx, v) }}
                        className="w-10 text-center py-1.5 bg-white dark:bg-gray-700 text-sm outline-none"
                      />
                      <button type="button" onClick={() => updateQty(idx, item.quantity + 1)}
                        className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600">+</button>
                    </div>
                    <button onClick={() => removeItem(idx)} className="px-2 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                      <X size={16} />
                    </button>
                  </div>
                )
              })}
              {items.length === 0 && <p className="text-center text-gray-400 py-3 text-sm">Mahsulot qo'shing</p>}
            </div>
          </div>

          {/* Discount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chegirma (so'm)</label>
            <input
              type="text" inputMode="numeric"
              value={discountAmount}
              onChange={e => setDiscountAmount(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Izoh</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm resize-none"
            />
          </div>

          {/* Summary */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Jami:</span><span className="font-semibold">{formatMoney(newTotal)}</span></div>
            {discount > 0 && <div className="flex justify-between"><span className="text-gray-500">Chegirma:</span><span className="text-yellow-600 font-semibold">−{formatMoney(discount)}</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">To'lov:</span><span className="font-bold text-blue-600">{formatMoney(payable)}</span></div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="btn btn-secondary flex-1">Bekor</button>
          <button onClick={loadPreview} disabled={previewLoading || items.length === 0}
            className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
            {previewLoading ? 'Tekshirilmoqda...' : 'Davom etish'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Assign Courier Modal ───────────────────────────────────────────────────────

function AssignCourierModal({ orderId, onClose, onDone }: { orderId: number; onClose: () => void; onDone: () => void }) {
  const [couriers, setCouriers] = useState<{ id: string; first_name: string; last_name: string | null; car_number: string; shift_status: string }[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/couriers/').then(({ data }) => {
      const items = Array.isArray(data) ? data : (data?.items || [])
      setCouriers(items)
    }).catch(() => setCouriers([]))
  }, [])

  const assign = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/assign`, { courier_id: selected })
      onDone()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">Kuryer tayinlash</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          {couriers.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">Faol kuryerlar yo'q</p>}
          {couriers.map(c => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
            return (
              <button key={c.id} onClick={() => setSelected(c.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-colors text-left ${
                  selected === c.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{name}</p>
                  {c.car_number && <p className="text-xs text-gray-400">{c.car_number}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.shift_status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.shift_status === 'open' ? 'Ochiq' : 'Yopiq'}
                  </span>
                  {selected === c.id && <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center"><div className="w-2 h-2 bg-white rounded-full" /></div>}
                </div>
              </button>
            )
          })}
        </div>
        <div className="flex gap-3 p-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="btn btn-secondary flex-1">Bekor</button>
          <button onClick={assign} disabled={!selected || saving} className="btn btn-primary flex-1">
            {saving ? 'Tayinlanmoqda...' : 'Tayinlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Order Actions Menu ─────────────────────────────────────────────────────────

function OrderActionsMenu({
  onView, onAssign, onDelete, onEdit, isBoshliq, canEdit
}: {
  onView: () => void; onAssign: () => void; onDelete: () => void; onEdit: () => void; isBoshliq: boolean; canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const menuHeight = canEdit ? 160 : 120
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4
      setMenuPos({ top, right: window.innerWidth - rect.right })
    }
    setOpen(o => !o)
  }

  return (
    <div className="relative">
      <button ref={btnRef} onClick={handleOpen}
        className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
        •••
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-40"
            style={{ top: menuPos.top, right: menuPos.right }}>
            <button onClick={() => { setOpen(false); onView() }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
              Ko'rish
            </button>
            <button onClick={() => { setOpen(false); onAssign() }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
              Kuryer tayinlash
            </button>
            {canEdit && (
              <button onClick={() => { setOpen(false); onEdit() }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Edit2 size={14} /> Tahrirlash
              </button>
            )}
            {isBoshliq && (
              <button onClick={() => { setOpen(false); onDelete() }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Trash2 size={14} /> O'chirish
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Create Order Modal ─────────────────────────────────────────────────────────

function CreateOrderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [clients, setClients] = useState<{ id: string; display_name?: string | null; phone: string; debt_amount?: number; addresses?: { address_text: string; is_primary: boolean }[] }[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientsTotal, setClientsTotal] = useState(0)
  const [products, setProducts] = useState<{ id: string; name: string; price: number }[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const createProductBtnRef = useRef<HTMLButtonElement>(null)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [items, setItems] = useState<{ product_id: string; quantity: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setClientsLoading(true)
      api.get('/clients/', { params: { search: clientSearch || undefined, per_page: 50, sort_by: 'address' } })
        .then(({ data }) => {
          const clientList = data.items || []
          setClients(Array.isArray(clientList) ? clientList : [])
          setClientsTotal(data.total ?? clientList.length)
        })
        .catch(() => setError('Mijozlarni yuklashda xatolik'))
        .finally(() => setClientsLoading(false))
    }, clientSearch ? 300 : 0)
    return () => clearTimeout(timer)
  }, [clientSearch])

  useEffect(() => {
    setProductsLoading(true)
    api.get('/products/').then(({ data }) => {
      setProducts(Array.isArray(data) ? data : (data?.items || []))
      setProductsLoading(false)
    }).catch(() => {
      setError('Mahsulotlarni yuklashda xatolik')
      setProductsLoading(false)
    })
  }, [])

  const selectedClient = clients.find(c => c.id === clientId)

  const addItem = (productId: string) => {
    setItems([...items, { product_id: productId, quantity: 1 }])
    setShowProductDropdown(false)
  }

  const toggleProductDropdown = () => {
    if (products.length === 0) { setError("Mahsulotlar yuklanmagan"); return }
    if (showProductDropdown) { setShowProductDropdown(false); return }
    if (createProductBtnRef.current) {
      const rect = createProductBtnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const style: React.CSSProperties = {
        position: 'fixed',
        right: window.innerWidth - rect.right,
        width: Math.min(320, window.innerWidth - 16),
        zIndex: 9999,
      }
      if (spaceBelow < 260) {
        style.bottom = window.innerHeight - rect.top + 4
      } else {
        style.top = rect.bottom + 4
      }
      setDropdownStyle(style)
    }
    setShowProductDropdown(true)
  }

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index))

  const updateItem = (index: number, field: 'product_id' | 'quantity', value: string | number) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const createOrder = async () => {
    if (!clientId || items.length === 0) { setError("Mijoz va mahsulotlarni tanlang"); return }
    if (!deliveryAddress.trim()) { setError("Yetkazib berish manzilini kiriting"); return }
    setSaving(true)
    setError(null)
    try {
      await api.post('/orders/', {
        client_id: clientId,
        items: items,
        is_phone_order: true,
        delivery_address: deliveryAddress.trim(),
      })
      onDone()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl shadow-xl max-h-[92vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">Yangi buyurtma yaratish</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Mijoz {clientsLoading ? <span className="text-xs text-gray-400">...</span> : clientsTotal > 0 && <span className="text-xs text-gray-500">({clientsTotal} ta{clientsTotal > 50 ? `, 50 ta ko'rsatilmoqda` : ''})</span>}
            </label>
            <input
              type="text"
              value={selectedClient ? `${selectedClient.display_name ?? selectedClient.addresses?.find(a => a.is_primary)?.address_text ?? selectedClient.addresses?.[0]?.address_text ?? selectedClient.phone} (${selectedClient.phone})` : clientSearch}
              onChange={(e) => { setClientSearch(e.target.value); setClientId(''); setShowClientDropdown(true) }}
              onFocus={() => setShowClientDropdown(true)}
              placeholder="Ism yoki telefon raqam kiriting..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
            />
            {showClientDropdown && !clientId && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {clients.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                    {clientSearch ? 'Mijoz topilmadi' : 'Mijozlar yuklanmoqda...'}
                  </div>
                ) : clients.map(c => {
                  const primaryAddr = c.addresses?.find(a => a.is_primary) || c.addresses?.[0]
                  return (
                    <button key={c.id} type="button"
                      onClick={() => { setClientId(c.id); setShowClientDropdown(false); setClientSearch(''); if (primaryAddr?.address_text) setDeliveryAddress(primaryAddr.address_text) }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-600 border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{c.display_name ?? c.addresses?.find(a => a.is_primary)?.address_text ?? c.addresses?.[0]?.address_text ?? c.phone}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {(c.debt_amount ?? 0) > 0 && (
                            <span className="text-xs font-bold text-red-500">Qarz: {formatMoney(c.debt_amount!)}</span>
                          )}
                          <span className="text-xs text-gray-400">{c.phone}</span>
                        </div>
                      </div>
                      {primaryAddr && <div className="text-xs text-gray-500 mt-0.5 truncate">{primaryAddr.address_text}</div>}
                    </button>
                  )
                })}
              </div>
            )}
            {clientId && selectedClient && (
              <button type="button" onClick={() => { setClientId(''); setClientSearch('') }}
                className="absolute right-2 top-9 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            )}
          </div>
          {clientId && selectedClient && (selectedClient.debt_amount ?? 0) > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm">
              <span className="text-red-500">⚠</span>
              <span className="text-red-700 dark:text-red-400">Bu mijozning qarzi bor:</span>
              <span className="font-bold text-red-600 dark:text-red-400">{formatMoney(selectedClient.debt_amount!)}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Yetkazib berish manzili</label>
            <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Masalan: Chilonzor tumani, Bunyodkor ko'chasi, 12-uy, 5-kvartira"
              rows={3} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Mahsulotlar {productsLoading && <span className="text-xs text-gray-400">(yuklanmoqda...)</span>}
                {!productsLoading && products.length > 0 && <span className="text-xs text-green-400">({products.length} ta)</span>}
              </label>
              <div className="relative">
                <button ref={createProductBtnRef} type="button" onClick={toggleProductDropdown} disabled={productsLoading || products.length === 0}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-50">
                  <Plus size={14} /> Qo'shish
                </button>
                {showProductDropdown && (
                  <>
                    <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setShowProductDropdown(false)} />
                    <div className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto" style={dropdownStyle}>
                      {products.map(p => (
                        <button key={p.id} type="button" onClick={() => addItem(p.id)}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-600 border-b border-gray-100 dark:border-gray-600 last:border-b-0">
                          <div className="font-medium text-gray-900 dark:text-white">{p.name}</div>
                          <div className="text-sm text-gray-500">{p.price.toLocaleString()} so'm</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {items.map((item, index) => {
                const product = products.find(p => p.id === item.product_id)
                return (
                  <div key={index} className="flex gap-2 items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{product?.name ?? 'Mahsulot'}</p>
                      <p className="text-xs text-gray-500">{product?.price.toLocaleString()} so'm</p>
                    </div>
                    <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                      <button type="button" onClick={() => updateItem(index, 'quantity', Math.max(1, item.quantity - 1))}
                        className="px-3 py-2 text-lg font-medium text-gray-600 hover:bg-gray-100 select-none">−</button>
                      <input type="text" inputMode="numeric" value={item.quantity === 0 ? '' : item.quantity}
                        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); updateItem(index, 'quantity', v === '' ? 0 : parseInt(v)) }}
                        onBlur={(e) => { if (!e.target.value || parseInt(e.target.value) < 1) updateItem(index, 'quantity', 1) }}
                        className="w-10 text-center py-2 bg-white dark:bg-gray-700 text-sm outline-none" />
                      <button type="button" onClick={() => updateItem(index, 'quantity', item.quantity + 1)}
                        className="px-3 py-2 text-lg font-medium text-gray-600 hover:bg-gray-100 select-none">+</button>
                    </div>
                    <button onClick={() => removeItem(index)} className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                      <X size={16} />
                    </button>
                  </div>
                )
              })}
              {items.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">Mahsulot qo'shing</p>}
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="btn btn-secondary flex-1">Bekor</button>
          <button onClick={createOrder} disabled={saving || !clientId || items.length === 0} className="btn btn-primary flex-1">
            {saving ? 'Saqlanmoqda...' : 'Yaratish'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Orders Page ───────────────────────────────────────────────────────────

export default function Orders() {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [todayOnly, setTodayOnly] = useState(false)
  const [walkinOnly, setWalkinOnly] = useState(false)
  const [volumeFilter, setVolumeFilter] = useState<'all' | 'small' | 'large'>('all')
  const [courierFilter, setCourierFilter] = useState<string | null>(null)
  const [showCourierMenu, setShowCourierMenu] = useState(false)
  const [couriers, setCouriers] = useState<{ id: string; name: string }[]>([])
  const courierMenuRef = useRef<HTMLDivElement>(null)

  const authUser = useAuthStore(s => s.user)
  const isBoshliq = authUser?.role === 'boshliq' || authUser?.role === 'super_admin'
  const canEdit = isBoshliq || authUser?.role === 'operator'

  useEffect(() => {
    api.get('/couriers/').then(({ data }) => {
      const list = Array.isArray(data) ? data : data.items ?? []
      setCouriers(list.map((c: any) => ({
        id: c.id,
        name: c.first_name ? `${c.first_name} ${c.last_name ?? ''}`.trim() : c.phone ?? c.id,
      })))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (courierMenuRef.current && !courierMenuRef.current.contains(e.target as Node)) {
        setShowCourierMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: countsData } = useQuery({
    queryKey: ['orders-counts', todayOnly],
    queryFn: () => Promise.all([
      api.get('/orders/', { params: { page: 1, per_page: 1, today_only: todayOnly } }).then(r => r.data.total ?? 0),
      api.get('/orders/', { params: { page: 1, per_page: 1, status: 'yetkazildi', today_only: todayOnly } }).then(r => r.data.total ?? 0),
      api.get('/orders/', { params: { page: 1, per_page: 1, status: 'yolda', today_only: todayOnly } }).then(r => r.data.total ?? 0),
      api.get('/orders/', { params: { page: 1, per_page: 1, status: 'bekor_qilindi', today_only: todayOnly } }).then(r => r.data.total ?? 0),
    ]).then(([total, yetkazildi, yolda, bekor]) => ({ total, yetkazildi, yolda, bekor })),
    refetchInterval: 15000,
  })
  const counts = countsData ?? { total: 0, yetkazildi: 0, yolda: 0, bekor: 0 }

  const [viewOrder, setViewOrder] = useState<Order | null>(null)
  const [assignOrderId, setAssignOrderId] = useState<number | null>(null)
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, perPage, search, statusFilter, todayOnly, walkinOnly, volumeFilter, courierFilter],
    queryFn: () => api.get('/orders/', {
      params: {
        page, per_page: perPage,
        search: search || undefined,
        status: statusFilter || undefined,
        today_only: todayOnly,
        is_walkin: walkinOnly || undefined,
        volume_filter: volumeFilter !== 'all' ? volumeFilter : undefined,
        courier_id: courierFilter || undefined,
      },
    }).then(r => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  })

  const orders: Order[] = data?.items ?? []

  const handleTabChange = (isToday: boolean) => {
    setTodayOnly(isToday)
    // Reset volume filter when switching to Today tab
    if (isToday) setVolumeFilter('all')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Buyurtmalar</h1>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary gap-2">
          <Plus size={16} />
          <span className="hidden sm:inline">Yangi buyurtma</span>
        </button>
      </div>

      {/* Day tabs + volume filter buttons */}
      <div className="overflow-x-auto">
      <div className="flex flex-nowrap items-center gap-2 border-b border-gray-200 dark:border-gray-800 min-w-max">
        {[{ label: 'Bugungi buyurtmalar', today: true }, { label: 'Barcha buyurtmalar', today: false }].map(t => (
          <button
            key={String(t.today)}
            onClick={() => handleTabChange(t.today)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              todayOnly === t.today
                ? 'border-[#0f0f23] text-gray-900 dark:text-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {t.label}
          </button>
        ))}

        {/* Volume filter — only visible under "Barcha" */}
        {!todayOnly && (
          <div className="flex items-center gap-1 ml-auto pb-1">
            {([
              { key: 'all', label: 'Barchasi' },
              { key: 'small', label: '5L va 10L' },
              { key: 'large', label: '18.9L' },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => { setVolumeFilter(f.key); setPage(1) }}
                className={clsx(
                  'px-3 py-1 text-xs font-medium rounded-lg transition-colors',
                  volumeFilter === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Status filter cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUS_TABS.map(tab => {
          const count = tab.key === null ? counts.total : tab.key === 'yetkazildi' ? counts.yetkazildi : tab.key === 'yolda' ? counts.yolda : counts.bekor
          return (
            <button
              key={String(tab.key)}
              onClick={() => { setStatusFilter(tab.key); setPage(1) }}
              className={clsx('card text-left transition-all', statusFilter === tab.key && 'ring-2 ring-[#0f0f23]')}
            >
              <p className="text-xs text-gray-500 mb-1">{tab.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="card">
        {/* Search — full width on mobile */}
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 mb-3">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Mijozlarni qidirish..."
            className="bg-transparent text-sm outline-none flex-1 placeholder-gray-400 min-w-0"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1) }} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X size={14} />
            </button>
          )}
        </div>
        {/* Filter buttons — scrollable on mobile */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => { setWalkinOnly(!walkinOnly); setPage(1) }}
            className={clsx('btn-secondary gap-1.5 text-sm whitespace-nowrap', walkinOnly && 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 border-orange-300')}
          >
            ⚡ Tez sotuv
          </button>
          {/* Courier filter dropdown — outside overflow container to prevent clipping */}
          <div className="relative" ref={courierMenuRef}>
            <button
              onClick={() => setShowCourierMenu(v => !v)}
              className={clsx('btn-secondary gap-1.5 text-sm whitespace-nowrap flex items-center', courierFilter && 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 border-blue-300')}
            >
              {courierFilter ? (couriers.find(c => c.id === courierFilter)?.name ?? 'Kuryer') : 'Yetkazib beruvchi'}
              <ChevronDown size={14} />
            </button>
            {showCourierMenu && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl min-w-[190px] py-1 max-h-64 overflow-y-auto">
                <button
                  onClick={() => { setCourierFilter(null); setShowCourierMenu(false); setPage(1) }}
                  className={clsx('w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700', !courierFilter && 'font-semibold text-blue-600')}
                >
                  Barchasi
                </button>
                {couriers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setCourierFilter(c.id); setShowCourierMenu(false); setPage(1) }}
                    className={clsx('w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700', courierFilter === c.id && 'font-semibold text-blue-600')}
                  >
                    {c.name}
                  </button>
                ))}
                {couriers.length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-400">Kuryerlar yo'q</p>
                )}
              </div>
            )}
          </div>
          <button className="btn-secondary gap-1.5 text-sm whitespace-nowrap flex items-center">
            <Printer size={15} />
            <span className="hidden sm:inline">Chop etish</span>
          </button>
          <button className="btn-secondary gap-1.5 text-sm whitespace-nowrap flex items-center">
            <Download size={15} />
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>

        {/* Mobile card view */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 space-y-2 animate-pulse">
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-32" />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-48" />
              </div>
            ))
          ) : orders.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">Buyurtmalar topilmadi</div>
          ) : orders.map(order => (
            <div key={order.id} onClick={() => setViewOrder(order)} className="p-3 cursor-pointer active:bg-gray-50 dark:active:bg-gray-800/50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">#{order.id}</span>
                    {order.is_walkin && <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 px-1.5 py-0.5 rounded-full">Tez sotuv</span>}
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {order.is_walkin && !order.client_id
                      ? (order.walkin_store || order.walkin_phone || 'Tez sotuv')
                      : (order.client_name ?? order.walkin_address ?? '—')}
                  </p>
                  {(order.client_phone || order.walkin_phone) && (
                    <p className="text-xs text-gray-400">{order.client_phone || order.walkin_phone}</p>
                  )}
                  {order.address_text && <p className="text-xs text-gray-400 truncate mt-0.5">{order.address_text}</p>}
                  {order.courier_name && <p className="text-xs text-blue-500 mt-0.5">{order.courier_name}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div onClick={e => e.stopPropagation()}>
                    <OrderActionsMenu
                      isBoshliq={isBoshliq}
                      canEdit={canEdit}
                      onView={() => setViewOrder(order)}
                      onAssign={() => setAssignOrderId(order.id)}
                      onDelete={() => setDeleteOrderId(order.id)}
                      onEdit={() => setEditOrder(order)}
                    />
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{formatMoney(order.total_amount)}</p>
                  {order.discount_amount > 0 && <p className="text-xs text-yellow-600">−{formatMoney(order.discount_amount)}</p>}
                  {paymentInfo(order).map((p, i) => (
                    <p key={i} className={`text-xs ${p.color}`}>{p.text}</p>
                  ))}
                  <p className="text-xs text-gray-400">{formatDateTime(order.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['ID', 'Mijoz', 'Mahsulotlar', 'Manzil', 'Holat', 'Kuryer', "Jami", 'Chegirma', 'Avans', "To'lov", 'Sana', ''].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <td key={j} className="table-cell">
                        <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-400">
                    Buyurtmalar topilmadi
                  </td>
                </tr>
              ) : (
                orders.map(order => (
                  <tr key={order.id} className="table-row-hover cursor-pointer" onClick={() => setViewOrder(order)}>
                    <td className="table-cell font-medium">
                      <div className="flex items-center gap-1.5">
                        #{order.id}
                        {order.is_walkin && (
                          <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            Tez sotuv
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {order.is_walkin
                          ? (order.walkin_store || order.walkin_phone || 'Tez sotuv')
                          : (order.client_name ?? (order.client_id ? order.client_id.slice(0, 8) + '...' : '—'))}
                      </span>
                      {order.is_walkin
                        ? order.walkin_phone && <p className="text-xs text-gray-400">{order.walkin_phone}</p>
                        : order.client_phone && <p className="text-xs text-gray-400">{order.client_phone}</p>}
                    </td>
                    <td className="table-cell">
                      <span className="text-sm">
                        {(order.items?.reduce((s, i) => s + (i.delivered_quantity ?? i.quantity), 0) ?? 0)} ta
                      </span>
                    </td>
                    <td className="table-cell text-gray-500 text-sm truncate max-w-32">
                      {order.address_text ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-cell">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="table-cell text-sm text-gray-500">
                      {order.courier_name ?? (order.courier_id ? <span className="badge badge-info">Tayinlangan</span> : <span className="text-gray-300">Biriktirilmagan</span>)}
                    </td>
                    <td className="table-cell">
                      <p className="font-medium text-red-600">{formatMoney(order.total_amount)}</p>
                      {paymentInfo(order).map((p, i) => (
                        <p key={i} className={`text-xs ${p.color}`}>{p.text}</p>
                      ))}
                    </td>
                    <td className="table-cell">
                      {order.discount_amount > 0
                        ? <span className="text-yellow-600 font-medium">−{formatMoney(order.discount_amount)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-cell">
                      {order.advance_used > 0
                        ? <span className="text-green-600 font-medium">{formatMoney(order.advance_used)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-cell">
                      <PaymentStatusText status={order.payment_status} />
                    </td>
                    <td className="table-cell text-sm text-gray-500">{formatDateTime(order.created_at)}</td>
                    <td className="table-cell" onClick={e => e.stopPropagation()}>
                      <OrderActionsMenu
                        isBoshliq={isBoshliq}
                        canEdit={canEdit}
                        onView={() => setViewOrder(order)}
                        onAssign={() => setAssignOrderId(order.id)}
                        onDelete={() => setDeleteOrderId(order.id)}
                        onEdit={() => setEditOrder(order)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && (
          <Pagination
            page={page}
            pages={data.pages}
            perPage={perPage}
            total={data.total}
            onPageChange={setPage}
            onPerPageChange={(n) => { setPerPage(n); setPage(1) }}
          />
        )}
      </div>

      {/* Modals */}
      {assignOrderId && (
        <AssignCourierModal
          orderId={assignOrderId}
          onClose={() => setAssignOrderId(null)}
          onDone={() => { setAssignOrderId(null); qc.invalidateQueries({ queryKey: ['orders'] }) }}
        />
      )}

      {deleteOrderId && (
        <DeletePreviewModal
          orderId={deleteOrderId}
          onClose={() => setDeleteOrderId(null)}
          onDeleted={() => { setDeleteOrderId(null); qc.invalidateQueries({ queryKey: ['orders'] }) }}
        />
      )}

      {editOrder && (
        <EditOrderModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={() => { setEditOrder(null); qc.invalidateQueries({ queryKey: ['orders'] }) }}
        />
      )}

      {showCreateModal && (
        <CreateOrderModal
          onClose={() => setShowCreateModal(false)}
          onDone={() => { setShowCreateModal(false); qc.invalidateQueries({ queryKey: ['orders'] }) }}
        />
      )}

      {viewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewOrder(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Buyurtma #{viewOrder.id}</h2>
              <button onClick={() => setViewOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {viewOrder.is_walkin && (
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
                  <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-600 px-2 py-0.5 rounded-full">Tez sotuv</span>
                  {!viewOrder.client_id && (
                    <span className="text-xs text-amber-700 dark:text-amber-400">Ro'yxatdan o'tmagan mijoz</span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400 text-xs mb-0.5">{viewOrder.is_walkin && !viewOrder.client_id ? 'Tez sotuv' : 'Mijoz'}</p>
                  <p className="font-medium">
                    {viewOrder.is_walkin && !viewOrder.client_id
                      ? (viewOrder.walkin_store || viewOrder.walkin_phone || '—')
                      : (viewOrder.client_name ?? viewOrder.walkin_address ?? '—')}
                  </p>
                  <p className="text-gray-400">
                    {viewOrder.is_walkin && !viewOrder.client_id ? (viewOrder.walkin_phone ?? '') : (viewOrder.client_phone ?? '')}
                  </p>
                </div>
                <div><p className="text-gray-400 text-xs mb-0.5">Sana</p><p className="font-medium">{formatDateTime(viewOrder.created_at)}</p></div>
                <div>
                  <p className="text-gray-400 text-xs mb-0.5">Manzil</p>
                  <p className="font-medium">
                    {viewOrder.is_walkin ? (viewOrder.walkin_address ?? viewOrder.address_text ?? '—') : (viewOrder.address_text ?? '—')}
                  </p>
                </div>
                <div><p className="text-gray-400 text-xs mb-0.5">Holat</p><OrderStatusBadge status={viewOrder.status} /></div>
                <div><p className="text-gray-400 text-xs mb-0.5">Jami</p><p className="font-bold text-red-600">{formatMoney(viewOrder.total_amount)}</p></div>
                {viewOrder.discount_amount > 0 && (
                  <div><p className="text-gray-400 text-xs mb-0.5">Chegirma</p><p className="font-semibold text-yellow-600">−{formatMoney(viewOrder.discount_amount)}</p></div>
                )}
                <div><p className="text-gray-400 text-xs mb-0.5">To'lov</p><PaymentStatusText status={viewOrder.payment_status} /></div>
                {viewOrder.is_walkin && viewOrder.walkin_store && (
                  <div><p className="text-gray-400 text-xs mb-0.5">Do'kon / ism</p><p className="font-medium">{viewOrder.walkin_store}</p></div>
                )}
                {viewOrder.comment && <div className="col-span-2"><p className="text-gray-400 text-xs mb-0.5">Izoh</p><p className="font-medium">{viewOrder.comment}</p></div>}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Mahsulotlar</p>
                <div className="space-y-2">
                  {viewOrder.items.map((item, i) => {
                    const isDelivered = viewOrder.status === 'yetkazildi' || viewOrder.status === 'yopildi'
                    const displayQty = item.delivered_quantity ?? item.quantity
                    const showDifference = isDelivered && item.delivered_quantity !== item.quantity
                    return (
                      <div key={i} className="py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {item.product_name ?? 'Mahsulot'} × {displayQty}
                            </span>
                            {showDifference && <div className="text-xs text-gray-400 mt-0.5">Buyurtma: {item.quantity} dona</div>}
                          </div>
                          <span className="text-sm font-semibold">{formatMoney(item.price_at_order * displayQty)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {(viewOrder.containers_returned ?? 0) > 0 && (
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-green-100 dark:border-green-900/30 text-sm">
                    <span className="text-green-700 dark:text-green-400 font-medium">↩ Qaytarilgan tara</span>
                    <span className="font-bold text-green-700 dark:text-green-400">{viewOrder.containers_returned} ta</span>
                  </div>
                )}
                {(viewOrder.client_debt ?? 0) > 0 && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-red-100 dark:border-red-900/30 text-sm">
                    <span className="text-red-500 font-medium">⚠ Mijoz qarzi</span>
                    <span className="font-bold text-red-500">{formatMoney(viewOrder.client_debt!)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
