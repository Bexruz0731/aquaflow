import { useState, useEffect } from 'react'
import { Phone, Car, LogOut, Loader2, Plus, X } from 'lucide-react'
import api from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { getT } from '@/i18n'

type Navigator = 'yandex' | '2gis' | 'google'
const NAVIGATORS: { key: Navigator; label: string; icon: string }[] = [
  { key: 'yandex', label: 'Yandex', icon: '🗺' },
  { key: '2gis',   label: '2GIS',   icon: '📍' },
  { key: 'google', label: 'Google', icon: '🌍' },
]

const LANGUAGES = [
  { code: 'uz', label: "O'zbek" },
  { code: 'uz_cy', label: 'Ўзбеча' },
  { code: 'ru', label: 'Русский' },
]

function formatMoney(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }
function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`
}

interface Expense { id: string; title: string; amount: number; payment_method: string; created_at: string }

export default function ProfileTab() {
  const { profile, updateProfile, setLanguage, logout } = useAuthStore()
  const t = getT(profile?.language)
  const [editCar, setEditCar] = useState(false)
  const [carNumber, setCarNumber] = useState(profile?.car_number ?? '')
  const [savingCar, setSavingCar] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [shiftLoading, setShiftLoading] = useState(false)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [expTitle, setExpTitle] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expMethod, setExpMethod] = useState<'naqd' | 'karta'>('naqd')
  const [expSaving, setExpSaving] = useState(false)
  const [expError, setExpError] = useState('')

  useEffect(() => {
    setExpensesLoading(true)
    api.get('/couriers/me/expenses').then(r => setExpenses(r.data.items || [])).catch(() => {}).finally(() => setExpensesLoading(false))
  }, [])

  const addExpense = async () => {
    if (!expTitle.trim() || !expAmount) return
    setExpError('')
    setExpSaving(true)
    try {
      const { data } = await api.post('/couriers/me/expenses', {
        title: expTitle.trim(),
        amount: Number(expAmount),
        payment_method: expMethod,
      })
      updateProfile({ cash_balance: data.cash_balance, card_balance: data.card_balance })
      const r = await api.get('/couriers/me/expenses')
      setExpenses(r.data.items || [])
      setExpTitle('')
      setExpAmount('')
      setExpMethod('naqd')
      setShowExpenseForm(false)
    } catch (err: any) {
      setExpError(err?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally { setExpSaving(false) }
  }

  const saveCar = async () => {
    setSavingCar(true)
    try {
      await api.patch('/couriers/me', { car_number: carNumber })
      updateProfile({ car_number: carNumber })
      setEditCar(false)
    } catch {
      alert('Xatolik')
    } finally {
      setSavingCar(false)
    }
  }

  const openShift = async () => {
    setShiftLoading(true)
    try {
      await api.post('/couriers/me/shift/open', {})
      updateProfile({ shift_open: true })
    } catch {
      alert('Xatolik')
    } finally {
      setShiftLoading(false)
    }
  }

  const setNavigator = async (nav: Navigator) => {
    updateProfile({ preferred_navigator: nav })
    api.patch('/couriers/me', { preferred_navigator: nav }).catch(() => {})
  }

  if (!profile) return null

  const initials = `${profile.first_name[0]}${profile.last_name?.[0] ?? ''}`.toUpperCase()

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Avatar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white text-xl font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-bold text-gray-900 dark:text-white text-lg truncate">
              {profile.first_name} {profile.last_name ?? ''}
            </p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              profile.shift_open
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
            }`}>
              {profile.shift_open ? t.shiftOpen : t.shiftClosed}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Phone size={12} />
            <span className="text-sm">+{profile.phone}</span>
          </div>
          {profile.car_number && (
            <div className="flex items-center gap-1.5 text-gray-400 mt-0.5">
              <Car size={12} />
              <span className="text-sm">{profile.car_number}</span>
            </div>
          )}
        </div>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 font-medium mb-1">{t.todayDeliveries}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{profile.today_deliveries} ta</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 font-medium mb-1">{t.todayIncome}</p>
          <p className="text-lg font-bold text-green-600">{formatMoney(profile.today_income)}</p>
        </div>
      </div>

      {/* Cash balance */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.kassa}</p>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-300">{t.cash}</span>
            <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(profile.cash_balance)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-300">{t.card}</span>
            <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(profile.card_balance)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-300">{t.payme}</span>
            <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(profile.payme_balance)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t.containers}</span>
            <span className="font-bold text-gray-900 dark:text-white">{profile.container_balance} ta</span>
          </div>
        </div>
      </div>

      {/* Expenses */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Xarajatlar</p>
          <button
            onClick={() => setShowExpenseForm(v => !v)}
            className="flex items-center gap-1 text-xs text-blue-600 font-semibold"
          >
            {showExpenseForm ? <><X size={12} /> Yopish</> : <><Plus size={12} /> Qo'shish</>}
          </button>
        </div>

        {showExpenseForm && (
          <div className="mb-3 space-y-2">
            {/* Payment method toggle */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600">
              <button
                onClick={() => setExpMethod('naqd')}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  expMethod === 'naqd' ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                💵 Naqd
              </button>
              <button
                onClick={() => setExpMethod('karta')}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  expMethod === 'karta' ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                💳 Karta
              </button>
            </div>
            <input
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sarlavha (Tushlik, Benzin...)"
              value={expTitle}
              onChange={e => setExpTitle(e.target.value)}
            />
            <input
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Summa (so'm)"
              type="number"
              inputMode="numeric"
              value={expAmount}
              onChange={e => setExpAmount(e.target.value)}
            />
            <p className="text-xs text-gray-400 text-center">
              {expMethod === 'naqd' ? `Naqd balansi: ${formatMoney(profile?.cash_balance ?? 0)}` : `Karta balansi: ${formatMoney(profile?.card_balance ?? 0)}`}
            </p>
            {expError && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 text-center font-medium">{expError}</p>
            )}
            <button
              onClick={addExpense}
              disabled={expSaving || !expTitle.trim() || !expAmount}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {expSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Saqlash'}
            </button>
          </div>
        )}

        {expensesLoading ? (
          <div className="text-center py-4 text-gray-400 text-sm">Yuklanmoqda...</div>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">Xarajatlar yo'q</p>
        ) : (
          <div className="space-y-1">
            {expenses.map(exp => (
              <div key={exp.id} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{exp.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${
                      exp.payment_method === 'naqd'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                    }`}>
                      {exp.payment_method === 'naqd' ? 'Naqd' : 'Karta'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{formatDate(exp.created_at)}</p>
                </div>
                <div className="ml-2">
                  <span className="text-sm font-semibold text-red-500 whitespace-nowrap">−{formatMoney(exp.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Car number */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.carNumber}</p>
          {!editCar && (
            <button onClick={() => setEditCar(true)} className="text-xs text-blue-600 font-medium">{t.editCar}</button>
          )}
        </div>
        {editCar ? (
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              value={carNumber}
              onChange={e => setCarNumber(e.target.value.toUpperCase())}
              placeholder="01A123BC"
            />
            <button
              onClick={saveCar}
              disabled={savingCar}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {savingCar ? <Loader2 size={14} className="animate-spin" /> : t.saveCar}
            </button>
            <button onClick={() => setEditCar(false)} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm">
              {t.cancelCar}
            </button>
          </div>
        ) : (
          <p className="font-mono font-bold text-gray-900 dark:text-white text-lg">
            {profile.car_number ?? '—'}
          </p>
        )}
      </div>

      {/* Navigator */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.navigator}</p>
        <div className="flex gap-2">
          {NAVIGATORS.map(n => (
            <button
              key={n.key}
              onClick={() => setNavigator(n.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                profile.preferred_navigator === n.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.language}</p>
        <div className="flex gap-2">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                profile.language === l.code
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shift toggle — couriers can only OPEN shift; admin closes it from web panel */}
      {profile.shift_open ? (
        <div className="w-full py-4 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
          <p className="font-bold text-green-700 dark:text-green-300">{t.shiftOpenInfo}</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
            {t.shiftOpenDesc}
          </p>
        </div>
      ) : (
        <button
          onClick={openShift}
          disabled={shiftLoading}
          className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 bg-green-500 text-white"
        >
          {shiftLoading
            ? <Loader2 size={18} className="animate-spin" />
            : t.shiftOpenBtn}
        </button>
      )}

      {/* Logout */}
      {!confirmLogout ? (
        <button
          onClick={() => setConfirmLogout(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-white dark:bg-gray-800 text-red-500 rounded-2xl font-semibold shadow-sm active:scale-[0.98]"
        >
          <LogOut size={18} /> {t.logout}
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-center text-gray-700 dark:text-gray-200 font-medium">{t.logoutConfirm}</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmLogout(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold">{t.cancel}</button>
            <button onClick={logout} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold">{t.logoutYes}</button>
          </div>
        </div>
      )}
    </div>
  )
}
