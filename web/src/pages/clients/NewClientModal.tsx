import { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import api from '@/api/client'
import { useToastStore } from '@/store/toast'
import { normalizePhone } from '@/utils/format'

interface ClientGroup { id: string; name: string; client_count: number }
interface Props {
  onClose: () => void
  onDone: () => void
  groups?: ClientGroup[]
  defaultGroupId?: string | null
}

interface AddressForm { label: string; address_text: string }
interface ReturnableProduct { id: string; name: string }

export default function NewClientModal({ onClose, onDone, groups = [], defaultGroupId = null }: Props) {
  const toast = useToastStore()
  const [form, setForm] = useState({ phone: '', company_name: '' })
  const [addresses, setAddresses] = useState<AddressForm[]>([])
  const [groupId, setGroupId] = useState<string>(defaultGroupId ?? '')
  const [initialDebt, setInitialDebt] = useState('')
  const [containerBalance, setContainerBalance] = useState('')
  const [containerProductId, setContainerProductId] = useState('')
  const [returnableProducts, setReturnableProducts] = useState<ReturnableProduct[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/products/', { params: { per_page: 100 } })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data.items || [])
        const filtered = list.filter((p: any) => p.is_returnable_container && p.is_active)
        setReturnableProducts(filtered)
        if (filtered.length > 0) setContainerProductId(filtered[0].id)
      })
      .catch(() => {})
  }, [])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const addAddress = () => setAddresses(a => [...a, { label: 'Uy', address_text: '' }])
  const removeAddress = (i: number) => setAddresses(a => a.filter((_, idx) => idx !== i))
  const setAddr = (i: number, k: keyof AddressForm, v: string) =>
    setAddresses(a => a.map((x, idx) => idx === i ? { ...x, [k]: v } : x))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.phone.trim()) return
    setSaving(true)
    try {
      const payload: any = { ...form, first_name: '-' }
      if (groupId) payload.group_id = groupId
      if (initialDebt && parseInt(initialDebt) > 0) payload.initial_debt = parseInt(initialDebt)
      if (containerBalance && parseInt(containerBalance) > 0) payload.container_balance = parseInt(containerBalance)
      const { data: client } = await api.post('/clients/', payload)
      const validAddresses = addresses.filter(a => a.address_text.trim())
      for (let i = 0; i < validAddresses.length; i++) {
        await api.post(`/clients/${client.id}/addresses`, {
          ...validAddresses[i],
          is_primary: i === 0,
        })
      }
      toast.success('Mijoz qo\'shildi')
      onDone()
      onClose()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join('; ')
        : (typeof detail === 'string' ? detail : 'Xatolik yuz berdi')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Yangi mijoz</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Telefon *</label>
            <input className="input w-full" placeholder="901234567" value={form.phone} onChange={e => set('phone', e.target.value)} onBlur={e => set('phone', normalizePhone(e.target.value))} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Firma nomi</label>
            <input className="input w-full" placeholder="Firma / do'kon nomi" value={form.company_name} onChange={e => set('company_name', e.target.value)} />
          </div>

          {/* Group selector */}
          {groups.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Guruh</label>
              <select
                className="input w-full"
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
              >
                <option value="">Guruхsiz</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Initial debt */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Boshlang'ich qarz (so'm)</label>
            <input
              className="input w-full"
              type="number"
              min={0}
              placeholder="0"
              value={initialDebt}
              onChange={e => setInitialDebt(e.target.value)}
            />
          </div>

          {/* Container balance */}
          {returnableProducts.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tara</label>
              <div className="flex gap-2">
                <select
                  className="input flex-1"
                  value={containerProductId}
                  onChange={e => setContainerProductId(e.target.value)}
                >
                  {returnableProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  className="input w-24"
                  type="number"
                  min={0}
                  placeholder="0 ta"
                  value={containerBalance}
                  onChange={e => setContainerBalance(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Addresses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Manzillar</label>
              <button type="button" onClick={addAddress}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus size={13} /> Manzil qo'shish
              </button>
            </div>
            {addresses.length === 0 && (
              <p className="text-xs text-gray-400 italic">Manzil qo'shilmagan</p>
            )}
            <div className="space-y-2">
              {addresses.map((addr, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <select className="input w-full text-xs" value={addr.label}
                      onChange={e => setAddr(i, 'label', e.target.value)}>
                      <option value="Uy">Uy</option>
                      <option value="Ish">Ish</option>
                      <option value="Boshqa">Boshqa</option>
                    </select>
                    <input className="input w-full text-xs" placeholder="Manzil matni..."
                      value={addr.address_text} onChange={e => setAddr(i, 'address_text', e.target.value)} />
                  </div>
                  <button type="button" onClick={() => removeAddress(i)}
                    className="mt-1 p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Bekor qilish</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
