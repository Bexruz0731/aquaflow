import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Minus, Plus, ShoppingBag, Clock, Phone, MapPin, Store, Building2,
  MessageSquare, Search, X, AlertTriangle, CheckCircle,
} from 'lucide-react'
import api from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { getT } from '@/i18n'

function formatMoney(n: number) {
  return `${n.toLocaleString('uz-UZ')} so'm`
}
function formatDateTime(s: string) {
  const d = new Date(s)
  return (
    d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  product_id: string
  product_name: string
  price: number
  is_returnable_container: boolean
  quantity: number
}

interface ClientResult {
  id: string
  name: string
  phone: string
  debt_amount: number
  container_balance: number
  primary_address: string | null
}

interface ClientAddress {
  id: string
  address_text: string
  is_primary: boolean
}

interface WalkinOrder {
  id: number
  client_id: string | null
  client_name: string | null
  client_phone: string | null
  walkin_phone: string | null
  walkin_address: string | null
  walkin_store: string | null
  total_amount: number
  discount_amount: number
  debt_amount: number
  comment: string | null
  payment_method: string | null
  cash_amount: number
  card_amount: number
  payme_amount: number
  created_at: string
  items: { product_name: string | null; quantity: number; price_at_order: number; total: number }[]
}

type PayMode = 'cash' | 'card' | 'payme' | 'debt' | 'cash_card' | 'cash_debt' | 'card_debt' | 'cash_card_debt'

// ─── Component ────────────────────────────────────────────────────────────────

export default function WalkinTab() {
  const lang = useAuthStore(s => s.profile?.language)
  const t = getT(lang)
  const qc = useQueryClient()

  const [view, setView] = useState<'form' | 'history'>('form')
  const [mode, setMode] = useState<'new' | 'existing'>('new')

  // Yangi mijoz fields
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [companyName, setCompanyName] = useState('')

  // Phone duplicate detection
  const [phoneConflict, setPhoneConflict] = useState<ClientResult | null>(null)
  const phoneCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Eski mijoz fields
  const [clientSearch, setClientSearch] = useState('')
  const [clientSearchResults, setClientSearchResults] = useState<ClientResult[]>([])
  const [clientSearchLoading, setClientSearchLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null)
  const [clientAddresses, setClientAddresses] = useState<ClientAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | 'manual' | ''>('')
  const [manualAddress, setManualAddress] = useState('')
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Shared fields
  const [comment, setComment] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [discountInput, setDiscountInput] = useState('')

  // Containers
  const [containersReturnedInput, setContainersReturnedInput] = useState('')

  // Payment
  const [payMode, setPayMode] = useState<PayMode>('cash')
  const [cashInput, setCashInput] = useState('')
  const [cardInput, setCardInput] = useState('')

  // Confirmation modal
  const [showConfirm, setShowConfirm] = useState(false)

  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ['my-inventory'],
    queryFn: async () => {
      const { data } = await api.get('/couriers/me/inventory')
      return data as { items: InventoryItem[] }
    },
    refetchInterval: 30000,
  })

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['walkin-history'],
    queryFn: async () => {
      const { data } = await api.get('/orders/courier/walkin-history')
      return data as WalkinOrder[]
    },
    enabled: view === 'history',
  })

  const availableItems = inventoryData?.items ?? []

  // ─── Derived amounts ────────────────────────────────────────────────────────

  const totalAmount = availableItems.reduce((sum, item) => {
    return sum + (quantities[item.product_id] ?? 0) * item.price
  }, 0)

  const hasReturnableSelected = availableItems.some(
    i => i.is_returnable_container && (quantities[i.product_id] ?? 0) > 0
  )
  const containersReturned = Math.max(0, parseInt(containersReturnedInput) || 0)

  const discountAmt = Math.min(Math.max(0, parseInt(discountInput) || 0), totalAmount)
  const payableAmt = totalAmount - discountAmt

  const cashAmt = Math.min(Math.max(0, parseInt(cashInput) || 0), payableAmt)
  const cardAmt = Math.min(Math.max(0, parseInt(cardInput) || 0), payableAmt - cashAmt)

  const debtAmt = (() => {
    if (payMode === 'debt') return payableAmt
    if (payMode === 'cash_debt') return Math.max(0, payableAmt - cashAmt)
    if (payMode === 'card_debt') return Math.max(0, payableAmt - cardAmt)
    if (payMode === 'cash_card_debt') return Math.max(0, payableAmt - cashAmt - cardAmt)
    return 0
  })()

  // ─── Phone duplicate check (Yangi mijoz) ────────────────────────────────────

  const checkPhone = (value: string) => {
    if (phoneCheckTimeout.current) clearTimeout(phoneCheckTimeout.current)
    setPhoneConflict(null)
    if (value.trim().length < 7) return
    phoneCheckTimeout.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/couriers/me/clients/search', { params: { q: value.trim() } })
        const exact = (data as ClientResult[]).find(c => c.phone === value.trim())
        if (exact) setPhoneConflict(exact)
      } catch {
        // silent
      }
    }, 400)
  }

  // ─── Client search (Eski mijoz) ─────────────────────────────────────────────

  const handleClientSearch = (val: string) => {
    setClientSearch(val)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    if (!val.trim()) { setClientSearchResults([]); return }
    searchDebounce.current = setTimeout(async () => {
      setClientSearchLoading(true)
      try {
        const { data } = await api.get('/couriers/me/clients/search', { params: { q: val.trim() } })
        setClientSearchResults(data as ClientResult[])
      } catch {
        setClientSearchResults([])
      } finally {
        setClientSearchLoading(false)
      }
    }, 300)
  }

  const selectClient = async (client: ClientResult) => {
    setSelectedClient(client)
    setClientSearch('')
    setClientSearchResults([])
    setSelectedAddressId('')
    setManualAddress('')
    try {
      const { data } = await api.get(`/couriers/me/clients/${client.id}/addresses`)
      const addrs = data as ClientAddress[]
      setClientAddresses(addrs)
      if (addrs.length === 1) {
        setSelectedAddressId(addrs[0].id)
      }
    } catch {
      setClientAddresses([])
    }
  }

  const clearClient = () => {
    setSelectedClient(null)
    setClientAddresses([])
    setSelectedAddressId('')
    setManualAddress('')
  }

  // ─── Reset form ─────────────────────────────────────────────────────────────

  const resetForm = () => {
    setPhone(''); setAddress(''); setCompanyName('')
    setPhoneConflict(null)
    setClientSearch(''); setClientSearchResults([]); setSelectedClient(null)
    setClientAddresses([]); setSelectedAddressId(''); setManualAddress('')
    setComment(''); setQuantities({}); setDiscountInput('')
    setPayMode('cash'); setCashInput(''); setCardInput('')
    setContainersReturnedInput('')
    setShowConfirm(false)
  }

  const switchMode = (m: 'new' | 'existing') => {
    setMode(m)
    resetForm()
  }

  // ─── Computed address for submission ───────────────────────────────────────

  const resolvedAddress = (() => {
    if (mode === 'new') return address.trim() || null
    if (selectedAddressId === 'manual') return manualAddress.trim() || null
    const found = clientAddresses.find(a => a.id === selectedAddressId)
    return found?.address_text ?? null
  })()

  // ─── Validation ─────────────────────────────────────────────────────────────

  const itemCount = availableItems.reduce((s, i) => s + (quantities[i.product_id] ?? 0), 0)

  const validationError = (() => {
    if (itemCount === 0) return 'Kamida bitta mahsulot tanlang'
    if (mode === 'new') {
      if (!phone.trim()) return 'Telefon raqam kiritilishi shart'
      if (phoneConflict) return 'Telefon raqam allaqachon bazada bor'
      if (!address.trim()) return 'Manzil kiritilishi shart'
    } else {
      if (!selectedClient) return 'Mijozni tanlang'
      if (!resolvedAddress) return 'Manzil kiritilishi shart'
    }
    // Payment validation
    if (payMode === 'cash' && cashAmt !== payableAmt && payableAmt > 0) return null // auto-fill
    if (payMode === 'cash_debt' && cashAmt <= 0) return 'Naqd miqdorini kiriting'
    if (payMode === 'card_debt' && cardAmt <= 0) return 'Karta miqdorini kiriting'
    if (payMode === 'cash_card' && (cashAmt + cardAmt !== payableAmt)) return 'Naqd + karta summa mos emas'
    if (payMode === 'cash_card_debt' && cashAmt + cardAmt >= payableAmt) return 'Qarz bo\'lishi uchun naqd+karta kamroq bo\'lishi kerak'
    return null
  })()

  // ─── Sell mutation ──────────────────────────────────────────────────────────

  const sellMutation = useMutation({
    mutationFn: async () => {
      const items = availableItems
        .filter(i => (quantities[i.product_id] ?? 0) > 0)
        .map(i => ({ product_id: i.product_id, quantity: quantities[i.product_id] }))

      // Compute final payment amounts
      let finalCash = 0, finalCard = 0, finalPayme = 0, finalDebt = 0
      if (payMode === 'cash') { finalCash = payableAmt }
      else if (payMode === 'card') { finalCard = payableAmt }
      else if (payMode === 'payme') { finalPayme = payableAmt }
      else if (payMode === 'debt') { finalDebt = payableAmt }
      else if (payMode === 'cash_card') { finalCash = cashAmt; finalCard = cardAmt }
      else if (payMode === 'cash_debt') { finalCash = cashAmt; finalDebt = payableAmt - cashAmt }
      else if (payMode === 'card_debt') { finalCard = cardAmt; finalDebt = payableAmt - cardAmt }
      else if (payMode === 'cash_card_debt') { finalCash = cashAmt; finalCard = cardAmt; finalDebt = payableAmt - cashAmt - cardAmt }

      const payload: Record<string, unknown> = {
        is_walkin: true,
        items,
        discount_amount: discountAmt,
        comment: comment.trim() || null,
        walkin_cash_amount: finalCash,
        walkin_card_amount: finalCard,
        walkin_payme_amount: finalPayme > 0 ? finalPayme : null,
        walkin_debt_amount: finalDebt > 0 ? finalDebt : null,
        walkin_containers_returned: hasReturnableSelected ? containersReturned : 0,
      }

      if (mode === 'existing' && selectedClient) {
        payload.client_id = selectedClient.id
        payload.walkin_address = resolvedAddress
      } else {
        payload.walkin_phone = phone.trim()
        payload.walkin_address = resolvedAddress
        if (companyName.trim()) payload.walkin_company_name = companyName.trim()
      }

      const { data } = await api.post('/orders/walkin', payload)
      return data
    },
    onSuccess: (data) => {
      const debtNote = data.debt_amount > 0 ? ` | Qarz: ${formatMoney(data.debt_amount)}` : ''
      setSuccessMsg(`Sotuv amalga oshirildi!${debtNote}`)
      setErrorMsg(null)
      resetForm()
      qc.invalidateQueries({ queryKey: ['my-inventory'] })
      qc.invalidateQueries({ queryKey: ['walkin-history'] })
      setTimeout(() => setSuccessMsg(null), 5000)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      if (detail?.code === 'PHONE_EXISTS') {
        setPhoneConflict(detail.client)
        setErrorMsg(null)
      } else {
        setErrorMsg(typeof detail === 'string' ? detail : err?.message ?? 'Xatolik yuz berdi')
      }
      setShowConfirm(false)
    },
  })

  // ─── Quantity helpers ───────────────────────────────────────────────────────

  const setQty = (productId: string, delta: number, max: number) => {
    setQuantities(prev => {
      const next = Math.max(0, Math.min(max, (prev[productId] ?? 0) + delta))
      return { ...prev, [productId]: next }
    })
  }

  // ─── Payment mode buttons config ────────────────────────────────────────────

  const payModes: { key: PayMode; label: string; color: string }[] = [
    { key: 'cash', label: '💵 Naqd', color: 'green' },
    { key: 'card', label: '💳 Karta', color: 'blue' },
    { key: 'payme', label: '📱 Payme', color: 'cyan' },
    { key: 'debt' as PayMode, label: '📋 Qarz', color: 'red' },
    { key: 'cash_debt' as PayMode, label: '💵+📋', color: 'orange' },
    { key: 'card_debt' as PayMode, label: '💳+📋', color: 'purple' },
    { key: 'cash_card' as PayMode, label: '💵+💳', color: 'teal' },
    { key: 'cash_card_debt' as PayMode, label: '💵+💳+📋', color: 'pink' },
  ]

  // ─── Confirmation summary ───────────────────────────────────────────────────

  const confirmItems = availableItems.filter(i => (quantities[i.product_id] ?? 0) > 0)

  const paymentSummary = (() => {
    if (payMode === 'cash') return `Naqd: ${formatMoney(payableAmt)}`
    if (payMode === 'card') return `Karta: ${formatMoney(payableAmt)}`
    if (payMode === 'payme') return `Payme/Click: ${formatMoney(payableAmt)}`
    if (payMode === 'debt') return `Qarz: ${formatMoney(payableAmt)}`
    if (payMode === 'cash_card') return `Naqd: ${formatMoney(cashAmt)} | Karta: ${formatMoney(cardAmt)}`
    if (payMode === 'cash_debt') return `Naqd: ${formatMoney(cashAmt)} | Qarz: ${formatMoney(debtAmt)}`
    if (payMode === 'card_debt') return `Karta: ${formatMoney(cardAmt)} | Qarz: ${formatMoney(debtAmt)}`
    if (payMode === 'cash_card_debt') return `Naqd: ${formatMoney(cashAmt)} | Karta: ${formatMoney(cardAmt)} | Qarz: ${formatMoney(debtAmt)}`
    return ''
  })()

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">
      {/* Top toggle: form / history */}
      <div className="flex bg-white dark:bg-gray-900 rounded-2xl p-1 shadow-sm">
        <button
          onClick={() => setView('form')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors ${view === 'form' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          {t.walkin_new_sale ?? 'Yangi sotuv'}
        </button>
        <button
          onClick={() => setView('history')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors ${view === 'history' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          {t.walkin_history ?? 'Tarix'}
        </button>
      </div>

      {view === 'form' ? (
        <>
          {/* Success/Error */}
          {successMsg && (
            <div className="flex items-start gap-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-2xl px-4 py-3 text-sm font-medium">
              <CheckCircle size={16} className="shrink-0 mt-0.5" />
              {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Mode selector: Yangi / Eski */}
          <div className="flex bg-white dark:bg-gray-900 rounded-2xl p-1 shadow-sm">
            <button
              onClick={() => switchMode('new')}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${mode === 'new' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              ⚡ Yangi mijoz
            </button>
            <button
              onClick={() => switchMode('existing')}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${mode === 'existing' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              👤 Eski mijoz
            </button>
          </div>

          {/* ── YANGI MIJOZ ─────────────────────────────────────────────── */}
          {mode === 'new' && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 space-y-3">
              {/* Phone */}
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-gray-400 shrink-0" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); setPhoneConflict(null); checkPhone(e.target.value) }}
                  placeholder="Telefon raqam *"
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                />
              </div>

              {/* Phone conflict warning */}
              {phoneConflict && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                    <AlertTriangle size={14} />
                    Bu raqam bazada allaqachon bor
                  </div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    👤 {phoneConflict.name} — {phoneConflict.phone}
                  </p>
                  {phoneConflict.debt_amount > 0 && (
                    <p className="text-xs text-red-500">Qarzi: {formatMoney(phoneConflict.debt_amount)}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { switchMode('existing'); selectClient(phoneConflict) }}
                      className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg"
                    >
                      Shu mijozni tanlash
                    </button>
                    <button
                      onClick={() => { setPhone(''); setPhoneConflict(null) }}
                      className="flex-1 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg"
                    >
                      Boshqa raqam
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-100 dark:border-gray-800" />

              {/* Address */}
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Manzil *"
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                />
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800" />

              {/* Company name */}
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder={t.walkin_company}
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                />
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800" />

              {/* Comment */}
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Izoh (ixtiyoriy)"
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                />
              </div>
            </div>
          )}

          {/* ── ESKI MIJOZ ──────────────────────────────────────────────── */}
          {mode === 'existing' && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 space-y-3">
              {!selectedClient ? (
                <>
                  {/* Search input */}
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                    <Search size={15} className="text-gray-400 shrink-0" />
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={e => handleClientSearch(e.target.value)}
                      placeholder="Ism, telefon yoki manzil bo'yicha qidiring..."
                      className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                      autoFocus
                    />
                    {clientSearch && (
                      <button onClick={() => { setClientSearch(''); setClientSearchResults([]) }}>
                        <X size={14} className="text-gray-400" />
                      </button>
                    )}
                  </div>

                  {/* Results */}
                  {clientSearchLoading && (
                    <p className="text-center text-xs text-gray-400 py-2">Qidirilmoqda...</p>
                  )}
                  {!clientSearchLoading && clientSearch.length > 0 && clientSearchResults.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-2">Hech narsa topilmadi</p>
                  )}
                  {clientSearchResults.length > 0 && (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
                      {clientSearchResults.map(c => (
                        <button
                          key={c.id}
                          onClick={() => selectClient(c)}
                          className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                            {c.debt_amount > 0 && (
                              <span className="text-xs text-red-500 font-semibold">{formatMoney(c.debt_amount)}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">{c.phone}{c.primary_address ? ` · ${c.primary_address}` : ''}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Selected client card */}
                  <div className="flex items-start justify-between bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">{selectedClient.name}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">{selectedClient.phone}</p>
                      {selectedClient.debt_amount > 0 && (
                        <p className="text-xs text-red-500 font-medium mt-0.5">
                          Mavjud qarz: {formatMoney(selectedClient.debt_amount)}
                        </p>
                      )}
                      {selectedClient.container_balance > 0 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                          🫙 Tara balansi: {selectedClient.container_balance} ta
                        </p>
                      )}
                    </div>
                    <button onClick={clearClient} className="text-blue-400 hover:text-blue-600 p-1">
                      <X size={16} />
                    </button>
                  </div>

                  {/* Address selection */}
                  {clientAddresses.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Manzil</p>
                      <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
                        {clientAddresses.map(a => (
                          <button
                            key={a.id}
                            onClick={() => setSelectedAddressId(a.id)}
                            className={`w-full text-left flex items-center gap-2 px-3 py-2.5 transition-colors ${selectedAddressId === a.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                          >
                            <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selectedAddressId === a.id ? 'border-blue-600' : 'border-gray-300'}`}>
                              {selectedAddressId === a.id && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                            </div>
                            <span className="text-sm text-gray-800 dark:text-gray-200">{a.address_text}</span>
                            {a.is_primary && <span className="ml-auto text-xs text-gray-400">Asosiy</span>}
                          </button>
                        ))}
                        <button
                          onClick={() => setSelectedAddressId('manual')}
                          className={`w-full text-left flex items-center gap-2 px-3 py-2.5 transition-colors ${selectedAddressId === 'manual' ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selectedAddressId === 'manual' ? 'border-blue-600' : 'border-gray-300'}`}>
                            {selectedAddressId === 'manual' && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                          </div>
                          <span className="text-sm text-gray-500">Boshqa manzil</span>
                        </button>
                      </div>
                      {selectedAddressId === 'manual' && (
                        <input
                          type="text"
                          value={manualAddress}
                          onChange={e => setManualAddress(e.target.value)}
                          placeholder="Manzilni kiriting *"
                          className="w-full bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 rounded-xl px-3 py-2.5 outline-none border border-gray-200 dark:border-gray-700 focus:border-blue-500"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Manzil *</p>
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                        <MapPin size={15} className="text-gray-400 shrink-0" />
                        <input
                          type="text"
                          value={manualAddress}
                          onChange={e => setManualAddress(e.target.value)}
                          placeholder="Manzilni kiriting *"
                          className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Comment */}
                  <div className="flex items-center gap-2 pt-1">
                    <MessageSquare size={16} className="text-gray-400 shrink-0" />
                    <input
                      type="text"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Izoh (ixtiyoriy)"
                      className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Products ─────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
            {inventoryLoading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Yuklanmoqda...</div>
            ) : availableItems.length === 0 ? (
              <div className="p-6 text-center">
                <ShoppingBag size={32} className="text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">{t.walkin_no_inventory ?? "Inventaringizda mahsulot yo'q"}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {availableItems.map(item => {
                  const qty = quantities[item.product_id] ?? 0
                  return (
                    <div key={item.product_id} className="flex items-center justify-between p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.product_name}</p>
                          {item.is_returnable_container && (
                            <span className="shrink-0 text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-600 px-1.5 py-0.5 rounded-full">🫙 tara</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{formatMoney(item.price)} · Mavjud: {item.quantity} ta</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <button
                          onClick={() => setQty(item.product_id, -1, item.quantity)}
                          disabled={qty === 0}
                          className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center disabled:opacity-30 active:scale-95 transition"
                        >
                          <Minus size={14} className="text-gray-600 dark:text-gray-300" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={item.quantity}
                          value={qty === 0 ? '' : qty}
                          placeholder="0"
                          onChange={e => {
                            const v = Math.max(0, Math.min(item.quantity, parseInt(e.target.value) || 0))
                            setQuantities(prev => ({ ...prev, [item.product_id]: v }))
                          }}
                          className="w-12 text-center text-sm font-bold text-gray-900 dark:text-white bg-transparent outline-none border-b border-gray-300 dark:border-gray-600"
                        />
                        <button
                          onClick={() => setQty(item.product_id, 1, item.quantity)}
                          disabled={qty >= item.quantity}
                          className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center disabled:opacity-30 active:scale-95 transition"
                        >
                          <Plus size={14} className="text-orange-600" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Discount ─────────────────────────────────────────────────── */}
          {totalAmount > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Chegirma (ixtiyoriy)</p>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={discountInput}
                onChange={e => { setDiscountInput(e.target.value); setCashInput(''); setCardInput('') }}
                placeholder="0"
                className="w-full bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 font-bold text-sm rounded-xl px-3 py-2.5 outline-none border-2 border-yellow-200 dark:border-yellow-800 focus:border-yellow-500"
              />
              {discountAmt > 0 && (
                <p className="text-xs text-yellow-600 text-center">
                  {formatMoney(totalAmount)} − {formatMoney(discountAmt)} = <b>{formatMoney(payableAmt)}</b>
                </p>
              )}
            </div>
          )}

          {/* ── Containers returned ──────────────────────────────────────── */}
          {hasReturnableSelected && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Qaytarilgan pust taralar</p>
              {mode === 'existing' && selectedClient && selectedClient.container_balance > 0 && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Mijozda {selectedClient.container_balance} ta tara bor
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setContainersReturnedInput(v => String(Math.max(0, (parseInt(v) || 0) - 1)))}
                  className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center active:scale-95 transition"
                >
                  <Minus size={16} className="text-gray-600 dark:text-gray-300" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={containersReturnedInput}
                  onChange={e => setContainersReturnedInput(e.target.value)}
                  placeholder="0"
                  className="flex-1 text-center text-lg font-bold text-gray-900 dark:text-white bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2.5 outline-none border-2 border-blue-200 dark:border-blue-800 focus:border-blue-500"
                />
                <button
                  onClick={() => setContainersReturnedInput(v => String((parseInt(v) || 0) + 1))}
                  className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center active:scale-95 transition"
                >
                  <Plus size={16} className="text-blue-600" />
                </button>
              </div>
              {containersReturned > 0 && (
                <p className="text-xs text-center text-blue-600">
                  Mijoz {containersReturned} ta pust tara qaytaradi
                </p>
              )}
            </div>
          )}

          {/* ── Payment ──────────────────────────────────────────────────── */}
          {totalAmount > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">To'lov usuli</p>

              {/* Mode buttons */}
              <div className="flex flex-wrap gap-1.5">
                {payModes.map(pm => (
                  <button
                    key={pm.key}
                    onClick={() => { setPayMode(pm.key); setCashInput(''); setCardInput('') }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
                      payMode === pm.key
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>

              {/* Amount inputs depending on mode */}
              {(payMode === 'cash_card' || payMode === 'cash_debt' || payMode === 'cash_card_debt') && (
                <div className="space-y-1">
                  <p className="text-xs text-green-600 font-medium">Naqd miqdori</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={cashInput}
                    onChange={e => setCashInput(e.target.value)}
                    placeholder="0"
                    className="w-full bg-green-50 dark:bg-green-900/20 text-green-700 font-bold text-sm rounded-xl px-3 py-2.5 outline-none border-2 border-green-200 dark:border-green-800 focus:border-green-500"
                  />
                </div>
              )}
              {(payMode === 'cash_card' || payMode === 'card_debt' || payMode === 'cash_card_debt') && (
                <div className="space-y-1">
                  <p className="text-xs text-blue-600 font-medium">Karta miqdori</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={cardInput}
                    onChange={e => setCardInput(e.target.value)}
                    placeholder="0"
                    className="w-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 font-bold text-sm rounded-xl px-3 py-2.5 outline-none border-2 border-blue-200 dark:border-blue-800 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Summary line */}
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2 space-y-0.5">
                {(payMode === 'cash' || payMode === 'cash_card' || payMode === 'cash_debt' || payMode === 'cash_card_debt') && cashAmt > 0 && (
                  <p className="text-xs text-green-600">💵 Naqd: {formatMoney(payMode === 'cash' ? payableAmt : cashAmt)}</p>
                )}
                {(payMode === 'card' || payMode === 'cash_card' || payMode === 'card_debt' || payMode === 'cash_card_debt') && (
                  <p className="text-xs text-blue-600">💳 Karta: {formatMoney(payMode === 'card' ? payableAmt : payMode === 'cash_card' ? cardAmt : cardAmt)}</p>
                )}
                {debtAmt > 0 && (
                  <p className="text-xs text-red-500 font-semibold">📋 Qarz: {formatMoney(debtAmt)}</p>
                )}
                {debtAmt > 0 && selectedClient && selectedClient.debt_amount > 0 && (
                  <p className="text-xs text-gray-400">Umumiy qarz: {formatMoney(selectedClient.debt_amount + debtAmt)}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Total + Sell button ───────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Jami</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{formatMoney(payableAmt)}</span>
            </div>
            {validationError && itemCount > 0 && (
              <p className="text-xs text-red-500 text-center">{validationError}</p>
            )}
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!!validationError || itemCount === 0}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold rounded-xl transition-colors active:scale-[0.98]"
            >
              Sotishni tasdiqlash
            </button>
          </div>
        </>
      ) : (
        /* ── HISTORY ──────────────────────────────────────────────────── */
        <div className="space-y-3">
          {historyLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl h-24 animate-pulse" />
              ))
            : !historyData || historyData.length === 0
            ? (
              <div className="text-center py-12">
                <Clock size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Tez sotuv tarixi yo'q</p>
              </div>
            )
            : historyData.map(order => {
                const displayName = order.client_name ?? order.walkin_store ?? null
                const displayPhone = order.client_phone ?? order.walkin_phone ?? null
                const displayAddress = order.walkin_address ?? null
                return (
                  <div key={order.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 font-bold px-2 py-0.5 rounded-full">#{order.id}</span>
                        <span className="text-xs text-gray-400">{formatDateTime(order.created_at)}</span>
                        {order.debt_amount > 0 && (
                          <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 font-semibold px-1.5 py-0.5 rounded-full">
                            Qarz: {formatMoney(order.debt_amount)}
                          </span>
                        )}
                        {(order.cash_amount > 0 ? 1 : 0) + (order.card_amount > 0 ? 1 : 0) + (order.payme_amount > 0 ? 1 : 0) > 1
                          ? <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">Aralash</span>
                          : order.payme_amount > 0
                          ? <span className="text-xs bg-cyan-100 text-cyan-600 px-1.5 py-0.5 rounded-full">Payme</span>
                          : order.card_amount > 0
                          ? <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Karta</span>
                          : order.cash_amount > 0
                          ? <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">Naqd</span>
                          : null}
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white text-sm shrink-0 ml-2">{formatMoney(order.total_amount)}</span>
                    </div>

                    <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      {displayName && (
                        <div className="flex items-center gap-1.5">
                          <Store size={11} className="shrink-0" />
                          <span>{displayName}</span>
                        </div>
                      )}
                      {displayPhone && (
                        <div className="flex items-center gap-1.5">
                          <Phone size={11} className="shrink-0" />
                          <span>{displayPhone}</span>
                        </div>
                      )}
                      {displayAddress && (
                        <div className="flex items-center gap-1.5">
                          <MapPin size={11} className="shrink-0" />
                          <span>{displayAddress}</span>
                        </div>
                      )}
                      {order.discount_amount > 0 && (
                        <p className="text-yellow-600">Chegirma: −{formatMoney(order.discount_amount)}</p>
                      )}
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-800 pt-2 space-y-1">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                          <span>{item.product_name ?? 'Mahsulot'} × {item.quantity}</span>
                          <span className="font-medium">{formatMoney(item.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
        </div>
      )}

      {/* ── CONFIRMATION MODAL ──────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-gray-900 dark:text-white text-center">
              Sotishni tasdiqlang
            </h3>

            {/* Client */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 space-y-1">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Mijoz</p>
              {mode === 'existing' && selectedClient ? (
                <>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedClient.name}</p>
                  <p className="text-xs text-gray-500">{selectedClient.phone}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{address || phone}</p>
                  <p className="text-xs text-gray-500">{phone}</p>
                </>
              )}
              {resolvedAddress && <p className="text-xs text-gray-400">📍 {resolvedAddress}</p>}
            </div>

            {/* Items */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 space-y-1.5">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Mahsulotlar</p>
              {confirmItems.map(item => (
                <div key={item.product_id} className="flex justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{item.product_name} × {quantities[item.product_id]}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMoney((quantities[item.product_id] ?? 0) * item.price)}
                  </span>
                </div>
              ))}
              {discountAmt > 0 && (
                <div className="flex justify-between text-sm border-t border-gray-200 dark:border-gray-700 pt-1.5">
                  <span className="text-yellow-600">Chegirma</span>
                  <span className="text-yellow-600">−{formatMoney(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t border-gray-200 dark:border-gray-700 pt-1.5">
                <span className="text-gray-900 dark:text-white">Jami</span>
                <span className="text-gray-900 dark:text-white">{formatMoney(payableAmt)}</span>
              </div>
            </div>

            {/* Containers */}
            {hasReturnableSelected && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 space-y-1">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Taralar</p>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Sotiladigan: {availableItems.filter(i => i.is_returnable_container).reduce((s, i) => s + (quantities[i.product_id] ?? 0), 0)} ta
                </p>
                {containersReturned > 0 && (
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Qaytariladi: {containersReturned} ta pust
                  </p>
                )}
              </div>
            )}

            {/* Payment */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 space-y-1">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">To'lov</p>
              <p className="text-sm text-gray-800 dark:text-gray-200">{paymentSummary}</p>
              {debtAmt > 0 && mode === 'existing' && selectedClient && selectedClient.debt_amount > 0 && (
                <p className="text-xs text-red-500">
                  Umumiy qarz: {formatMoney(selectedClient.debt_amount + debtAmt)}
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl"
              >
                Orqaga
              </button>
              <button
                onClick={() => sellMutation.mutate()}
                disabled={sellMutation.isPending}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-2xl active:scale-[0.98] transition-colors"
              >
                {sellMutation.isPending ? 'Amalga oshirilmoqda...' : '✓ Tasdiqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
