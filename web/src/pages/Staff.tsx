import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, X, UserCog, Eye, EyeOff, Trash2 } from 'lucide-react'
import api from '@/api/client'
import { formatDate, formatPhone, getInitials, getAvatarColor, normalizePhone } from '@/utils/format'
import { useToastStore } from '@/store/toast'

interface StaffMember {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  role: string
  secondary_role: string | null
  is_active: boolean
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  boshliq: 'Boshliq',
  operator: 'Operator',
  agent: 'Agent',
  courier: 'Kuryer',
}
const ROLE_COLORS: Record<string, string> = {
  boshliq: 'badge-danger',
  operator: 'badge-info',
  agent: 'badge-warning',
  courier: 'badge-success',
}

interface FormState {
  first_name: string; last_name: string; phone: string
  role: string; secondary_role: string; password: string
}

export default function Staff() {
  const toast = useToastStore()
  const navigate = useNavigate()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null)
  const [form, setForm] = useState<FormState>({ first_name: '', last_name: '', phone: '', role: 'operator', secondary_role: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchStaff = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users/')
      setStaff(data.items ?? data)
    } catch {
      toast.error('Xodimlarni yuklashda xatolik')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStaff() }, [])

  const openNew = () => {
    setEditTarget(null)
    setForm({ first_name: '', last_name: '', phone: '', role: 'operator', secondary_role: '', password: '' })
    setShowForm(true)
  }

  const openEdit = (member: StaffMember) => {
    setEditTarget(member)
    setForm({ first_name: member.first_name, last_name: member.last_name ?? '', phone: member.phone, role: member.role, secondary_role: member.secondary_role ?? '', password: '' })
    setShowForm(true)
  }

  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.first_name || !form.phone || !form.role) return
    if (!editTarget && !form.password) { toast.error('Parol kiriting'); return }
    setSaving(true)
    try {
      const payload: Record<string, string | null> = { first_name: form.first_name, last_name: form.last_name, phone: form.phone, role: form.role, secondary_role: form.secondary_role || null }
      if (form.password) payload.password = form.password
      if (editTarget) {
        await api.patch(`/users/${editTarget.id}`, payload)
        toast.success('Xodim yangilandi')
      } else {
        await api.post('/users/', payload)
        toast.success('Xodim qo\'shildi')
      }
      setShowForm(false)
      fetchStaff()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const demoteStaff = async (member: StaffMember) => {
    const name = [member.first_name, member.last_name].filter(Boolean).join(' ')
    if (!confirm(`"${name}" ni xodimlar ro'yxatidan chiqarishni tasdiqlaysizmi?\n\nU mijozlar ro'yxatiga qaytariladi.`)) return
    try {
      await api.delete(`/users/${member.id}`)
      toast.success(`${name} mijozlar ro'yxatiga qaytarildi`)
      fetchStaff()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Xatolik yuz berdi')
    }
  }

  const toggleActive = async (member: StaffMember) => {
    try {
      await api.patch(`/users/${member.id}`, { is_active: !member.is_active })
      toast.success(member.is_active ? 'Xodim o\'chirildi' : 'Xodim faollashtirildi')
      fetchStaff()
    } catch {
      toast.error('Amal bajarilmadi')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Xodimlar</h1>
        <button onClick={openNew} className="btn btn-primary flex items-center gap-1.5">
          <Plus size={15} /> Yangi xodim
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Xodim</th>
                <th className="hidden sm:table-cell table-header">Telefon</th>
                <th className="table-header">Lavozim</th>
                <th className="table-header">Holat</th>
                <th className="hidden lg:table-cell table-header">Qo'shilgan</th>
                <th className="table-header">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="table-cell">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : staff.map(m => {
                    const name = [m.first_name, m.last_name].filter(Boolean).join(' ')
                    return (
                      <tr key={m.id} className="table-row-hover border-t border-gray-100 dark:border-gray-800">
                        <td className="table-cell">
                          <button onClick={() => navigate(`/staff/${m.id}`)} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity text-left">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${getAvatarColor(name)}`}>
                              {getInitials(name)}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400">{name}</span>
                          </button>
                        </td>
                        <td className="hidden sm:table-cell table-cell text-gray-500">{formatPhone(m.phone)}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`badge ${ROLE_COLORS[m.role] ?? 'badge-gray'}`}>
                              {ROLE_LABELS[m.role] ?? m.role}
                            </span>
                            {m.secondary_role && (
                              <span className={`badge ${ROLE_COLORS[m.secondary_role] ?? 'badge-gray'}`}>
                                +{ROLE_LABELS[m.secondary_role] ?? m.secondary_role}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="table-cell">
                          <span className={`badge ${m.is_active ? 'badge-success' : 'badge-gray'}`}>
                            {m.is_active ? 'Faol' : 'Nofaol'}
                          </span>
                        </td>
                        <td className="hidden lg:table-cell table-cell text-gray-500 text-xs">{formatDate(m.created_at)}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500" title="Tahrirlash">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => toggleActive(m)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-orange-500" title={m.is_active ? 'Bloklash' : 'Faollashtirish'}>
                              <UserCog size={14} />
                            </button>
                            <button onClick={() => demoteStaff(m)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500" title="Xodimdan chiqarish">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              {!loading && staff.length === 0 && (
                <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">Xodimlar yo'q</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editTarget ? 'Xodimni tahrirlash' : 'Yangi xodim'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ism *</label>
                  <input className="input w-full" value={form.first_name} onChange={e => set('first_name', e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Familiya</label>
                  <input className="input w-full" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Telefon *</label>
                <input className="input w-full" placeholder="901234567" value={form.phone} onChange={e => set('phone', e.target.value)} onBlur={e => set('phone', normalizePhone(e.target.value))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Lavozim *</label>
                <select className="input w-full" value={form.role} onChange={e => set('role', e.target.value)}>
                  <option value="operator">Operator</option>
                  <option value="agent">Agent</option>
                  <option value="boshliq">Boshliq</option>
                  <option value="courier">Kuryer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Qo'shimcha rol</label>
                <select className="input w-full" value={form.secondary_role} onChange={e => set('secondary_role', e.target.value)}>
                  <option value="">— yo'q —</option>
                  <option value="courier">Kuryer (Telegram mini-app)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Parol {editTarget ? '(o\'zgartirish uchun)' : '*'}
                </label>
                <div className="relative">
                  <input
                    className="input w-full pr-10"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary flex-1">Bekor</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
