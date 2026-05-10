import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, MapPin, Calendar, ShoppingBag,
  Package, Ban, CheckCircle, ChevronDown, ChevronUp,
  History, Edit2, Save, X, UserCog, Eye, EyeOff, ShieldCheck,
} from 'lucide-react'
import api from '@/api/client'
import { formatMoney, formatDate, formatDateTime, formatPhone, getInitials, getAvatarColor, normalizePhone, clientDisplay } from '@/utils/format'
import { OrderStatusBadge } from '@/utils/orderStatus'
import { useToastStore } from '@/store/toast'
import { useAuthStore } from '@/store/auth'

interface Address { id: string; label: string; address_text: string; latitude: number; longitude: number; is_primary?: boolean }

interface ClientData {
  id: string
  first_name: string
  last_name: string | null
  display_name?: string | null
  phone: string
  company_name?: string | null
  language: string
  debt_amount: number
  advance_amount: number
  is_active: boolean
  is_blocked: boolean
  created_at: string
  telegram_id: number | null
  telegram_username: string | null
  addresses: Address[]
  orders_count: number
  total_spent: number
  container_balance: number
  container_product_id: string | null
  container_product_name: string | null
  user_role: string | null
  user_secondary_role: string | null
  linked_user_id: string | null
}

interface Order {
  id: number | string
  status: string
  total_amount: number
  discount_amount: number
  created_at: string
  items: { product_name: string; quantity: number; price_at_order: number }[]
}

interface ContainerTx {
  id: string
  type: string
  quantity: number
  note: string | null
  created_at: string
}


function MakeOperatorModal({ clientId, clientPhone, onClose, onDone }: { clientId: string; clientPhone: string; onClose: () => void; onDone: () => void }) {
  const toast = useToastStore()
  const [phone, setPhone] = useState(clientPhone)
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!password || password.length < 4) { toast.error('Kamida 4 belgili parol kiriting'); return }
    setSaving(true)
    try {
      await api.post(`/clients/${clientId}/make-operator`, { password, phone: phone || undefined })
      toast.success('Operator login yaratildi! Telefon: ' + phone)
      onDone()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Operator login yaratish</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-500">Bu mijozga veb-panel kirish huquqi beriladi (operator sifatida).</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Login (telefon)</label>
            <input className="input w-full" value={phone} onChange={e => setPhone(e.target.value)} onBlur={e => setPhone(normalizePhone(e.target.value))} placeholder="901234567" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Parol *</label>
            <div className="relative">
              <input
                className="input w-full pr-10"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Kamida 4 belgi"
              />
              <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn btn-secondary flex-1">Bekor</button>
          <button onClick={save} disabled={saving} className="btn btn-primary flex-1">
            {saving ? 'Saqlanmoqda...' : 'Yaratish'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MakeAgentModal({ clientId, clientPhone, onClose, onDone }: { clientId: string; clientPhone: string; onClose: () => void; onDone: () => void }) {
  const toast = useToastStore()
  const [phone, setPhone] = useState(clientPhone)
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!password || password.length < 4) { toast.error('Kamida 4 belgili parol kiriting'); return }
    setSaving(true)
    try {
      await api.post(`/clients/${clientId}/make-agent`, { password, phone: phone || undefined })
      toast.success('Agent login yaratildi! Telefon: ' + phone)
      onDone()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Agent login yaratish</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-500">Bu mijozga veb-panel kirish huquqi beriladi (agent sifatida).</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Login (telefon)</label>
            <input className="input w-full" value={phone} onChange={e => setPhone(e.target.value)} onBlur={e => setPhone(normalizePhone(e.target.value))} placeholder="901234567" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Parol *</label>
            <div className="relative">
              <input
                className="input w-full pr-10"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Kamida 4 belgi"
              />
              <button type="button" onClick={() => setShowPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn btn-secondary flex-1">Bekor</button>
          <button onClick={save} disabled={saving} className="btn btn-primary flex-1">
            {saving ? 'Saqlanmoqda...' : 'Yaratish'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToastStore()

  const [client, setClient] = useState<ClientData | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [containers, setContainers] = useState<ContainerTx[]>([])
  const [activeTab, setActiveTab] = useState<'orders' | 'containers'>('orders')
  const [expandedOrder, setExpandedOrder] = useState<number | string | null>(null)
  const [showContainerHistory, setShowContainerHistory] = useState(false)
  const [adjustDelta, setAdjustDelta] = useState(0)
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ phone: '', primaryAddressText: '', primaryAddressId: '', companyName: '' })
  const [showMakeOperator, setShowMakeOperator] = useState(false)
  const [showMakeAgent, setShowMakeAgent] = useState(false)
  const { user: authUser } = useAuthStore()
  const isBoshliq = authUser?.role === 'boshliq' || authUser?.role === 'super_admin'
  const isCurrentUserAgent = authUser?.role === 'agent'

  // Advance adjustment form (boshliq only)
  const [showAdvanceForm, setShowAdvanceForm] = useState(false)
  const [advanceDelta, setAdvanceDelta] = useState('')
  const [advanceSign, setAdvanceSign] = useState<'+' | '-'>('+')
  const [advanceNote, setAdvanceNote] = useState('')
  const [advanceSaving, setAdvanceSaving] = useState(false)

  // Debt adjustment form (boshliq only)
  const [showDebtForm, setShowDebtForm] = useState(false)
  const [debtDelta, setDebtDelta] = useState('')
  const [debtSign, setDebtSign] = useState<'+' | '-'>('+')
  const [debtNote, setDebtNote] = useState('')
  const [debtSaving, setDebtSaving] = useState(false)

  const fetchClient = async () => {
    try {
      const { data } = await api.get(`/clients/${id}`)
      setClient(data)
      const primaryAddr = data.addresses?.find((a: Address) => a.is_primary) ?? data.addresses?.[0] ?? null
      setEditForm({
        phone: data.phone,
        primaryAddressText: primaryAddr?.address_text ?? '',
        primaryAddressId: primaryAddr?.id ?? '',
        companyName: data.company_name ?? '',
      })
    } catch {
      toast.error('Mijoz topilmadi')
      navigate('/clients')
    } finally {
      setLoading(false)
    }
  }

  const fetchOrders = async () => {
    try {
      const { data } = await api.get('/orders/', { params: { client_id: id, per_page: 50 } })
      setOrders(Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [])
    } catch {}
  }

  const fetchContainers = async () => {
    try {
      const { data } = await api.get(`/containers/${id}/history`)
      setContainers(Array.isArray(data) ? data : [])
    } catch {}
  }

  const handleAdjust = async () => {
    if (adjustDelta === 0) { toast.error("Miqdor 0 bo'lishi mumkin emas"); return }
    setAdjusting(true)
    try {
      await api.post(`/containers/${id}/adjust`, {
        delta: adjustDelta,
        note: adjustNote.trim() || null,
        product_id: client?.container_product_id ?? null,
      })
      toast.success(`Tara balansi ${adjustDelta > 0 ? '+' : ''}${adjustDelta} ga o'zgartirildi`)
      setAdjustDelta(0)
      setAdjustNote('')
      await fetchClient()
      await fetchContainers()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setAdjusting(false)
    }
  }

  const handleAdvanceAdjust = async () => {
    const amt = parseInt(advanceDelta)
    if (!amt || amt <= 0) { toast.error('To\'g\'ri summa kiriting'); return }
    const delta = advanceSign === '+' ? amt : -amt
    setAdvanceSaving(true)
    try {
      await api.post(`/clients/${id}/adjust-advance`, { delta, note: advanceNote || null })
      toast.success(advanceSign === '+' ? 'Avans qo\'shildi' : 'Avans kamaytirildi')
      setShowAdvanceForm(false)
      setAdvanceDelta(''); setAdvanceNote('')
      await fetchClient()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik')
    } finally {
      setAdvanceSaving(false)
    }
  }

  const handleDebtAdjust = async () => {
    const amt = parseInt(debtDelta)
    if (!amt || amt <= 0) { toast.error('To\'g\'ri summa kiriting'); return }
    const delta = debtSign === '+' ? amt : -amt
    setDebtSaving(true)
    try {
      await api.post(`/clients/${id}/adjust-debt`, { delta, note: debtNote || null })
      toast.success(debtSign === '+' ? 'Qarz qo\'shildi' : 'Qarz kamaytirildi')
      setShowDebtForm(false)
      setDebtDelta(''); setDebtNote('')
      await fetchClient()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik')
    } finally {
      setDebtSaving(false)
    }
  }

  useEffect(() => {
    fetchClient()
    fetchOrders()
    fetchContainers()
  }, [id])

  const handleSave = async () => {
    try {
      await api.patch(`/clients/${id}`, {
        phone: editForm.phone,
        company_name: editForm.companyName.trim() || null,
      })
      if (editForm.primaryAddressText.trim()) {
        if (editForm.primaryAddressId) {
          await api.patch(`/clients/${id}/addresses/${editForm.primaryAddressId}`, {
            label: client?.addresses?.find(a => a.id === editForm.primaryAddressId)?.label ?? 'Uy',
            address_text: editForm.primaryAddressText.trim(),
            is_primary: true,
          })
        } else {
          await api.post(`/clients/${id}/addresses`, {
            label: 'Uy',
            address_text: editForm.primaryAddressText.trim(),
            is_primary: true,
          })
        }
      }
      toast.success('O\'zgarishlar saqlandi')
      setEditing(false)
      fetchClient()
    } catch {
      toast.error('Saqlashda xatolik')
    }
  }

  const handleBlock = async () => {
    if (!client) return
    try {
      await api.patch(`/clients/${id}`, { is_blocked: !client.is_blocked })
      toast.success(client.is_blocked ? 'Blok olib tashlandi' : 'Mijoz bloklandi')
      fetchClient()
    } catch {
      toast.error('Amal bajarilmadi')
    }
  }

  const isOperator = client?.user_role === 'operator'
  const isAgent = client?.user_role === 'agent'
  const isCourier = client?.user_role === 'courier' || client?.user_secondary_role === 'courier'

  const handleOperatorToggle = async () => {
    if (!client) return
    if (!isOperator) {
      setShowMakeOperator(true)
    } else {
      if (!confirm(`"${clientDisplay(client)}" operator rolini olib tashlashni tasdiqlaysizmi?`)) return
      try {
        if (isCourier) {
          await api.post(`/clients/${id}/change-role`, { role: 'courier' })
          if (client.linked_user_id) await api.patch(`/users/${client.linked_user_id}`, { secondary_role: null })
        } else {
          await api.post(`/clients/${id}/change-role`, { role: 'client' })
        }
        toast.success('Operator roli olib tashlandi')
        fetchClient()
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? 'Xatolik')
      }
    }
  }

  const handleAgentToggle = async () => {
    if (!client) return
    if (!isAgent) {
      setShowMakeAgent(true)
    } else {
      if (!confirm(`"${clientDisplay(client)}" agent rolini olib tashlashni tasdiqlaysizmi?`)) return
      try {
        await api.post(`/clients/${id}/change-role`, { role: 'client' })
        toast.success('Agent roli olib tashlandi')
        fetchClient()
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? 'Xatolik')
      }
    }
  }

  const handleKuryerToggle = async () => {
    if (!client) return
    if (!isCourier) {
      if (isOperator && client.linked_user_id) {
        try {
          await api.patch(`/users/${client.linked_user_id}`, { secondary_role: 'courier' })
          toast.success("Kuryer roli qo'shildi")
          fetchClient()
        } catch (err: any) {
          toast.error(err?.response?.data?.detail ?? 'Xatolik')
        }
      } else if (client.linked_user_id) {
        try {
          await api.post(`/clients/${id}/change-role`, { role: 'courier' })
          toast.success('Kuryer qilindi')
          fetchClient()
        } catch (err: any) {
          toast.error(err?.response?.data?.detail ?? 'Xatolik')
        }
      }
    } else {
      if (!confirm(`"${clientDisplay(client)}" kuryer rolini olib tashlashni tasdiqlaysizmi?`)) return
      try {
        if (client.user_secondary_role === 'courier' && client.linked_user_id) {
          await api.patch(`/users/${client.linked_user_id}`, { secondary_role: null })
        } else {
          await api.post(`/clients/${id}/change-role`, { role: 'client' })
        }
        toast.success('Kuryer roli olib tashlandi')
        fetchClient()
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? 'Xatolik')
      }
    }
  }

  if (loading || !client) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="card h-40" />
      </div>
    )
  }

  const displayLabel = client.display_name ?? clientDisplay(client)
  const initials = getInitials(displayLabel)
  const avatarColor = getAvatarColor(displayLabel)

  return (
    <div className="space-y-5">
      {showMakeOperator && (
        <MakeOperatorModal
          clientId={id!}
          clientPhone={client.phone}
          onClose={() => setShowMakeOperator(false)}
          onDone={() => { setShowMakeOperator(false); fetchClient() }}
        />
      )}
      {showMakeAgent && (
        <MakeAgentModal
          clientId={id!}
          clientPhone={client.phone}
          onClose={() => setShowMakeAgent(false)}
          onDone={() => { setShowMakeAgent(false); fetchClient() }}
        />
      )}

      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft size={16} /> Mijozlar
      </button>

      {/* Profile Card */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <span className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white ${avatarColor}`}>
              {initials}
            </span>
            {editing ? (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Manzil</label>
                  <input
                    className="input text-sm w-56"
                    value={editForm.primaryAddressText}
                    onChange={e => setEditForm(f => ({ ...f, primaryAddressText: e.target.value }))}
                    placeholder="Manzilni kiriting..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Telefon</label>
                  <input
                    className="input text-sm w-56"
                    value={editForm.phone}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    onBlur={e => setEditForm(f => ({ ...f, phone: normalizePhone(e.target.value) }))}
                    placeholder="901234567"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Firma nomi</label>
                  <input
                    className="input text-sm w-56"
                    value={editForm.companyName}
                    onChange={e => setEditForm(f => ({ ...f, companyName: e.target.value }))}
                    placeholder="Firma nomi (ixtiyoriy)"
                  />
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{displayLabel}</h2>
                <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                  <Phone size={13} /> {formatPhone(client.phone)}
                </div>
                {client.company_name && (
                  <div className="text-xs text-gray-500 mt-0.5 font-medium">{client.company_name}</div>
                )}
                {client.telegram_username && (
                  <div className="text-xs text-blue-500 mt-0.5">@{client.telegram_username}</div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="btn btn-secondary flex items-center gap-1.5">
                  <X size={14} /> Bekor
                </button>
                <button onClick={handleSave} className="btn btn-primary flex items-center gap-1.5">
                  <Save size={14} /> Saqlash
                </button>
              </>
            ) : (
              <>
                {!isCurrentUserAgent && (
                  <button onClick={() => setEditing(true)} className="btn btn-secondary flex items-center gap-1.5">
                    <Edit2 size={14} /> Tahrirlash
                  </button>
                )}
                {isBoshliq && (
                  <button
                    onClick={handleOperatorToggle}
                    className={`btn flex items-center gap-1.5 text-sm font-semibold ${
                      isOperator
                        ? 'bg-blue-500 hover:bg-blue-600 text-white border-transparent'
                        : 'btn-secondary'
                    }`}
                  >
                    <ShieldCheck size={14} />
                    {isOperator ? 'Operator ✓' : 'Operator qilish'}
                  </button>
                )}
                {isBoshliq && (
                  <button
                    onClick={handleAgentToggle}
                    className={`btn flex items-center gap-1.5 text-sm font-semibold ${
                      isAgent
                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-transparent'
                        : 'btn-secondary'
                    }`}
                  >
                    <ShieldCheck size={14} />
                    {isAgent ? 'Agent ✓' : 'Agent qilish'}
                  </button>
                )}
                {isBoshliq && (client.linked_user_id || !isOperator) && (
                  <button
                    onClick={handleKuryerToggle}
                    disabled={!client.linked_user_id}
                    title={!client.linked_user_id ? "Bot orqali ro'yxatdan o'tmagan" : undefined}
                    className={`btn flex items-center gap-1.5 text-sm font-semibold ${
                      isCourier
                        ? 'bg-green-500 hover:bg-green-600 text-white border-transparent'
                        : client.linked_user_id
                          ? 'btn-secondary'
                          : 'btn-secondary opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <UserCog size={14} />
                    {isCourier ? 'Kuryer ✓' : 'Kuryer qilish'}
                  </button>
                )}
                {isBoshliq && (
                  <button onClick={handleBlock} className={`btn flex items-center gap-1.5 ${client.is_blocked ? 'btn-success' : 'btn-danger'}`}>
                    {client.is_blocked ? <><CheckCircle size={14} /> Blokdan chiqarish</> : <><Ban size={14} /> Bloklash</>}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {client.is_blocked
            ? <span className="badge badge-danger">Bloklangan</span>
            : client.is_active
              ? <span className="badge badge-success">Faol</span>
              : <span className="badge badge-gray">Nofaol</span>}
          <span className="badge badge-info flex items-center gap-1"><Calendar size={11} /> {formatDate(client.created_at)}</span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-xs text-gray-500">Buyurtmalar</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-1">
              <ShoppingBag size={16} className="text-blue-500" /> {client.orders_count}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Jami xarid</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{formatMoney(client.total_spent)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Qarz</p>
            <p className={`text-xl font-bold ${client.debt_amount > 0 ? 'text-red-500' : 'text-gray-400'}`}>
              {client.debt_amount > 0 ? formatMoney(client.debt_amount) : '—'}
            </p>
            {isBoshliq && (
              <button onClick={() => { setShowDebtForm(v => !v); setShowAdvanceForm(false) }} className="text-xs text-blue-500 mt-0.5">
                Tahrirlash
              </button>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Avans</p>
            <p className={`text-xl font-bold ${client.advance_amount > 0 ? 'text-green-500' : 'text-gray-400'}`}>
              {client.advance_amount > 0 ? formatMoney(client.advance_amount) : '—'}
            </p>
            {isBoshliq && (
              <button onClick={() => { setShowAdvanceForm(v => !v); setShowDebtForm(false) }} className="text-xs text-blue-500 mt-0.5">
                Tahrirlash
              </button>
            )}
          </div>
        </div>

        {/* Advance adjust form */}
        {isBoshliq && showAdvanceForm && (
          <div className="mt-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl space-y-3">
            <p className="text-sm font-semibold text-green-700 dark:text-green-300">Avansni tahrirlash</p>
            <p className="text-xs text-gray-500">Joriy avans: <span className="font-semibold">{formatMoney(client.advance_amount)}</span></p>
            <div className="flex gap-2 items-center">
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <button onClick={() => setAdvanceSign('+')} className={`px-4 py-2 text-sm font-bold ${advanceSign === '+' ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600'}`}>+ Qo'sh</button>
                <button onClick={() => setAdvanceSign('-')} className={`px-4 py-2 text-sm font-bold ${advanceSign === '-' ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600'}`}>− Kamayt</button>
              </div>
              <input type="number" value={advanceDelta} onChange={e => setAdvanceDelta(e.target.value)}
                placeholder="Summa" className="input flex-1" min={1} />
            </div>
            <input type="text" value={advanceNote} onChange={e => setAdvanceNote(e.target.value)}
              placeholder="Sabab (ixtiyoriy)" className="input w-full" />
            <div className="flex gap-2">
              <button onClick={() => setShowAdvanceForm(false)} className="btn btn-secondary flex-1">Bekor</button>
              <button onClick={handleAdvanceAdjust} disabled={advanceSaving} className="btn btn-primary flex-1">
                {advanceSaving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        )}

        {/* Debt adjust form */}
        {isBoshliq && showDebtForm && (
          <div className="mt-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl space-y-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Qarzni tahrirlash</p>
            <p className="text-xs text-gray-500">Joriy qarz: <span className="font-semibold">{formatMoney(client.debt_amount)}</span></p>
            <div className="flex gap-2 items-center">
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <button onClick={() => setDebtSign('+')} className={`px-4 py-2 text-sm font-bold ${debtSign === '+' ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600'}`}>+ Qo'sh</button>
                <button onClick={() => setDebtSign('-')} className={`px-4 py-2 text-sm font-bold ${debtSign === '-' ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600'}`}>− Kamayt</button>
              </div>
              <input type="number" value={debtDelta} onChange={e => setDebtDelta(e.target.value)}
                placeholder="Summa" className="input flex-1" min={1} />
            </div>
            <input type="text" value={debtNote} onChange={e => setDebtNote(e.target.value)}
              placeholder="Sabab (ixtiyoriy)" className="input w-full" />
            <div className="flex gap-2">
              <button onClick={() => setShowDebtForm(false)} className="btn btn-secondary flex-1">Bekor</button>
              <button onClick={handleDebtAdjust} disabled={debtSaving} className="btn btn-primary flex-1">
                {debtSaving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Addresses */}
      {client.addresses.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <MapPin size={15} /> Manzillar
          </h3>
          <div className="space-y-2">
            {client.addresses.map(addr => (
              <div key={addr.id} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="badge badge-gray shrink-0">{addr.label}</span>
                <span>{addr.address_text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs: Orders / Containers */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(['orders', 'containers'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'orders' ? `Buyurtmalar (${orders.length})` : 'Idishlar hisobi'}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {activeTab === 'orders' && (
        <div className="space-y-2">
          {orders.length === 0 && (
            <div className="card text-center text-gray-400 py-6">Buyurtmalar yo'q</div>
          )}
          {orders.map(order => (
            <div key={order.id} className="card p-0 overflow-hidden">
              <button
                onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-400">#{order.id}</span>
                  <OrderStatusBadge status={order.status} />
                  <span className="text-sm text-gray-500">{formatDate(order.created_at)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    {order.discount_amount > 0 ? (
                      <>
                        <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(order.total_amount - order.discount_amount)}</span>
                        <span className="block text-xs text-yellow-600">−{formatMoney(order.discount_amount)} chegirma</span>
                      </>
                    ) : (
                      <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(order.total_amount)}</span>
                    )}
                  </div>
                  {expandedOrder === order.id ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </div>
              </button>

              {expandedOrder === order.id && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1.5">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <Package size={13} className="text-gray-400" />
                        {item.product_name} × {item.quantity}
                      </div>
                      <span className="text-gray-600 dark:text-gray-400">{formatMoney(item.price_at_order * item.quantity)}</span>
                    </div>
                  ))}
                  {order.discount_amount > 0 && (
                    <div className="flex items-center justify-between text-sm pt-1 border-t border-yellow-100 dark:border-yellow-900/30">
                      <span className="text-yellow-600">Chegirma</span>
                      <span className="text-yellow-600 font-medium">−{formatMoney(order.discount_amount)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Containers tab */}
      {activeTab === 'containers' && (
        <div className="space-y-4">
          {/* Current balance */}
          <div className="card flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">Joriy tara balansi</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{client.container_balance} ta</p>
              {client.container_product_name && (
                <p className="text-xs text-blue-500 mt-0.5 flex items-center gap-1">
                  <Package size={11} /> {client.container_product_name}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowContainerHistory(!showContainerHistory)}
              className="btn btn-secondary flex items-center gap-1.5"
            >
              <History size={14} /> Tarix
            </button>
          </div>

          {/* Manual adjustment — boshliq/super_admin only */}
          {isBoshliq && (
            <div className="card space-y-3">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Qo'lda o'zgartirish</p>
              {client.container_product_name && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Package size={11} /> {client.container_product_name} — bo'sh idish soni yangilanadi
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAdjustDelta(d => d - 1)}
                  className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold text-xl flex items-center justify-center active:scale-95"
                >−</button>
                <div className="flex-1 text-center">
                  <span className={`text-2xl font-bold ${adjustDelta > 0 ? 'text-green-600' : adjustDelta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {adjustDelta > 0 ? '+' : ''}{adjustDelta}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {adjustDelta !== 0 ? `Natija: ${client.container_balance + adjustDelta} ta` : 'O\'zgarish yo\'q'}
                  </p>
                </div>
                <button
                  onClick={() => setAdjustDelta(d => d + 1)}
                  className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-bold text-xl flex items-center justify-center active:scale-95"
                >+</button>
              </div>
              <input
                type="text"
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                placeholder="Sabab (ixtiyoriy): masalan, yo'qotildi, topildi..."
                className="input w-full text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setAdjustDelta(0); setAdjustNote('') }}
                  className="btn btn-secondary flex-1"
                  disabled={adjustDelta === 0 && !adjustNote}
                >Bekor</button>
                <button
                  onClick={handleAdjust}
                  disabled={adjustDelta === 0 || adjusting}
                  className="btn btn-primary flex-1 disabled:opacity-50"
                >
                  {adjusting ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </div>
          )}

          {showContainerHistory && (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header">Sana</th>
                      <th className="table-header">Tur</th>
                      <th className="table-header">Miqdor</th>
                      <th className="table-header">Izoh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.length === 0 && (
                      <tr><td colSpan={4} className="table-cell text-center text-gray-400 py-6">Tarix yo'q</td></tr>
                    )}
                    {containers.map(tx => (
                      <tr key={tx.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="table-cell text-xs text-gray-500">{formatDateTime(tx.created_at)}</td>
                        <td className="table-cell">
                          <span className={`badge ${tx.type === 'delivered' ? 'badge-info' : tx.type === 'returned' ? 'badge-success' : tx.type === 'adjustment' ? 'badge-warning' : 'badge-gray'}`}>
                            {tx.type === 'delivered' ? 'Yetkazildi' : tx.type === 'returned' ? 'Qaytarildi' : tx.type === 'adjustment' ? 'Tuzatish' : tx.type}
                          </span>
                        </td>
                        <td className="table-cell font-medium">
                          <span className={
                            tx.type === 'returned' ? 'text-green-500' :
                            tx.type === 'adjustment' ? (tx.quantity >= 0 ? 'text-green-600' : 'text-red-500') :
                            'text-gray-700 dark:text-gray-300'
                          }>
                            {tx.type === 'returned' || (tx.type === 'adjustment' && tx.quantity > 0) ? '+' : ''}{tx.quantity}
                          </span>
                        </td>
                        <td className="table-cell text-gray-500 text-xs">{tx.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
