import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShoppingCart, Users, UserCheck, Activity } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import MetricCard from '@/components/ui/MetricCard'
import Avatar from '@/components/ui/Avatar'
import { OrderStatusBadge } from '@/utils/orderStatus'
import { formatMoney, formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/store/auth'
import api from '@/api/client'
import type { Order } from '@/types'

function getGreeting() {
  const h = (new Date().getUTCHours() + 5) % 24  // UTC+5
  if (h < 12) return 'Xayrli tong'
  if (h < 18) return 'Xayrli kun'
  return 'Xayrli kech'
}

export default function Dashboard() {
  const { user } = useAuthStore()

  const { data: stats } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/statistics/dashboard').then(r => r.data),
    refetchInterval: 30_000,
  })

  const [chartPeriod, setChartPeriod] = useState<'weekly'|'monthly'|'yearly'>('weekly')

  const { data: weekly } = useQuery({
    queryKey: ['weekly-stats', chartPeriod],
    queryFn: () => api.get(`/statistics/weekly?period=${chartPeriod}`).then(r => r.data),
  })

  const UZ_DAYS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan']
  const UZ_MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']

  const chartData = weekly?.data?.map((d: any) => {
    const dt = new Date(d.date + 'T00:00:00')
    let name: string
    let fullLabel: string
    if (chartPeriod === 'weekly') {
      name = `${UZ_DAYS[dt.getDay()]} ${dt.getDate()}`
      fullLabel = `${UZ_DAYS[dt.getDay()]}, ${dt.getDate()}-${UZ_MONTHS[dt.getMonth()]}`
    } else if (chartPeriod === 'monthly') {
      name = `${dt.getDate()} ${UZ_MONTHS[dt.getMonth()]}`
      fullLabel = `${dt.getDate()}-${UZ_MONTHS[dt.getMonth()]}`
    } else {
      name = UZ_MONTHS[dt.getMonth()]
      fullLabel = `${UZ_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`
    }
    return { name, fullLabel, revenue: d.revenue, count: d.count }
  }) ?? []

  const chartTitle = chartPeriod === 'weekly' ? 'Haftalik buyurtmalar' : chartPeriod === 'monthly' ? 'Oylik buyurtmalar' : 'Yillik buyurtmalar'

  const recentOrders: Order[] = stats?.recent_orders ?? []

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {getGreeting()}, {user?.first_name}! 👋
        </h1>
        <p className="text-gray-500 text-sm mt-0.5 capitalize">{user?.role}</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Bugungi buyurtmalar"
          value={stats?.today_orders ?? '—'}
          icon={ShoppingCart}
        />
        <MetricCard
          title="Barcha mijozlar"
          value={stats?.total_clients ?? '—'}
          icon={Users}
        />
        <MetricCard
          title="Xodimlar soni"
          value={stats?.active_staff ?? '—'}
          icon={UserCheck}
        />
        <MetricCard
          title="Faol mijozlar"
          value={stats?.active_clients ?? '—'}
          subtitle="So'nggi 30 kun"
          icon={Activity}
        />
      </div>

      {/* Chart + Recent orders */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Bar chart */}
        <div className="xl:col-span-3 card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900 dark:text-white">{chartTitle}</h3>
            <div className="flex gap-1">
              {([['weekly','Haftalik'],['monthly','Oylik'],['yearly','Yillik']] as [string,string][]).map(([key,label]) => (
                <button key={key} onClick={() => setChartPeriod(key as any)}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${chartPeriod === key ? 'bg-[#0f0f23] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `${v} ta`} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.fullLabel}</p>
                      <p>Buyurtmalar: <b>{d.count} ta</b></p>
                      <p style={{ color: '#6b7280' }}>Summa: {formatMoney(d.revenue)}</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="count" fill="#0f0f23" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent orders */}
        <div className="xl:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">So'nggi buyurtmalar</h3>
            <Link to="/orders" className="text-xs text-blue-600 hover:underline">Barchasi</Link>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Bugun {stats?.today_orders ?? 0} ta buyurtma qabul qilindi
          </p>
          <div className="space-y-3">
            {recentOrders.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Buyurtmalar yo'q</p>
            ) : (
              recentOrders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center gap-3">
                  <Avatar name={`Buyurtma ${order.id}`} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">#{order.id}</p>
                    <p className="text-xs text-gray-500 truncate">{formatDateTime(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <OrderStatusBadge status={order.status} />
                    <p className="text-xs text-gray-900 dark:text-white font-medium mt-0.5">{formatMoney(order.total_amount)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
