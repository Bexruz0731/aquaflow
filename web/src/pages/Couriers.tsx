import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import {
  DollarSign, Package,
  ArrowLeft, Phone, Car, Plus, X, PackagePlus, Trash2, CalendarDays, ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react'
import api from '@/api/client'
import { formatMoney, formatPhone, getInitials, getAvatarColor, formatDateTime, formatDate } from '@/utils/format'
import { useToastStore } from '@/store/toast'
import { useAuthStore } from '@/store/auth'

interface Courier {
  id: string
  user_id: string
  first_name: string
  last_name: string | null
  phone: string
  car_number: string
  shift_status: 'open' | 'closed'
  is_active: boolean
  cash_balance: number
  card_balance: number
  payme_balance: number
  full_containers: number
  empty_containers: number
  today_orders?: number
  today_income?: number
  created_at?: string
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToastStore()
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.first_name.trim() || !form.phone.trim()) return
    setSaving(true)
    try {
      await api.post('/couriers/invite', form)
      toast.success('Kuryer taklif qilindi! Endi u botda ro\'yxatdan o\'tishi mumkin.')
      onDone()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Kuryer qo'shish</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Telefon raqamini kiriting. Kuryer shu raqam bilan botda ro'yxatdan o'tadi.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ism *</label>
            <input className="input w-full" placeholder="Jasur" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Familiya</label>
            <input className="input w-full" placeholder="Karimov" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Telefon *</label>
            <input className="input w-full" placeholder="+998901234567" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">Bekor qilish</button>
          <button onClick={save} disabled={saving || !form.first_name.trim() || !form.phone.trim()} className="btn btn-primary flex-1">
            {saving ? 'Saqlanmoqda...' : 'Qo\'shish'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface Product {
  id: string
  name: string
  price: number
  is_active: boolean
}

interface WarehouseStockItem {
  id: string
  name: string
  product_id: string
  quantity: number
  empty_quantity: number
}

function IssueProductsModal({ courierId, onClose, onDone }: { courierId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToastStore()
  const [products, setProducts] = useState<Product[]>([])
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<{ product_id: string; quantity: number }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/products/').then(({ data }) => setProducts(Array.isArray(data) ? data : (data.items || []))),
      api.get('/warehouse/stock').then(({ data }) => setWarehouseStock(Array.isArray(data) ? data : (data.items || [])))
    ]).finally(() => setLoading(false))
  }, [])

  const addItem = () => {
    setItems([...items, { product_id: '', quantity: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: 'product_id' | 'quantity', value: any) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const getAvailableStock = (productId: string) => {
    const stock = warehouseStock.find(s => s.product_id === productId)
    return stock?.quantity ?? 0
  }

  const save = async () => {
    if (items.length === 0) {
      toast.error('Kamida bitta mahsulot qo\'shing')
      return
    }

    const validItems = items.filter(i => i.product_id && i.quantity > 0)
    if (validItems.length === 0) {
      toast.error('Mahsulot va miqdorni to\'ldiring')
      return
    }

    setSaving(true)
    try {
      await api.post(`/couriers/${courierId}/issue-products`, { items: validItems })
      toast.success('Mahsulotlar muvaffaqiyatli berildi!')
      onDone()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Mahsulot berish</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-400">Yuklanmoqda...</div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((item, index) => {
                const stock = getAvailableStock(item.product_id)
                return (
                  <div key={index} className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Mahsulot</label>
                        <select
                          value={item.product_id}
                          onChange={e => updateItem(index, 'product_id', e.target.value)}
                          className="input w-full text-sm"
                        >
                          <option value="">Tanlang...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Miqdor {item.product_id && <span className="text-blue-500">(omborda: {stock})</span>}
                        </label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateItem(index, 'quantity', +e.target.value)}
                          className="input w-full text-sm"
                          placeholder="0"
                          max={stock}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(index)}
                      className="mt-6 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
            </div>

            <button onClick={addItem} className="w-full btn btn-secondary flex items-center justify-center gap-2">
              <Plus size={16} /> Mahsulot qo'shish
            </button>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="btn btn-secondary flex-1">Bekor qilish</button>
              <button onClick={save} disabled={saving || items.length === 0} className="btn btn-primary flex-1">
                {saving ? 'Saqlanmoqda...' : 'Mahsulotlarni berish'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CouriersList() {
  const navigate = useNavigate()
  const toast = useToastStore()
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmCourier, setConfirmCourier] = useState<Courier | null>(null)

  const load = () => {
    api.get('/couriers/').then(({ data }) => setCouriers(Array.isArray(data) ? data : (data.items || []))).catch(() => toast.error('Kuryerlarni yuklashda xatolik')).finally(() => setLoading(false))
  }

  const handleDeleteConfirm = async () => {
    if (!confirmCourier) return
    setDeletingId(confirmCourier.id)
    try {
      await api.delete(`/couriers/${confirmCourier.id}`)
      toast.success('Kuryer o\'chirildi')
      setCouriers(cs => cs.filter(c => c.id !== confirmCourier.id))
      setConfirmCourier(null)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <>
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Kuryerlar</h1>
        <button onClick={() => setShowInvite(true)} className="btn btn-primary flex items-center gap-2">
          <Plus size={16} /> Qo'shish
        </button>
      </div>
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onDone={() => { setShowInvite(false); load() }} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-20 bg-gray-100 dark:bg-gray-700 rounded-xl" />
              </div>
            ))
          : couriers.map(c => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
              const initials = getInitials(name)
              const avatarColor = getAvatarColor(name)
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(c.id)}
                  className="card text-left card-hover"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold text-white ${avatarColor}`}>
                      {initials}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5 flex-wrap">
                        {c.phone && <span className="flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
                        {c.car_number && <span className="flex items-center gap-1"><Car size={11} /> {c.car_number}</span>}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <span className={`badge ${c.shift_status === 'open' ? 'badge-success' : 'badge-gray'}`}>
                        {c.shift_status === 'open' ? 'Smena ochiq' : 'Smena yopiq'}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmCourier(c) }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="O'chirish"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                        <p className="text-xs text-gray-400 mb-1">Bugun</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.today_orders ?? 0} ta</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                        <p className="text-xs text-gray-400 mb-1">Yig'ildi</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatMoney(c.today_income ?? 0)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                        <p className="text-xs text-gray-400 mb-1">Naqd</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatMoney(c.cash_balance)}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                        <p className="text-xs text-gray-400 mb-1">To'la tara</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.full_containers}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                        <p className="text-xs text-gray-400 mb-1">Bo'sh tara</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.empty_containers}</p>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
        {!loading && couriers.length === 0 && (
          <div className="card col-span-3 text-center text-gray-400 py-8">Kuryerlar yo'q</div>
        )}
      </div>
    </div>

    {/* Delete confirmation modal */}
    {confirmCourier && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-red-500" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Kuryerni o'chirish</h3>
              <p className="text-sm text-gray-500">{[confirmCourier.first_name, confirmCourier.last_name].filter(Boolean).join(' ')}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Kuryer ro'yxatdan olib tashlanadi. Barcha tarixi (buyurtmalar, xarajatlar) saqlanib qoladi.
            Keyinroq qayta qo'shilsa — barcha ma'lumotlar tiklanadi.
          </p>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setConfirmCourier(null)}
              className="btn btn-secondary flex-1"
              disabled={!!deletingId}
            >
              Bekor qilish
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={!!deletingId}
              className="btn flex-1 bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
            >
              {deletingId ? 'O\'chirilmoqda...' : 'O\'chirish'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

interface InventoryItem {
  product_id: string
  product_name: string
  quantity: number
  updated_at: string
}

interface DaySummary {
  date: string
  orders_count: number
  total_delivered: number
  total_returned: number
  total_income: number
  cash_income: number
  card_income: number
  payme_income: number
  advance_income: number
}

interface DayOrderItem {
  product_name: string
  quantity: number
  delivered_quantity: number
  price: number
  total: number
}

interface DayOrder {
  id: number
  client_name: string | null
  delivery_address: string | null
  containers_delivered: number
  containers_returned: number
  paid_amount: number
  cash_amount: number
  card_amount: number
  payme_amount: number
  advance_used: number
  debt_amount: number
  payment_method: string | null
  created_at: string
  items: DayOrderItem[]
}

interface DebtDaySummary {
  date: string
  debt_count: number
  debt_total: number
  payment_count: number
  payment_total: number
}

interface DebtTx {
  id: string
  type: string
  client_name: string
  amount: number
  payment_method: string | null
  created_at: string
}

function CourierDetail() {
  const navigate = useNavigate()
  const toast = useToastStore()
  const { user: authUser } = useAuthStore()
  const canDeleteExpense = authUser?.role === 'operator' || authUser?.role === 'boshliq' || authUser?.role === 'super_admin'
  const [courier, setCourier] = useState<Courier | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false)
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [dailySummary, setDailySummary] = useState<DaySummary[]>([])
  const [dailyLoading, setDailyLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayOrders, setDayOrders] = useState<DayOrder[]>([])
  const [dayOrdersLoading, setDayOrdersLoading] = useState(false)
  const [expenses, setExpenses] = useState<{ id: string; title: string; amount: number; payment_method: string; created_at: string }[]>([])
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<{ id: string; title: string; amount: number } | null>(null)
  const [deletingExpense, setDeletingExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ title: '', amount: '', payment_method: 'naqd' })
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [debtSummary, setDebtSummary] = useState<DebtDaySummary[]>([])
  const [debtSummaryLoading, setDebtSummaryLoading] = useState(false)
  const [selectedDebtDate, setSelectedDebtDate] = useState<string | null>(null)
  const [debtDayDetail, setDebtDayDetail] = useState<{ debts: DebtTx[]; payments: DebtTx[] } | null>(null)
  const [debtDayLoading, setDebtDayLoading] = useState(false)
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [dailyOpen, setDailyOpen] = useState(false)
  const [dailyPage, setDailyPage] = useState(0)
  const [expensesOpen, setExpensesOpen] = useState(false)
  const [expensesPage, setExpensesPage] = useState(0)
  const [debtOpen, setDebtOpen] = useState(false)
  const [debtPage, setDebtPage] = useState(0)

  // Get id from URL
  const id = window.location.pathname.split('/').at(-1) ?? ''

  const loadCourier = () => {
    api.get(`/couriers/${id}`).then(({ data }) => setCourier(data)).catch(() => { toast.error('Kuryer topilmadi'); navigate('/couriers') }).finally(() => setLoading(false))
  }

  const loadInventory = () => {
    setInventoryLoading(true)
    api.get(`/couriers/${id}/inventory`).then(({ data }) => setInventory(data.items || [])).catch(() => {}).finally(() => setInventoryLoading(false))
  }

  const loadDailySummary = () => {
    setDailyLoading(true)
    api.get(`/couriers/${id}/daily-summary`, { params: { days: 90 } })
      .then(({ data }) => setDailySummary(data))
      .catch(() => {})
      .finally(() => setDailyLoading(false))
  }

  const openDayDetail = (date: string) => {
    setSelectedDate(date)
    setDayOrdersLoading(true)
    api.get(`/couriers/${id}/orders-by-date`, { params: { date } })
      .then(({ data }) => setDayOrders(data))
      .catch(() => setDayOrders([]))
      .finally(() => setDayOrdersLoading(false))
  }

  const loadExpenses = () => {
    setExpensesLoading(true)
    api.get(`/couriers/${id}/expenses`)
      .then(({ data }) => setExpenses(data.items || []))
      .catch(() => {})
      .finally(() => setExpensesLoading(false))
  }

  const handleAddExpense = async () => {
    if (!expenseForm.title.trim() || !expenseForm.amount) return
    setExpenseSaving(true)
    try {
      await api.post(`/couriers/${id}/expenses`, { title: expenseForm.title.trim(), amount: Number(expenseForm.amount), payment_method: expenseForm.payment_method })
      setShowExpenseModal(false)
      setExpenseForm({ title: '', amount: '', payment_method: 'naqd' })
      loadExpenses()
      toast.success('Xarajat qo\'shildi')
    } catch {
      toast.error('Xatolik')
    } finally {
      setExpenseSaving(false)
    }
  }

  const handleDeleteExpense = async () => {
    if (!deleteExpenseTarget) return
    setDeletingExpense(true)
    try {
      await api.delete(`/couriers/${id}/expenses/${deleteExpenseTarget.id}`)
      setExpenses(prev => prev.filter(e => e.id !== deleteExpenseTarget.id))
      toast.success('Xarajat o\'chirildi')
      setDeleteExpenseTarget(null)
    } catch {
      toast.error('Xatolik')
    } finally {
      setDeletingExpense(false)
    }
  }

  const loadDebtSummary = () => {
    setDebtSummaryLoading(true)
    api.get(`/couriers/${id}/debt-summary`, { params: { days: 90 } })
      .then(({ data }) => setDebtSummary(data))
      .catch(() => {})
      .finally(() => setDebtSummaryLoading(false))
  }

  const openDebtDayDetail = (date: string) => {
    setSelectedDebtDate(date)
    setDebtDayLoading(true)
    api.get(`/couriers/${id}/debts-by-date`, { params: { date } })
      .then(({ data }) => setDebtDayDetail(data))
      .catch(() => setDebtDayDetail(null))
      .finally(() => setDebtDayLoading(false))
  }

  useEffect(() => {
    loadCourier()
    loadInventory()
    loadDailySummary()
    loadExpenses()
    loadDebtSummary()
  }, [id])

  if (loading || !courier) return <div className="card animate-pulse h-40" />

  const name = [courier.first_name, courier.last_name].filter(Boolean).join(' ')

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/couriers')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft size={16} /> Kuryerlar
      </button>

      <div className="card">
        <div className="flex items-start gap-4 flex-wrap">
          <span className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0 ${getAvatarColor(name)}`}>
            {getInitials(name)}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{name}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><Phone size={13} /> {formatPhone(courier.phone)}</span>
              {courier.car_number && <span className="flex items-center gap-1"><Car size={13} /> {courier.car_number}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`badge ${courier.shift_status === 'open' ? 'badge-success' : 'badge-gray'}`}>
              {courier.shift_status === 'open' ? 'Smena ochiq' : 'Smena yopiq'}
            </span>
            {courier.shift_status === 'open' ? (
              <button onClick={() => setShowCloseShiftModal(true)} className="btn-primary text-sm">
                Smena yopish
              </button>
            ) : (
              <button onClick={() => setShowOpenShiftModal(true)} className="btn-success text-sm">
                Smena ochish
              </button>
            )}
            <button
              onClick={() => { setNewPassword(''); setShowSetPasswordModal(true) }}
              className="btn text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Parol o'rnatish
            </button>
          </div>
        </div>

        {/* Today stats */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Bugun</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{courier.today_orders ?? 0} ta</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Yig'ildi</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{formatMoney(courier.today_income ?? 0)}</p>
          </div>
        </div>

        {/* Balances */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          {[
            { label: 'Naqd', value: formatMoney(courier.cash_balance), icon: DollarSign },
            { label: 'Karta', value: formatMoney(courier.card_balance), icon: DollarSign },
            { label: 'Payme/Click', value: formatMoney(courier.payme_balance), icon: DollarSign },
            { label: "To'la tara", value: courier.full_containers, icon: Package },
            { label: "Bo'sh tara", value: courier.empty_containers, icon: Package },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="font-bold text-gray-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Inventory Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Kuryerdagi mahsulotlar</h3>
          <button onClick={() => setShowIssueModal(true)} className="btn btn-primary flex items-center gap-2">
            <PackagePlus size={16} /> Mahsulot berish
          </button>
        </div>

        {inventoryLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : inventory.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            Kuryerda mahsulot yo'q
          </div>
        ) : (
          <div className="space-y-2">
            {inventory.map(item => (
              <div key={item.product_id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{item.product_name}</p>
                  <p className="text-xs text-gray-400">Yangilangan: {new Date(item.updated_at).toLocaleString('uz-UZ')}</p>
                </div>
                <span className="font-bold text-lg text-blue-600">{item.quantity} ta</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily History Section */}
      <div className="card">
        <button
          onClick={() => setDailyOpen(o => !o)}
          className="w-full flex items-center gap-2 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl px-3 py-2.5 transition-colors"
        >
          <CalendarDays size={16} className="text-blue-500 shrink-0" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex-1">Kunlik hisobot</h3>
          {dailySummary.length > 0 && (
            <span className="text-xs text-gray-400">{dailySummary.length} kun</span>
          )}
          {dailyOpen ? <ChevronUp size={15} className="text-gray-500 shrink-0" /> : <ChevronDown size={15} className="text-gray-500 shrink-0" />}
        </button>

        {dailyOpen && (
          <div className="mt-4">
            {dailyLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : dailySummary.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Ma'lumot yo'q</div>
            ) : (() => {
              const PAGE_SIZE = 30
              const totalPages = Math.ceil(dailySummary.length / PAGE_SIZE)
              const page = Math.min(dailyPage, totalPages - 1)
              const slice = dailySummary.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Sana</th>
                          <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Buyurtma</th>
                          <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Yetkazildi</th>
                          <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Qaytarildi</th>
                          <th className="hidden sm:table-cell text-right py-2 px-2 text-xs font-medium text-gray-500">Naqd</th>
                          <th className="hidden sm:table-cell text-right py-2 px-2 text-xs font-medium text-gray-500">Karta</th>
                          <th className="hidden sm:table-cell text-right py-2 px-2 text-xs font-medium text-gray-500">Payme</th>
                          <th className="hidden sm:table-cell text-right py-2 px-2 text-xs font-medium text-gray-500">Avans</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Jami</th>
                          <th className="py-2 px-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {slice.map(day => (
                          <tr
                            key={day.date}
                            onClick={() => openDayDetail(day.date)}
                            className="border-b border-gray-50 dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{day.date}</td>
                            <td className="py-2.5 px-2 text-center text-gray-700 dark:text-gray-300">{day.orders_count}</td>
                            <td className="py-2.5 px-2 text-center"><span className="text-blue-600 font-medium">{day.total_delivered}</span></td>
                            <td className="py-2.5 px-2 text-center"><span className="text-green-600 font-medium">{day.total_returned}</span></td>
                            <td className="hidden sm:table-cell py-2.5 px-2 text-right text-xs whitespace-nowrap">
                              {day.cash_income > 0 ? <span className="text-green-600 font-medium">{formatMoney(day.cash_income)}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="hidden sm:table-cell py-2.5 px-2 text-right text-xs whitespace-nowrap">
                              {day.card_income > 0 ? <span className="text-purple-600 font-medium">{formatMoney(day.card_income)}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="hidden sm:table-cell py-2.5 px-2 text-right text-xs whitespace-nowrap">
                              {day.payme_income > 0 ? <span className="text-indigo-600 font-medium">{formatMoney(day.payme_income)}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="hidden sm:table-cell py-2.5 px-2 text-right text-xs whitespace-nowrap">
                              {day.advance_income > 0 ? <span className="text-blue-500 font-medium">{formatMoney(day.advance_income)}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-gray-900 dark:text-white text-xs whitespace-nowrap">{formatMoney(day.total_income)}</td>
                            <td className="py-2.5 px-2 text-gray-400"><ChevronRight size={14} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <button
                        onClick={() => setDailyPage(p => Math.min(p + 1, totalPages - 1))}
                        disabled={page >= totalPages - 1}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                      >
                        <ChevronDown size={14} className="-rotate-90" /> Oldingi
                      </button>
                      <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
                      <button
                        onClick={() => setDailyPage(p => Math.max(p - 1, 0))}
                        disabled={page === 0}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                      >
                        Keyingi <ChevronDown size={14} className="rotate-90" />
                      </button>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="card">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpensesOpen(o => !o)}
            className="flex items-center gap-2 flex-1 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl px-3 py-2.5 transition-colors"
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex-1">Xarajatlar</h3>
            {expenses.length > 0 && (
              <span className="text-xs text-gray-400">{expenses.length} ta</span>
            )}
            {expensesOpen ? <ChevronUp size={15} className="text-gray-500 shrink-0" /> : <ChevronDown size={15} className="text-gray-500 shrink-0" />}
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center gap-1.5 btn btn-primary text-sm py-1.5 px-3 shrink-0"
          >
            <Plus size={14} /> Qo'shish
          </button>
        </div>
        {expensesOpen && (
          <div className="mt-4">
            {expensesLoading ? (
              <div className="text-center py-6 text-gray-400 text-sm">Yuklanmoqda...</div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">Xarajatlar yo'q</div>
            ) : (() => {
              const PAGE_SIZE = 30
              const totalPages = Math.ceil(expenses.length / PAGE_SIZE)
              const page = Math.min(expensesPage, totalPages - 1)
              const slice = expenses.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Sana</th>
                          <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Sarlavha</th>
                          <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Tur</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Summa</th>
                          {canDeleteExpense && <th className="py-2 px-2 w-8"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {slice.map(exp => (
                          <tr key={exp.id} className="border-b border-gray-50 dark:border-gray-800">
                            <td className="py-2.5 px-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(exp.created_at)}</td>
                            <td className="py-2.5 px-2 text-gray-800 dark:text-gray-200">{exp.title}</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${exp.payment_method === 'naqd' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                                {exp.payment_method === 'naqd' ? 'Naqd' : 'Karta'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-red-500 whitespace-nowrap">−{formatMoney(exp.amount)}</td>
                            {canDeleteExpense && (
                              <td className="py-2.5 px-2">
                                <button onClick={() => setDeleteExpenseTarget({ id: exp.id, title: exp.title, amount: exp.amount })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <button
                        onClick={() => setExpensesPage(p => Math.min(p + 1, totalPages - 1))}
                        disabled={page >= totalPages - 1}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                      >
                        <ChevronDown size={14} className="-rotate-90" /> Oldingi
                      </button>
                      <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
                      <button
                        onClick={() => setExpensesPage(p => Math.max(p - 1, 0))}
                        disabled={page === 0}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                      >
                        Keyingi <ChevronDown size={14} className="rotate-90" />
                      </button>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* Debt history */}
      <div className="card">
        <button
          onClick={() => setDebtOpen(o => !o)}
          className="w-full flex items-center gap-2 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl px-3 py-2.5 transition-colors"
        >
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex-1">Qarz tarixi</h3>
          {debtSummary.length > 0 && (
            <span className="text-xs text-gray-400">{debtSummary.length} kun</span>
          )}
          {debtOpen ? <ChevronUp size={15} className="text-gray-500 shrink-0" /> : <ChevronDown size={15} className="text-gray-500 shrink-0" />}
        </button>
        {debtOpen && (
          <div className="mt-4">
            {debtSummaryLoading ? (
              <div className="text-center py-6 text-gray-400 text-sm">Yuklanmoqda...</div>
            ) : debtSummary.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">Qarz operatsiyalari yo'q</div>
            ) : (() => {
              const PAGE_SIZE = 30
              const totalPages = Math.ceil(debtSummary.length / PAGE_SIZE)
              const page = Math.min(debtPage, totalPages - 1)
              const slice = debtSummary.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Sana</th>
                          <th className="text-center py-2 px-2 text-xs font-medium text-red-400">Berdi</th>
                          <th className="hidden sm:table-cell text-right py-2 px-2 text-xs font-medium text-red-400">Summa</th>
                          <th className="text-center py-2 px-2 text-xs font-medium text-green-500">Oldi</th>
                          <th className="hidden sm:table-cell text-right py-2 px-3 text-xs font-medium text-green-500">Summa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slice.map(day => (
                          <tr
                            key={day.date}
                            onClick={() => openDebtDayDetail(day.date)}
                            className="border-b border-gray-50 dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{day.date}</td>
                            <td className="py-2.5 px-2 text-center">
                              {day.debt_count > 0 ? <span className="text-red-500 font-medium">{day.debt_count} ta</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="hidden sm:table-cell py-2.5 px-2 text-right text-red-500 text-xs whitespace-nowrap">
                              {day.debt_total > 0 ? formatMoney(day.debt_total) : '—'}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              {day.payment_count > 0 ? <span className="text-green-600 font-medium">{day.payment_count} ta</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="hidden sm:table-cell py-2.5 px-3 text-right text-green-600 text-xs whitespace-nowrap">
                              {day.payment_total > 0 ? formatMoney(day.payment_total) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <button
                        onClick={() => setDebtPage(p => Math.min(p + 1, totalPages - 1))}
                        disabled={page >= totalPages - 1}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                      >
                        <ChevronDown size={14} className="-rotate-90" /> Oldingi
                      </button>
                      <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
                      <button
                        onClick={() => setDebtPage(p => Math.max(p - 1, 0))}
                        disabled={page === 0}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                      >
                        Keyingi <ChevronDown size={14} className="rotate-90" />
                      </button>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* Debt day detail modal */}
      {selectedDebtDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedDebtDate} — Qarzlar</h2>
              <button onClick={() => setSelectedDebtDate(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {debtDayLoading ? (
                <div className="text-center py-8 text-gray-400">Yuklanmoqda...</div>
              ) : !debtDayDetail ? (
                <div className="text-center py-8 text-gray-400">Ma'lumot yo'q</div>
              ) : (
                <>
                  {debtDayDetail.debts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Qarz berdi ({debtDayDetail.debts.length} ta)</p>
                      <div className="space-y-2">
                        {debtDayDetail.debts.map(tx => (
                          <div key={tx.id} className="flex items-center justify-between bg-red-50 dark:bg-red-900/10 rounded-xl px-3 py-2.5">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{tx.client_name}</span>
                            <span className="text-sm font-semibold text-red-500 whitespace-nowrap ml-3">{formatMoney(tx.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {debtDayDetail.payments.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Qarz oldi ({debtDayDetail.payments.length} ta)</p>
                      <div className="space-y-2">
                        {debtDayDetail.payments.map(tx => (
                          <div key={tx.id} className="flex items-center justify-between bg-green-50 dark:bg-green-900/10 rounded-xl px-3 py-2.5">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{tx.client_name}</span>
                            <div className="flex items-center gap-2 ml-3">
                              {tx.payment_method && <span className="text-xs text-gray-400">{tx.payment_method}</span>}
                              <span className="text-sm font-semibold text-green-600 whitespace-nowrap">{formatMoney(tx.amount)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {debtDayDetail.debts.length === 0 && debtDayDetail.payments.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">Ma'lumot yo'q</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Xarajat qo'shish</h2>
              <button onClick={() => setShowExpenseModal(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To'lov turi</label>
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600">
                {(['naqd', 'karta'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setExpenseForm(f => ({ ...f, payment_method: m }))}
                    className={`flex-1 py-2 text-sm font-semibold transition-colors ${expenseForm.payment_method === m ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                  >
                    {m === 'naqd' ? '💵 Naqd' : '💳 Karta'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sarlavha</label>
              <input
                className="input w-full"
                placeholder="Masalan: Tushlik, Benzin..."
                value={expenseForm.title}
                onChange={e => setExpenseForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Summa (so'm)</label>
              <input
                className="input w-full"
                type="number"
                placeholder="0"
                value={expenseForm.amount}
                onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowExpenseModal(false)} className="btn btn-secondary flex-1">Bekor</button>
              <button
                onClick={handleAddExpense}
                disabled={expenseSaving || !expenseForm.title.trim() || !expenseForm.amount}
                className="btn btn-primary flex-1"
              >
                {expenseSaving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Password Modal */}
      {showSetPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Parol o'rnatish</h2>
              <button onClick={() => setShowSetPasswordModal(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Kuryer <strong>{courier?.first_name} {courier?.last_name}</strong> uchun yangi parol o'rnating.<br />
              Kuryer shu parol bilan <span className="font-mono text-xs">akowater.duckdns.org</span> orqali kiradi.
            </p>
            <input
              type="text"
              className="input w-full mb-4"
              placeholder="Yangi parol (kamida 4 belgi)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowSetPasswordModal(false)} className="btn btn-secondary flex-1">Bekor</button>
              <button
                disabled={passwordSaving || newPassword.length < 4}
                className="btn btn-primary flex-1"
                onClick={async () => {
                  setPasswordSaving(true)
                  try {
                    await api.post(`/couriers/${id}/set-password`, { password: newPassword })
                    toast.success('Parol muvaffaqiyatli o\'rnatildi')
                    setShowSetPasswordModal(false)
                  } catch {
                    toast.error('Xatolik yuz berdi')
                  } finally {
                    setPasswordSaving(false)
                  }
                }}
              >
                {passwordSaving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete expense confirm modal */}
      {deleteExpenseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
              <Trash2 size={22} className="text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 dark:text-white mb-1">Xarajatni o'chirish</h3>
            <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-1">
              <span className="font-medium text-gray-800 dark:text-gray-200">"{deleteExpenseTarget.title}"</span>
            </p>
            <p className="text-center text-red-600 font-bold text-xl mb-3">{formatMoney(deleteExpenseTarget.amount)}</p>
            <p className="text-xs text-center text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mb-4">
              Pul kuryer smena holatiga qarab balansgа yoki kassaga qaytariladi
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteExpenseTarget(null)}
                disabled={deletingExpense}
                className="flex-1 btn btn-secondary"
              >
                Bekor
              </button>
              <button
                onClick={handleDeleteExpense}
                disabled={deletingExpense}
                className="flex-1 btn bg-red-600 hover:bg-red-700 text-white border-0 disabled:opacity-50"
              >
                {deletingExpense ? 'O\'chirilmoqda...' : 'O\'chirish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Detail Modal */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedDate} — Buyurtmalar</h2>
                {!dayOrdersLoading && (
                  <p className="text-xs text-gray-400 mt-0.5">{dayOrders.length} ta buyurtma</p>
                )}
              </div>
              <button onClick={() => setSelectedDate(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {dayOrdersLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
                ))
              ) : dayOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-400">Buyurtmalar yo'q</div>
              ) : (
                <>
                  {/* Day totals */}
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    {[
                      { label: 'Yetkazildi', value: `${dayOrders.reduce((s, o) => s + o.containers_delivered, 0)} ta`, color: 'text-blue-600' },
                      { label: 'Qaytarildi', value: `${dayOrders.reduce((s, o) => s + o.containers_returned, 0)} ta`, color: 'text-green-600' },
                      { label: 'Tushum', value: formatMoney(dayOrders.reduce((s, o) => s + o.paid_amount, 0)), color: 'text-gray-900 dark:text-white' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-400 mb-1">{label}</p>
                        <p className={`font-bold ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {dayOrders.map(order => (
                    <div key={order.id} className="border border-gray-100 dark:border-gray-700 rounded-xl p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs text-gray-400">#{order.id} · {order.created_at ? formatDateTime(order.created_at) : ''}</span>
                          <p className="font-medium text-gray-900 dark:text-white mt-0.5">
                            {order.delivery_address || order.client_name || "Manzil yo'q"}
                          </p>
                          {order.delivery_address && order.client_name && (
                            <p className="text-xs text-gray-400">{order.client_name}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900 dark:text-white">{formatMoney(order.paid_amount)}</p>
                          {order.cash_amount > 0   && <p className="text-xs text-green-600">Naqd: {formatMoney(order.cash_amount)}</p>}
                          {order.card_amount > 0   && <p className="text-xs text-purple-600">Karta: {formatMoney(order.card_amount)}</p>}
                          {order.payme_amount > 0  && <p className="text-xs text-indigo-600">Payme: {formatMoney(order.payme_amount)}</p>}
                          {order.advance_used > 0  && <p className="text-xs text-blue-500">Avans: {formatMoney(order.advance_used)}</p>}
                          {order.debt_amount > 0   && <p className="text-xs text-red-500">Qarz: {formatMoney(order.debt_amount)}</p>}
                          {order.paid_amount === 0 && order.advance_used === 0 && order.debt_amount === 0 && (
                            <p className="text-xs text-gray-400">—</p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-3 text-xs">
                        {order.containers_delivered > 0 && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Package size={11} /> {order.containers_delivered} yetkazildi
                          </span>
                        )}
                        {order.containers_returned > 0 && (
                          <span className="flex items-center gap-1 text-green-600">
                            <Package size={11} /> {order.containers_returned} qaytarildi
                          </span>
                        )}
                      </div>

                      {order.items.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-gray-50 dark:border-gray-700">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs text-gray-500">
                              <span>{item.product_name}</span>
                              <span className="font-medium">
                                {item.delivered_quantity !== item.quantity
                                  ? <>{item.delivered_quantity}<span className="text-gray-300">/{item.quantity}</span> ta</>
                                  : <>{item.quantity} ta</>
                                }
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Issue Products Modal */}
      {showIssueModal && (
        <IssueProductsModal
          courierId={id}
          onClose={() => setShowIssueModal(false)}
          onDone={() => {
            setShowIssueModal(false)
            loadInventory()
          }}
        />
      )}

      {/* Close Shift Modal */}
      {showCloseShiftModal && (
        <CloseShiftModal
          courier={courier}
          onClose={() => setShowCloseShiftModal(false)}
          onDone={() => {
            setShowCloseShiftModal(false)
            loadCourier()
          }}
        />
      )}

      {/* Open Shift Modal */}
      {showOpenShiftModal && (
        <OpenShiftModal
          courierId={courier.id}
          onClose={() => setShowOpenShiftModal(false)}
          onDone={() => { setShowOpenShiftModal(false); loadCourier() }}
        />
      )}
    </div>
  )
}

function OpenShiftModal({ courierId, onClose, onDone }: { courierId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToastStore()
  const [products, setProducts] = useState<Product[]>([])
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<{ product_id: string; quantity: number }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/products/').then(({ data }) => setProducts(Array.isArray(data) ? data : (data.items || []))),
      api.get('/warehouse/stock').then(({ data }) => setWarehouseStock(Array.isArray(data) ? data : (data.items || [])))
    ]).finally(() => setLoading(false))
  }, [])

  const getStock = (productId: string) =>
    warehouseStock.find(s => s.product_id === productId)?.quantity ?? 0

  const updateItem = (index: number, field: 'product_id' | 'quantity', value: any) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const save = async () => {
    setSaving(true)
    try {
      // Open the shift (no product deduction here)
      await api.post(`/couriers/${courierId}/shift/open`, { full_containers: 0 })
      // Issue selected products if any
      const validItems = items.filter(i => i.product_id && i.quantity > 0)
      if (validItems.length > 0) {
        await api.post(`/couriers/${courierId}/issue-products`, { items: validItems })
      }
      toast.success('Smena ochildi!')
      onDone()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Smena ochish</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-400">Yuklanmoqda...</div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400">Kuryerga smena boshida beriladigan mahsulotlarni tanlang (ixtiyoriy)</p>
            <div className="space-y-3">
              {items.map((item, index) => {
                const stock = getStock(item.product_id)
                return (
                  <div key={index} className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Mahsulot</label>
                        <select
                          value={item.product_id}
                          onChange={e => updateItem(index, 'product_id', e.target.value)}
                          className="input w-full text-sm"
                        >
                          <option value="">Tanlang...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Miqdor {item.product_id && <span className="text-blue-500">(omborda: {stock})</span>}
                        </label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateItem(index, 'quantity', +e.target.value)}
                          className="input w-full text-sm"
                          placeholder="0"
                          max={stock}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => setItems(items.filter((_, i) => i !== index))}
                      className="mt-6 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => setItems([...items, { product_id: '', quantity: 0 }])}
              className="w-full btn btn-secondary flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Mahsulot qo'shish
            </button>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 btn btn-secondary">Bekor qilish</button>
              <button onClick={save} disabled={saving} className="flex-1 btn-success">
                {saving ? 'Saqlanmoqda...' : 'Smena ochish'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CloseShiftModal({ courier, onClose, onDone }: { courier: Courier; onClose: () => void; onDone: () => void }) {
  const toast = useToastStore()
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loadingInventory, setLoadingInventory] = useState(true)
  const [form, setForm] = useState({
    actual_cash: courier.cash_balance,
    actual_card: courier.card_balance,
    actual_payme: courier.payme_balance,
    actual_full_containers: courier.full_containers,
    actual_empty_containers: courier.empty_containers,
    note: '',
    return_goods: true,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Load courier inventory
    api.get(`/couriers/${courier.id}/inventory`)
      .then(({ data }) => setInventory(data.items || []))
      .catch(() => {})
      .finally(() => setLoadingInventory(false))
  }, [courier.id])

  const save = async () => {
    setSaving(true)
    try {
      // Return products to warehouse only if return_goods is true
      if (form.return_goods && inventory.length > 0) {
        const returnItems = inventory.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
        await api.post(`/couriers/${courier.id}/return-products`, { items: returnItems })
      }

      await api.post(`/couriers/${courier.id}/shift/close`, form)
      toast.success('Smena muvaffaqiyatli yopildi!')
      onDone()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Smena yopish</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Inventory section */}
          {loadingInventory ? (
            <div className="text-sm text-gray-400 text-center py-2">Mahsulotlar yuklanmoqda...</div>
          ) : inventory.length > 0 ? (
            <div className={`p-3 rounded-lg border ${form.return_goods ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' : 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600'}`}>
              <p className={`text-sm font-medium mb-2 ${form.return_goods ? 'text-yellow-800 dark:text-yellow-200' : 'text-gray-500 dark:text-gray-400'}`}>
                {form.return_goods ? 'Quyidagi mahsulotlar omborga qaytariladi:' : 'Kuryerda qoladigan mahsulotlar:'}
              </p>
              <div className="space-y-1">
                {inventory.map(item => (
                  <div key={item.product_id} className={`flex justify-between text-sm ${form.return_goods ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-500 dark:text-gray-400'}`}>
                    <span>{item.product_name}</span>
                    <span className="font-semibold">{item.quantity} ta</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center py-2">Kuryerda mahsulot yo'q</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Naqd (so'm)</label>
              <input
                type="number"
                value={form.actual_cash}
                onChange={e => setForm({ ...form, actual_cash: +e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Karta (so'm)</label>
              <input
                type="number"
                value={form.actual_card}
                onChange={e => setForm({ ...form, actual_card: +e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Payme/Click (so'm)</label>
              <input
                type="number"
                value={form.actual_payme}
                onChange={e => setForm({ ...form, actual_payme: +e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">To'la tara (dona)</label>
              <input
                type="number"
                value={form.actual_full_containers}
                onChange={e => setForm({ ...form, actual_full_containers: +e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Bo'sh tara (dona)</label>
              <input
                type="number"
                value={form.actual_empty_containers}
                onChange={e => setForm({ ...form, actual_empty_containers: +e.target.value })}
                className="input"
              />
            </div>
          </div>

          {/* Return goods toggle */}
          {(form.actual_full_containers > 0 || inventory.length > 0) && (
            <div className="rounded-xl border-2 overflow-hidden">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, return_goods: true }))}
                className={`w-full flex items-start gap-3 p-3.5 text-left transition-colors ${form.return_goods ? 'bg-blue-50 dark:bg-blue-900/20 border-b-2 border-blue-200 dark:border-blue-700' : 'bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${form.return_goods ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                  {form.return_goods && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${form.return_goods ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>Tovarni omborga qaytarish</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Mahsulot va idishlar omborga topshiriladi</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, return_goods: false }))}
                className={`w-full flex items-start gap-3 p-3.5 text-left transition-colors ${!form.return_goods ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${!form.return_goods ? 'border-amber-500 bg-amber-500' : 'border-gray-300'}`}>
                  {!form.return_goods && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${!form.return_goods ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>Tovarni kuryerda qoldirish</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Kuryer ertasi kuni omborga kelmay to'g'ridan yetkazadi</p>
                </div>
              </button>
            </div>
          )}

          <div>
            <label className="label">Izoh (ixtiyoriy)</label>
            <textarea
              value={form.note}
              onChange={e => setForm({ ...form, note: e.target.value })}
              className="input"
              rows={2}
              placeholder="Masalan: Hammasi to'g'ri topshirildi"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
            Bekor qilish
          </button>
          <button onClick={save} className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Saqlanmoqda...' : 'Smena yopish'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CouriersPage() {
  return (
    <Routes>
      <Route index element={<CouriersList />} />
      <Route path=":id" element={<CourierDetail />} />
    </Routes>
  )
}
