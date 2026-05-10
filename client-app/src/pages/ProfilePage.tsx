import { useState } from 'react'
import { MapPin, Plus, LogOut, Phone, CheckCircle, ChevronRight, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import api from '@/api/client'
import AddressSheet from '@/components/AddressSheet'
import { getT } from '@/i18n'

const LANGUAGES = [
  { code: 'uz', label: "O'zbek" },
  { code: 'uz_cy', label: 'Ўзбеча' },
  { code: 'ru', label: 'Русский' },
]

function formatMoney(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }

export default function ProfilePage() {
  const { profile, setLanguage, logout, fetchProfile } = useAuthStore()
  const t = getT(profile?.language)
  const [showAddresses, setShowAddresses] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const deleteAddress = async (id: string) => {
    setDeletingId(id)
    try {
      await api.delete(`/clients/me/addresses/${id}`)
      await fetchProfile()
    } catch {
      // silently ignore
    } finally {
      setDeletingId(null)
    }
  }

  if (!profile) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">👤</div>
          <p className="text-gray-400">{t.loadingProfile}</p>
        </div>
      </div>
    )
  }

  const initials = `${profile.first_name[0]}${profile.last_name?.[0] ?? ''}`.toUpperCase()

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Avatar + name */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xl font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 dark:text-white text-lg truncate">
            {profile.first_name} {profile.last_name ?? ''}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <Phone size={12} className="text-gray-400" />
            <span className="text-sm text-gray-500">+{profile.phone}</span>
            <CheckCircle size={12} className="text-green-500" />
          </div>
        </div>
      </div>

      {/* Stats */}
      {(profile.debt_amount > 0 || profile.advance_amount > 0 || profile.container_balance > 0) && (
        <div className="grid grid-cols-3 gap-2">
          {profile.debt_amount > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-3 text-center">
              <p className="text-xs text-red-500 font-medium">{t.debt}</p>
              <p className="text-sm font-bold text-red-600 mt-0.5">{formatMoney(profile.debt_amount)}</p>
            </div>
          )}
          {profile.advance_amount > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-3 text-center">
              <p className="text-xs text-green-600 font-medium">{t.advance}</p>
              <p className="text-sm font-bold text-green-600 mt-0.5">{formatMoney(profile.advance_amount)}</p>
            </div>
          )}
          {profile.container_balance > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 text-center">
              <p className="text-xs text-blue-500 font-medium">{t.containerDebt}</p>
              <p className="text-sm font-bold text-blue-600 mt-0.5">{profile.container_balance} ta</p>
            </div>
          )}
        </div>
      )}

      {/* Addresses */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.addresses}</p>
        </div>

        {profile.addresses.length === 0 ? (
          <div className="p-5 text-center">
            <p className="text-4xl mb-2">📍</p>
            <p className="text-sm text-gray-400">{t.noAddresses}</p>
          </div>
        ) : (
          profile.addresses.map(addr => (
            <div key={addr.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
              <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center shrink-0">
                <MapPin size={16} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 dark:text-white">{addr.label}</p>
                <p className="text-xs text-gray-400 truncate">{addr.address_text}</p>
              </div>
              <button
                onClick={() => deleteAddress(addr.id)}
                disabled={deletingId === addr.id}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-red-50 active:text-red-500 transition-colors disabled:opacity-40 shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}

        <button
          onClick={() => setShowAddresses(true)}
          className="w-full flex items-center gap-3 px-4 py-3 text-blue-600 active:bg-gray-50 dark:active:bg-gray-700/50 transition-colors"
        >
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center shrink-0">
            <Plus size={16} className="text-blue-500" />
          </div>
          <span className="text-sm font-semibold">{t.addAddress}</span>
          <ChevronRight size={16} className="text-blue-400 ml-auto" />
        </button>
      </div>

      {/* Language */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.language}</p>
        </div>
        <div className="p-3 flex gap-2">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                profile.language === lang.code
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logout */}
      {!confirmLogout ? (
        <button
          onClick={() => setConfirmLogout(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-white dark:bg-gray-800 text-red-500 rounded-2xl font-semibold shadow-sm active:scale-[0.98] transition-transform"
        >
          <LogOut size={18} />
          {t.logout}
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-center text-gray-700 dark:text-gray-200 font-medium">{t.logoutConfirm}</p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmLogout(false)}
              className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold"
            >
              Bekor
            </button>
            <button
              onClick={logout}
              className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold"
            >
              Ha, chiqish
            </button>
          </div>
        </div>
      )}

      {showAddresses && (
        <AddressSheet
          addresses={profile.addresses}
          selectedId={undefined}
          onSelect={() => setShowAddresses(false)}
          onClose={() => setShowAddresses(false)}
        />
      )}
    </div>
  )
}
