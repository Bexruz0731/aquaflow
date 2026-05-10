import { useQuery } from '@tanstack/react-query'
import { DollarSign, TrendingUp, AlertCircle, CreditCard, UserCheck, Calendar } from 'lucide-react'
import { formatMoney } from '@/utils/format'
import api from '@/api/client'
import { useState } from 'react'

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

export default function Finance() {
  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Calculate dates based on preset
  const getDateRange = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (datePreset === 'custom' && dateFrom && dateTo) {
      return { date_from: dateFrom, date_to: dateTo }
    }

    let from = new Date(today)
    let to = new Date(today)

    switch (datePreset) {
      case 'yesterday':
        from.setDate(from.getDate() - 1)
        to.setDate(to.getDate() - 1)
        break
      case 'week':
        from.setDate(from.getDate() - 7)
        break
      case 'month':
        from.setMonth(from.getMonth() - 1)
        break
      case 'today':
      default:
        // Already set to today
        break
    }

    // Format dates in local timezone (YYYY-MM-DD)
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    return {
      date_from: formatLocalDate(from),
      date_to: formatLocalDate(to),
    }
  }

  const dateRange = getDateRange()

  const { data: financial, isLoading } = useQuery({
    queryKey: ['financial-dashboard', dateRange.date_from, dateRange.date_to],
    queryFn: () => api.get('/statistics/financial-dashboard', {
      params: dateRange
    }).then(r => r.data),
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Moliya</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-32" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Moliya va kassa</h1>
      </div>

      {/* Date filter */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={18} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Davr bo'yicha filtr</h3>
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setDatePreset('today')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              datePreset === 'today'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Bugun
          </button>
          <button
            onClick={() => setDatePreset('yesterday')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              datePreset === 'yesterday'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Kecha
          </button>
          <button
            onClick={() => setDatePreset('week')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              datePreset === 'week'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            7 kun
          </button>
          <button
            onClick={() => setDatePreset('month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              datePreset === 'month'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            30 kun
          </button>
          <button
            onClick={() => setDatePreset('custom')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              datePreset === 'custom'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Boshqa davr
          </button>
        </div>

        {/* Custom date range */}
        {datePreset === 'custom' && (
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Dan</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input w-full"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Gacha</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>
        )}

        {/* Show selected period */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">
            Tanlangan davr: <span className="font-semibold text-gray-700 dark:text-gray-300">{dateRange.date_from}</span> dan{' '}
            <span className="font-semibold text-gray-700 dark:text-gray-300">{dateRange.date_to}</span> gacha
          </p>
        </div>
      </div>

      {/* Main metrics for selected period */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Umumiy savdo */}
        <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp size={24} />
            <span className="text-xs opacity-80">Umumiy savdo</span>
          </div>
          <p className="text-3xl font-bold">{formatMoney(Math.max(0, (financial?.period_revenue || 0) - (financial?.period_expenses || 0)))}</p>
          <p className="text-xs opacity-80 mt-1">{formatMoney(financial?.period_revenue || 0)} − {formatMoney(financial?.period_expenses || 0)} xarajatlar</p>
        </div>

        {/* Naqd */}
        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
          <div className="flex items-center justify-between mb-2">
            <DollarSign size={24} />
            <span className="text-xs opacity-80">Naqd</span>
          </div>
          <p className="text-3xl font-bold">{formatMoney(financial?.period_cash || 0)}</p>
          <p className="text-xs opacity-80 mt-1">Tanlangan davrda</p>
        </div>

        {/* Humo/Uzcard */}
        <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <div className="flex items-center justify-between mb-2">
            <CreditCard size={24} />
            <span className="text-xs opacity-80">Humo/Uzcard</span>
          </div>
          <p className="text-3xl font-bold">{formatMoney(financial?.period_card || 0)}</p>
          <p className="text-xs opacity-80 mt-1">Tanlangan davrda</p>
        </div>

        {/* Payme/Click */}
        <div className="card bg-gradient-to-br from-cyan-500 to-cyan-600 text-white">
          <div className="flex items-center justify-between mb-2">
            <CreditCard size={24} />
            <span className="text-xs opacity-80">Payme/Click</span>
          </div>
          <p className="text-3xl font-bold">{formatMoney(financial?.period_payme || 0)}</p>
          <p className="text-xs opacity-80 mt-1">Tanlangan davrda</p>
        </div>

        {/* Qarzlar */}
        <div className="card bg-gradient-to-br from-red-500 to-red-600 text-white">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle size={24} />
            <span className="text-xs opacity-80">Qarzlar</span>
          </div>
          <p className="text-3xl font-bold">{formatMoney(financial?.period_debts || 0)}</p>
          <p className="text-xs opacity-80 mt-1">Tanlangan davrda</p>
        </div>

        {/* Xarajatlar */}
        <div className="card bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp size={24} />
            <span className="text-xs opacity-80">Xarajatlar</span>
          </div>
          <p className="text-3xl font-bold">{formatMoney(financial?.period_expenses || 0)}</p>
          <p className="text-xs opacity-80 mt-1">Kuryer: {formatMoney(financial?.period_courier_expenses || 0)} | Umumiy: {formatMoney(financial?.period_admin_expenses || 0)}</p>
        </div>
      </div>

      {/* Money breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Collected money breakdown */}
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            To'langan pullar (Real)
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center">
                  <DollarSign size={20} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Naqd pul</p>
                  <p className="text-xs text-gray-500">Barcha naqd to'lovlar</p>
                </div>
              </div>
              <span className="text-lg font-bold text-green-600">{formatMoney(financial?.cash_collected || 0)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                  <CreditCard size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Karta orqali</p>
                  <p className="text-xs text-gray-500">Barcha terminal to'lovlar</p>
                </div>
              </div>
              <span className="text-lg font-bold text-blue-600">{formatMoney(financial?.card_collected || 0)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyan-100 dark:bg-cyan-800 flex items-center justify-center">
                  <CreditCard size={20} className="text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Payme/Click</p>
                  <p className="text-xs text-gray-500">Barcha online to'lovlar</p>
                </div>
              </div>
              <span className="text-lg font-bold text-cyan-600">{formatMoney(financial?.payme_collected || 0)}</span>
            </div>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Jami to'langan</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">{formatMoney(financial?.total_collected || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Today's collections */}
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Bugungi tushumlar
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <DollarSign size={20} className="text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Naqd (bugun)</p>
                  <p className="text-xs text-gray-500">Bugungi naqd tushumlar</p>
                </div>
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{formatMoney(financial?.today_cash || 0)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <CreditCard size={20} className="text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Karta (bugun)</p>
                  <p className="text-xs text-gray-500">Bugungi terminal tushumlar</p>
                </div>
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{formatMoney(financial?.today_card || 0)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyan-100 dark:bg-cyan-700 flex items-center justify-center">
                  <CreditCard size={20} className="text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Payme/Click (bugun)</p>
                  <p className="text-xs text-gray-500">Bugungi online tushumlar</p>
                </div>
              </div>
              <span className="text-lg font-bold text-cyan-600">{formatMoney(financial?.today_payme || 0)}</span>
            </div>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Bugun jami</span>
                <span className="text-xl font-bold text-green-600">{formatMoney(financial?.today_collected || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Courier balances & Cash register */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Couriers money */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Kuryerlardagi pul</h3>
            <span className="badge badge-warning">Hali topshirilmagan</span>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Naqd pul</p>
                <p className="text-xs text-gray-500">Kuryerlarda</p>
              </div>
              <span className="text-lg font-bold text-yellow-600">{formatMoney(financial?.courier_cash || 0)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Karta</p>
                <p className="text-xs text-gray-500">Kuryerlarda</p>
              </div>
              <span className="text-lg font-bold text-yellow-600">{formatMoney(financial?.courier_card || 0)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Payme/Click</p>
                <p className="text-xs text-gray-500">Kuryerlarda</p>
              </div>
              <span className="text-lg font-bold text-yellow-600">{formatMoney(financial?.courier_payme || 0)}</span>
            </div>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Jami kuryerlarda</span>
                <span className="text-xl font-bold text-yellow-600">{formatMoney(financial?.courier_total || 0)}</span>
              </div>
            </div>
          </div>

          {financial?.courier_balances && financial.courier_balances.length > 0 && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 mb-3">Kuryer bo'yicha:</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {financial.courier_balances.map((cb: any) => (
                  <div key={cb.courier_id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <UserCheck size={16} className="text-gray-400" />
                      <span className="text-gray-600 dark:text-gray-400">{cb.courier_name || `Kuryer #${cb.courier_id.slice(0, 8)}`}</span>
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(cb.total_balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cash register */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Kassada (topshirilgan)</h3>
            <span className="badge badge-success">Qabul qilingan</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Naqd pul</p>
                <p className="text-xs text-gray-500">Smena yopishda topshirilgan</p>
              </div>
              <span className="text-lg font-bold text-green-600">{formatMoney(financial?.cash_register_cash || 0)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Karta</p>
                <p className="text-xs text-gray-500">Smena yopishda topshirilgan</p>
              </div>
              <span className="text-lg font-bold text-green-600">{formatMoney(financial?.cash_register_card || 0)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Payme/Click</p>
                <p className="text-xs text-gray-500">Smena yopishda topshirilgan</p>
              </div>
              <span className="text-lg font-bold text-green-600">{formatMoney(financial?.cash_register_payme || 0)}</span>
            </div>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Jami kassada</span>
                <span className="text-xl font-bold text-green-600">{formatMoney(financial?.cash_register_total || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="card bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <h3 className="text-lg font-bold mb-4">Xulosa</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm opacity-80 mb-1">Daromad (jami)</p>
            <p className="text-2xl font-bold">{formatMoney(financial?.total_revenue || 0)}</p>
          </div>
          <div>
            <p className="text-sm opacity-80 mb-1">To'langan (real pul)</p>
            <p className="text-2xl font-bold">{formatMoney(financial?.total_collected || 0)}</p>
          </div>
          <div>
            <p className="text-sm opacity-80 mb-1">Qarzlar</p>
            <p className="text-2xl font-bold">{formatMoney(financial?.total_debts || 0)}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/20 text-sm opacity-90">
          <p>✅ To'langan + Qarzlar = {formatMoney((financial?.total_collected || 0) + (financial?.total_debts || 0))}</p>
          <p className="mt-1">📊 Kuryerlarda: {formatMoney(financial?.courier_total || 0)} | Kassada: {formatMoney(financial?.cash_register_total || 0)}</p>
        </div>
      </div>
    </div>
  )
}
