import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, Save, X, Eye, EyeOff, ShieldCheck, UserCog } from 'lucide-react'
import api from '@/api/client'
import { formatDate, formatPhone, getInitials, getAvatarColor, normalizePhone } from '@/utils/format'
import { useToastStore } from '@/store/toast'
import { useAuthStore } from '@/store/auth'

interface StaffUser {
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
  courier: 'Kuryer',
  client: 'Mijoz',
}
const ROLE_COLORS: Record<string, string> = {
  boshliq: 'badge-danger',
  operator: 'badge-info',
  courier: 'badge-success',
}

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToastStore()
  const { user: authUser } = useAuthStore()
  const isBoshliq = authUser?.role === 'boshliq' || authUser?.role === 'super_admin'

  const [staff, setStaff] = useState<StaffUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', phone: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchStaff = async () => {
    try {
      const { data } = await api.get(`/users/${id}`)
      setStaff(data)
      setEditForm({ first_name: data.first_name, last_name: data.last_name ?? '', phone: data.phone })
    } catch {
      toast.error('Xodim topilmadi')
      navigate('/staff')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStaff() }, [id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Record<string, any> = { ...editForm }
      if (newPassword) payload.password = newPassword
      await api.patch(`/users/${id}`, payload)
      toast.success('Saqlandi')
      setEditing(false)
      setNewPassword('')
      fetchStaff()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Xatolik')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async () => {
    if (!staff) return
    try {
      await api.patch(`/users/${id}`, { is_active: !staff.is_active })
      toast.success(staff.is_active ? 'Bloklandi' : 'Faollashtirildi')
      fetchStaff()
    } catch {
      toast.error('Amal bajarilmadi')
    }
  }

  const handleKuryerToggle = async () => {
    if (!staff) return
    const name = [staff.first_name, staff.last_name].filter(Boolean).join(' ')
    const isCourier = staff.role === 'courier' || staff.secondary_role === 'courier'

    if (!isCourier) {
      // Activate: only works if primary role is operator
      if (staff.role !== 'operator') {
        toast.error("Kuryer roli faqat operator xodimga qo'shimcha qo'shiladi")
        return
      }
      try {
        await api.patch(`/users/${id}`, { secondary_role: 'courier' })
        toast.success("Kuryer roli qo'shildi — endi mini-appga kira oladi")
        fetchStaff()
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? 'Xatolik')
      }
    } else {
      if (!confirm(`"${name}" kuryer rolini olib tashlashni tasdiqlaysizmi?`)) return
      try {
        if (staff.secondary_role === 'courier') {
          // Remove secondary role only
          await api.patch(`/users/${id}`, { secondary_role: null })
          toast.success("Kuryer roli olib tashlandi")
        } else {
          // Demote primary courier to client
          await api.delete(`/users/${id}`)
          toast.success(`${name} mijozlar ro'yxatiga qaytarildi`)
          navigate('/staff')
          return
        }
        fetchStaff()
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? 'Xatolik')
      }
    }
  }

  const demote = async () => {
    if (!staff) return
    const name = [staff.first_name, staff.last_name].filter(Boolean).join(' ')
    if (!confirm(`"${name}" ni xodimlar ro'yxatidan chiqarishni tasdiqlaysizmi?\n\nU mijozlar ro'yxatiga qaytariladi.`)) return
    try {
      await api.delete(`/users/${id}`)
      toast.success(`${name} mijozlar ro'yxatiga qaytarildi`)
      navigate('/staff')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Xatolik')
    }
  }

  if (loading || !staff) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="card h-40" />
      </div>
    )
  }

  const name = [staff.first_name, staff.last_name].filter(Boolean).join(' ')
  const isOperator = staff.role === 'operator' || staff.role === 'boshliq'
  const isCourier = staff.role === 'courier' || staff.secondary_role === 'courier'

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/staff')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft size={16} /> Xodimlar
      </button>

      {/* Profile card */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <span className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white ${getAvatarColor(name)}`}>
              {getInitials(name)}
            </span>
            {editing ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input className="input text-sm w-36" value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} placeholder="Ism" />
                  <input className="input text-sm w-36" value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Familiya" />
                </div>
                <input className="input text-sm w-44" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} onBlur={e => setEditForm(f => ({ ...f, phone: normalizePhone(e.target.value) }))} placeholder="901234567" />
                <div className="relative w-44">
                  <input
                    className="input text-sm w-full pr-8"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Yangi parol (ixtiyoriy)"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPwd ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{name}</h2>
                <p className="text-sm text-gray-500 mt-1">{formatPhone(staff.phone)}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setNewPassword('') }} className="btn btn-secondary flex items-center gap-1.5">
                  <X size={14} /> Bekor
                </button>
                <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center gap-1.5">
                  <Save size={14} /> Saqlash
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="btn btn-secondary flex items-center gap-1.5">
                <Edit2 size={14} /> Tahrirlash
              </button>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className={`badge ${ROLE_COLORS[staff.role] ?? 'badge-gray'}`}>{ROLE_LABELS[staff.role] ?? staff.role}</span>
          {staff.secondary_role && (
            <span className={`badge ${ROLE_COLORS[staff.secondary_role] ?? 'badge-gray'}`}>+{ROLE_LABELS[staff.secondary_role] ?? staff.secondary_role}</span>
          )}
          <span className={`badge ${staff.is_active ? 'badge-success' : 'badge-gray'}`}>{staff.is_active ? 'Faol' : 'Nofaol'}</span>
          <span className="badge badge-gray text-xs">{formatDate(staff.created_at)}</span>
        </div>
      </div>

      {/* Role toggles */}
      {isBoshliq && staff.role !== 'boshliq' && (
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Rollar</h3>
          <div className="flex gap-3 flex-wrap">
            <button
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isOperator
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-default'
              }`}
              onClick={() => isOperator && demote()}
              title={!isOperator ? "Operator roli mijoz profilidan beriladi (parol kerak)" : "Bosing — xodimdan chiqarish"}
            >
              <ShieldCheck size={15} />
              {isOperator ? 'Operator ✓' : 'Operator'}
            </button>

            <button
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isCourier
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : isOperator
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
              }`}
              onClick={handleKuryerToggle}
            >
              <UserCog size={15} />
              {isCourier ? 'Kuryer ✓' : 'Kuryer'}
            </button>
          </div>
          {isOperator && !isCourier && (
            <p className="text-xs text-gray-400">Kuryer tugmasini bosing — operator Telegram mini-appga ham kira oladi</p>
          )}
          {isOperator && isCourier && (
            <p className="text-xs text-gray-400">Ikki rol faol: veb-panel (operator) + Telegram mini-app (kuryer)</p>
          )}
        </div>
      )}

      {/* Danger zone */}
      {isBoshliq && (
        <div className="card border border-red-100 dark:border-red-900/50 space-y-3">
          <h3 className="text-sm font-semibold text-red-500">Boshqaruv</h3>
          <div className="flex gap-3 flex-wrap">
            <button onClick={toggleActive} className={`btn text-sm ${staff.is_active ? 'btn-secondary' : 'btn-success'}`}>
              {staff.is_active ? 'Bloklash' : 'Faollashtirish'}
            </button>
            {staff.role !== 'boshliq' && (
              <button onClick={demote} className="btn btn-danger text-sm">
                Xodimdan chiqarish
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
