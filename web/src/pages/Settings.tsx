import { useState, useEffect } from 'react'
import {
  Building2, Bot, Clock, Bell, Lock, Trash2,
  Save, Eye, EyeOff, AlertTriangle,
} from 'lucide-react'
import api from '@/api/client'
import { useToastStore } from '@/store/toast'

interface SettingsData {
  company_name: string
  company_phone: string
  work_hours_from: string
  work_hours_to: string
  low_stock_threshold: number
  bot_token: string
  notify_new_order: boolean
  notify_problem: boolean
  notify_low_stock: boolean
}

type Tab = 'company' | 'bot' | 'notifications' | 'security' | 'danger'

export default function SettingsPage() {
  const toast = useToastStore()
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('company')
  const [showToken, setShowToken] = useState(false)
  const [showOldPw, setShowOldPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [changingPw, setChangingPw] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  const fetchSettings = async () => {
    try {
      const { data } = await api.get('/settings/')
      setSettings(data)
    } catch {
      toast.error('Sozlamalarni yuklashda xatolik')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSettings() }, [])

  const set = (k: keyof SettingsData, v: string | boolean | number) =>
    setSettings(s => s ? { ...s, [k]: v } : s)

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await api.patch('/settings/', settings)
      toast.success('Sozlamalar saqlandi')
    } catch {
      toast.error('Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.new_password !== pwForm.confirm) { toast.error('Parollar mos kelmadi'); return }
    setChangingPw(true)
    try {
      await api.post('/auth/change-password', { old_password: pwForm.old_password, new_password: pwForm.new_password })
      toast.success('Parol o\'zgartirildi')
      setPwForm({ old_password: '', new_password: '', confirm: '' })
    } catch {
      toast.error('Eski parol noto\'g\'ri')
    } finally {
      setChangingPw(false)
    }
  }

  const clearTestData = async () => {
    setClearing(true)
    try {
      await api.delete('/settings/test-data')
      toast.success('Test ma\'lumotlari o\'chirildi')
      setShowClearConfirm(false)
    } catch {
      toast.error('O\'chirishda xatolik')
    } finally {
      setClearing(false)
    }
  }

  const TABS = [
    { key: 'company', label: 'Kompaniya', icon: Building2 },
    { key: 'bot', label: 'Bot', icon: Bot },
    { key: 'notifications', label: 'Bildirishnomalar', icon: Bell },
    { key: 'security', label: 'Xavfsizlik', icon: Lock },
    { key: 'danger', label: 'Xavfli zona', icon: AlertTriangle },
  ] as const

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sozlamalar</h1>

      <div className="flex gap-5">
        {/* Sidebar tabs */}
        <div className="w-48 shrink-0 space-y-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                tab === key
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 card">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />)}
            </div>
          ) : !settings ? null : (
            <>
              {tab === 'company' && (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Kompaniya ma'lumotlari</h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Kompaniya nomi</label>
                    <input className="input w-full" value={settings.company_name} onChange={e => set('company_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Telefon</label>
                    <input className="input w-full" value={settings.company_phone} onChange={e => set('company_phone', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        <Clock size={12} className="inline mr-1" />Ish boshlanishi
                      </label>
                      <input className="input w-full" type="time" value={settings.work_hours_from} onChange={e => set('work_hours_from', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        <Clock size={12} className="inline mr-1" />Ish tugashi
                      </label>
                      <input className="input w-full" type="time" value={settings.work_hours_to} onChange={e => set('work_hours_to', e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Minimal ombor qoldig'i (dona)</label>
                    <input className="input w-32" type="number" value={settings.low_stock_threshold} onChange={e => set('low_stock_threshold', parseInt(e.target.value))} />
                  </div>
                  <button onClick={save} disabled={saving} className="btn btn-primary flex items-center gap-1.5">
                    <Save size={15} /> {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                </div>
              )}

              {tab === 'bot' && (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Telegram Bot</h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bot token</label>
                    <div className="relative">
                      <input
                        className="input w-full pr-10 font-mono text-xs"
                        type={showToken ? 'text' : 'password'}
                        value={settings.bot_token}
                        onChange={e => set('bot_token', e.target.value)}
                      />
                      <button type="button" onClick={() => setShowToken(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">@BotFather orqali olingan token</p>
                  </div>
                  <button onClick={save} disabled={saving} className="btn btn-primary flex items-center gap-1.5">
                    <Save size={15} /> {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                </div>
              )}

              {tab === 'notifications' && (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Bildirishnoma sozlamalari</h2>
                  <div className="space-y-3">
                    {[
                      { key: 'notify_new_order', label: "Yangi buyurtma kelganda" },
                      { key: 'notify_problem', label: "Muammo yuz berganda" },
                      { key: 'notify_low_stock', label: "Ombor kam qolganda" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
                        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                        <input
                          type="checkbox"
                          checked={settings[key as keyof SettingsData] as boolean}
                          onChange={e => set(key as keyof SettingsData, e.target.checked)}
                          className="w-4 h-4 rounded"
                        />
                      </label>
                    ))}
                  </div>
                  <button onClick={save} disabled={saving} className="btn btn-primary flex items-center gap-1.5">
                    <Save size={15} /> {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                </div>
              )}

              {tab === 'security' && (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Parolni o'zgartirish</h2>
                  <form onSubmit={changePassword} className="space-y-4">
                    {[
                      { key: 'old_password', label: 'Eski parol', show: showOldPw, toggle: () => setShowOldPw(s => !s) },
                      { key: 'new_password', label: 'Yangi parol', show: showNewPw, toggle: () => setShowNewPw(s => !s) },
                      { key: 'confirm', label: 'Tasdiqlash', show: showNewPw, toggle: () => setShowNewPw(s => !s) },
                    ].map(({ key, label, show, toggle }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                        <div className="relative">
                          <input
                            className="input w-full max-w-xs pr-10"
                            type={show ? 'text' : 'password'}
                            value={pwForm[key as keyof typeof pwForm]}
                            onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                            required
                          />
                          <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            {show ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="submit" disabled={changingPw} className="btn btn-primary flex items-center gap-1.5">
                      <Lock size={15} /> {changingPw ? 'O\'zgartirilmoqda...' : 'Parolni o\'zgartirish'}
                    </button>
                  </form>
                </div>
              )}

              {tab === 'danger' && (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold text-red-600">Xavfli zona</h2>
                  <div className="border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Test ma'lumotlarini o'chirish</p>
                        <p className="text-sm text-gray-500 mt-1">Bu amal barcha test buyurtmalar, mijozlar va tranzaksiyalarni o'chiradi. Bu amalni qaytarib bo'lmaydi.</p>
                        <button
                          onClick={() => setShowClearConfirm(true)}
                          className="btn btn-danger flex items-center gap-1.5 mt-3"
                        >
                          <Trash2 size={14} /> O'chirish
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={24} className="text-red-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ishonchingiz komilmi?</h2>
            </div>
            <p className="text-sm text-gray-500">Bu amal qaytarib bo'lmaydi. Barcha test ma'lumotlari o'chiriladi.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowClearConfirm(false)} className="btn btn-secondary flex-1">Bekor</button>
              <button onClick={clearTestData} disabled={clearing} className="btn btn-danger flex-1">
                {clearing ? 'O\'chirilmoqda...' : 'Ha, o\'chirish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
