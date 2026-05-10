import { useState } from 'react'
import { MapPin, Plus, X, Check, Loader2, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/api/client'
import { useAuthStore, type Address } from '@/store/auth'

interface Props {
  addresses: Address[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
}

type View = 'list' | 'form'

const LABELS = ['Uy', 'Ish', 'Boshqa']

export default function AddressSheet({ addresses, selectedId, onSelect, onClose }: Props) {
  const { fetchProfile } = useAuthStore()
  const [view, setView] = useState<View>('list')
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const deleteAddress = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
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
  const [form, setForm] = useState({
    label: 'Uy',
    address_text: '',
    landmark: '',
    apartment: '',
    floor: '',
    entrance: '',
    latitude: null as number | null,
    longitude: null as number | null,
    is_primary: addresses.length === 0,
  })

  const getLocation = () => {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords
        setForm(f => ({ ...f, latitude, longitude }))
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=uz,ru`,
            { headers: { 'Accept-Language': 'uz,ru' } }
          )
          const d = await r.json()
          if (d.display_name) {
            setForm(f => ({ ...f, address_text: d.display_name }))
          }
        } catch {}
        setLocating(false)
      },
      () => setLocating(false),
      { timeout: 10000 }
    )
  }

  const save = async () => {
    if (!form.address_text.trim()) return
    setSaving(true)
    try {
      await api.post('/clients/me/addresses', form)
      await fetchProfile()
      setView('list')
    } catch {
      alert('Manzil saqlashda xatolik')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        {/* Sheet */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-gray-900 rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
              {view === 'list' ? 'Manzil tanlash' : 'Yangi manzil'}
            </h3>
            <button onClick={view === 'form' ? () => setView('list') : onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <X size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-3">
            {view === 'list' ? (
              <>
                {addresses.map(addr => (
                  <div
                    key={addr.id}
                    className={`flex items-center gap-3 p-4 rounded-2xl transition-colors ${
                      addr.id === selectedId
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500'
                        : 'bg-gray-50 dark:bg-gray-800 border-2 border-transparent'
                    }`}
                  >
                    <button onClick={() => onSelect(addr.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        addr.id === selectedId ? 'bg-blue-100 dark:bg-blue-900' : 'bg-gray-200 dark:bg-gray-700'
                      }`}>
                        <MapPin size={18} className={addr.id === selectedId ? 'text-blue-600' : 'text-gray-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{addr.label}</p>
                        <p className="text-xs text-gray-400 truncate">{addr.address_text}</p>
                      </div>
                      {addr.id === selectedId && <Check size={18} className="text-blue-600 shrink-0" />}
                    </button>
                    <button
                      onClick={e => deleteAddress(e, addr.id)}
                      disabled={deletingId === addr.id}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:text-red-500 transition-colors disabled:opacity-40 shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => setView('form')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400"
                >
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                    <Plus size={18} />
                  </div>
                  <span className="font-semibold text-sm">Yangi manzil qo'shish</span>
                </button>
              </>
            ) : (
              <div className="space-y-4">
                {/* Geolocation */}
                <button
                  onClick={getLocation}
                  disabled={locating}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-2xl font-medium text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {locating
                    ? <><Loader2 size={16} className="animate-spin" /> Aniqlanmoqda...</>
                    : <><MapPin size={16} /> Geolokatsiyadan foydalanish</>}
                </button>
                {form.latitude && (
                  <p className="text-xs text-green-600 text-center">✅ Koordinatalar aniqlandi</p>
                )}

                {/* Address text */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Manzil *</label>
                  <input
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ko'cha, uy raqami..."
                    value={form.address_text}
                    onChange={e => setForm(f => ({ ...f, address_text: e.target.value }))}
                  />
                </div>

                {/* Label */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Nom</label>
                  <div className="flex gap-2">
                    {LABELS.map(l => (
                      <button
                        key={l}
                        onClick={() => setForm(f => ({ ...f, label: l }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                          form.label === l
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                      >{l}</button>
                    ))}
                  </div>
                </div>

                {/* Landmark */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Mo'ljal (ixtiyoriy)</label>
                  <input
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Yaqin ob'ekt..."
                    value={form.landmark}
                    onChange={e => setForm(f => ({ ...f, landmark: e.target.value }))}
                  />
                </div>

                {/* Floor + Entrance */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Kvartira</label>
                    <input
                      className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="№"
                      value={form.apartment}
                      onChange={e => setForm(f => ({ ...f, apartment: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Qavat</label>
                    <input
                      className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="№"
                      value={form.floor}
                      onChange={e => setForm(f => ({ ...f, floor: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Primary */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm(f => ({ ...f, is_primary: !f.is_primary }))}
                    className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
                      form.is_primary ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {form.is_primary && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Asosiy manzil sifatida belgilash</span>
                </label>

                <button
                  onClick={save}
                  disabled={saving || !form.address_text.trim()}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
