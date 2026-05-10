import { useState, useEffect } from 'react'
import { Search, DollarSign, User, Phone, CreditCard, Banknote, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import api from '@/api/client'

interface ClientWithDebt {
  id: string
  name: string
  phone: string
  debt_amount: number
}

type PaymentMethod = 'NAQD' | 'KARTA' | 'PAYME'

export default function DebtPaymentTab() {
  const [searchQuery, setSearchQuery] = useState('')
  const [clients, setClients] = useState<ClientWithDebt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [selectedClient, setSelectedClient] = useState<ClientWithDebt | null>(null)
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('NAQD')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async (search?: string) => {
    try {
      setLoading(true)
      setError('')
      const params = search ? `?search=${encodeURIComponent(search)}` : ''
      const response = await api.get(`/debts/courier/clients${params}`)
      setClients(response.data.items)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    fetchClients(searchQuery)
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('uz-UZ').format(amount) + ' so\'m'
  }

  const openPaymentModal = (client: ClientWithDebt) => {
    setSelectedClient(client)
    setPaymentAmount(client.debt_amount)
    setPaymentMethod('NAQD')
    setNote('')
    setSuccess(false)
  }

  const closeModal = () => {
    setSelectedClient(null)
    setPaymentAmount(0)
    setNote('')
  }

  const handlePayment = async () => {
    if (!selectedClient) return
    if (paymentAmount <= 0) {
      setError('Summa 0 dan katta bo\'lishi kerak')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      await api.post(`/debts/courier/${selectedClient.id}/pay`, {
        amount: paymentAmount,
        payment_method: paymentMethod,
        note: note || undefined,
      })

      setSuccess(true)

      // Refresh clients list after 1.5 seconds
      setTimeout(() => {
        fetchClients(searchQuery)
        closeModal()
      }, 1500)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Xatolik yuz berdi')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
          Qarz to'lovlari
        </h1>

        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Ism yoki telefon raqam..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Qidirish'}
          </button>
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Clients List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading && clients.length === 0 ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-gray-400" size={32} />
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery ? 'Mijoz topilmadi' : 'Qarzdor mijozlar yo\'q'}
            </p>
          </div>
        ) : (
          clients.map((client) => (
            <div
              key={client.id}
              onClick={() => openPaymentModal(client)}
              className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 active:scale-[0.98] transition-transform cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <User size={20} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{client.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Phone size={12} />
                      {client.phone}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-400">Qarz summasi</span>
                <span className="text-lg font-bold text-red-600 dark:text-red-400">
                  {formatMoney(client.debt_amount)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Payment Modal */}
      {selectedClient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-white dark:bg-gray-800 rounded-t-3xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            {success ? (
              <div className="text-center py-8">
                <CheckCircle2 size={64} className="mx-auto text-green-500 mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Muvaffaqiyatli!
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  To'lov muvaffaqiyatli qabul qilindi
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Qarzni to'lash
                </h2>

                {/* Client Info */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <User size={20} className="text-gray-600 dark:text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedClient.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{selectedClient.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-600">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Umumiy qarz</span>
                    <span className="text-lg font-bold text-red-600 dark:text-red-400">
                      {formatMoney(selectedClient.debt_amount)}
                    </span>
                  </div>
                </div>

                {/* Payment Amount */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    To'lov summasi (so'm)
                  </label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => setPaymentAmount(selectedClient.debt_amount)}
                    className="mt-2 text-sm text-blue-600 dark:text-blue-400 font-medium"
                  >
                    Hammasini to'lash
                  </button>
                </div>

                {/* Payment Method */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    To'lov usuli
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => setPaymentMethod('NAQD')}
                      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl font-semibold transition-all active:scale-95 ${
                        paymentMethod === 'NAQD'
                          ? 'bg-green-600 text-white shadow-lg'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <Banknote size={24} />
                      <span>Naqd</span>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('KARTA')}
                      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl font-semibold transition-all active:scale-95 ${
                        paymentMethod === 'KARTA'
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <CreditCard size={24} />
                      <span>Karta</span>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('PAYME')}
                      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl font-semibold transition-all active:scale-95 ${
                        paymentMethod === 'PAYME'
                          ? 'bg-cyan-600 text-white shadow-lg'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <CreditCard size={24} />
                      <span>Payme</span>
                    </button>
                  </div>
                </div>

                {/* Note */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Izoh (ixtiyoriy)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Qo'shimcha ma'lumot..."
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {error && (
                  <div className="mb-4 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
                    <XCircle size={16} />
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={closeModal}
                    disabled={submitting}
                    className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 active:scale-95 transition-all disabled:opacity-50"
                  >
                    Bekor qilish
                  </button>
                  <button
                    onClick={handlePayment}
                    disabled={submitting || paymentAmount <= 0}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Yuklanmoqda...
                      </>
                    ) : (
                      <>
                        <DollarSign size={18} />
                        To'lash
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
