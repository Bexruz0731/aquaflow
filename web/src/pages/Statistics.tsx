import { useState, useEffect } from 'react'
import { TrendingUp, DollarSign } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import api from '@/api/client'
import { formatMoney, formatCompact } from '@/utils/format'
import { useToastStore } from '@/store/toast'

// Recharts re-exports used here are from the package directly
// We import from 'recharts' for all chart components

interface StatsSummary {
  revenue_today: number
  revenue_week: number
  revenue_month: number
  revenue_year: number
  orders_count: number
  clients_count: number
}

interface WeeklyPoint { label: string; revenue: number; orders: number }
interface StatusPoint { status: string; count: number }

const STATUS_COLORS: Record<string, string> = {
  YOPILDI: '#22c55e',
  YETKAZILDI: '#3b82f6',
  BEKOR_QILINDI: '#ef4444',
  MUAMMO: '#f59e0b',
  TAYINLANDI: '#8b5cf6',
  YANGI: '#6b7280',
}

const STATUS_LABELS: Record<string, string> = {
  YOPILDI: 'Yopildi',
  YETKAZILDI: 'Yetkazildi',
  BEKOR_QILINDI: 'Bekor qilindi',
  MUAMMO: 'Muammo',
  TAYINLANDI: 'Tayinlandi',
  YANGI: 'Yangi',
}

type Period = 'weekly' | 'monthly' | 'yearly'

export default function Statistics() {
  const toast = useToastStore()
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [weeklyData, setWeeklyData] = useState<WeeklyPoint[]>([])
  const [statusData, setStatusData] = useState<StatusPoint[]>([])
  const [period, setPeriod] = useState<Period>('weekly')
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [sumRes, weekRes, statusRes] = await Promise.all([
        api.get('/statistics/'),
        api.get('/statistics/weekly', { params: { period } }),
        api.get('/statistics/orders-by-status'),
      ])
      setSummary(sumRes.data)
      setWeeklyData(weekRes.data?.data ?? [])
      setStatusData(statusRes.data)
    } catch {
      toast.error('Statistika yuklanmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [period])

  const METRIC_CARDS = [
    { label: "Bugungi daromad", value: summary?.revenue_today ?? 0, icon: DollarSign, color: 'text-green-500' },
    { label: "Haftalik daromad", value: summary?.revenue_week ?? 0, icon: TrendingUp, color: 'text-blue-500' },
    { label: "Oylik daromad", value: summary?.revenue_month ?? 0, icon: TrendingUp, color: 'text-purple-500' },
    { label: "Yillik daromad", value: summary?.revenue_year ?? 0, icon: TrendingUp, color: 'text-orange-500' },
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Statistika</h1>

      {/* Revenue cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRIC_CARDS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500">{label}</span>
              <Icon size={18} className={color} />
            </div>
            {loading
              ? <div className="h-7 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              : <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatMoney(value)}</p>}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Area chart */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Daromad dinamikasi</h3>
            <div className="flex items-center gap-1">
              {(['weekly', 'monthly', 'yearly'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    period === p ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {p === 'weekly' ? 'Haftalik' : p === 'monthly' ? 'Oylik' : 'Yillik'}
                </button>
              ))}
            </div>
          </div>
          {loading
            ? <div className="h-56 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={weeklyData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tickFormatter={v => formatCompact(v)} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip formatter={(v: number) => [formatMoney(v), 'Daromad']} labelStyle={{ color: '#374151' }} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#grad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
        </div>

        {/* Donut chart */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Buyurtma holatlari</h3>
          {loading
            ? <div className="h-56 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            : statusData.length === 0
              ? <div className="h-56 flex items-center justify-center text-gray-400 text-sm">Ma'lumot yo'q</div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="status"
                    >
                      {statusData.map((entry, index) => (
                        <Cell
                          key={entry.status}
                          fill={STATUS_COLORS[entry.status] ?? `hsl(${index * 40}, 65%, 55%)`}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, name: string) => [v, STATUS_LABELS[name] ?? name]}
                    />
                    <Legend
                      formatter={(value) => STATUS_LABELS[value] ?? value}
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
        </div>
      </div>
    </div>
  )
}
