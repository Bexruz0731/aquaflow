import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import OrdersTab from '@/pages/OrdersTab'
import MapTab from '@/pages/MapTab'
import HistoryTab from '@/pages/HistoryTab'
import ProfileTab from '@/pages/ProfileTab'
import DebtPaymentTab from '@/pages/DebtPaymentTab'
import WalkinTab from '@/pages/WalkinTab'
import BottomNav from '@/components/BottomNav'
import type { ActiveOrder } from '@/types'
import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'

export type TabName = 'orders' | 'map' | 'debts' | 'history' | 'walkin' | 'profile'

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string
        initDataUnsafe: { user?: { id: number } }
        ready: () => void
        expand: () => void
        close: () => void
        colorScheme: 'light' | 'dark'
      }
    }
  }
}

const TG_INIT_DATA_KEY = 'tg_init_data_courier'

export default function App() {
  const [tab, setTab] = useState<TabName>('orders')
  const [mapFocusOrder, setMapFocusOrder] = useState<ActiveOrder | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const { token, loginWithTelegram, fetchProfile, hydrated, profile } = useAuthStore()

  useEffect(() => {
    const tg = window.Telegram?.WebApp

    if (tg) {
      tg.ready()
      tg.expand()
    }

    const freshInitData = tg?.initData
    if (freshInitData) {
      sessionStorage.setItem(TG_INIT_DATA_KEY, freshInitData)
    }
    const initData = freshInitData || sessionStorage.getItem(TG_INIT_DATA_KEY) || ''

    const init = async () => {
      if (token) {
        const ok = await fetchProfile().then(() => true).catch(() => false)
        if (!ok && initData) {
          await loginWithTelegram(initData).catch((err) => {
            setAuthError(String(err?.response?.data?.detail ?? err?.message ?? 'Auth error'))
          })
        }
      } else if (initData) {
        await loginWithTelegram(initData).catch((err) => {
          setAuthError(String(err?.response?.data?.detail ?? err?.message ?? 'Auth error'))
        })
      } else {
        setAuthError('no_telegram')
      }
      setInitializing(false)
    }
    init()
  }, [])

  // Active order count for badge
  const { data: ordersData } = useQuery({
    queryKey: ['courier-orders'],
    queryFn: async () => {
      const { data } = await api.get('/orders/courier/active')
      return data as { orders: ActiveOrder[]; today_total: number; today_delivered: number }
    },
    enabled: !!token,
    refetchInterval: 30000,
  })

  // Loading
  if ((initializing || (!hydrated && token)) && !authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Yuklanmoqda...</p>
        </div>
      </div>
    )
  }

  // Auth error or not registered
  if (!token || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 p-6">
        <div className="text-center">
          <div className="text-5xl mb-4">🚗</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">AkoWater Yetkazuvchi</h1>
          {authError && authError !== 'no_telegram'
            ? <p className="text-red-400 text-sm mb-4">{authError}</p>
            : <p className="text-gray-400 text-sm">Iltimos, Telegram bot orqali kiring</p>
          }
          {authError && authError !== 'no_telegram' && (
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold"
            >
              Qayta urinish
            </button>
          )}
        </div>
      </div>
    )
  }

  const handleOpenMap = (order: ActiveOrder) => {
    setMapFocusOrder(order)
    setTab('map')
  }

  return (
    <div className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-950 max-w-md mx-auto overflow-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <h1 className="font-bold text-gray-900 dark:text-white text-base">
          {tab === 'orders' && 'Buyurtmalar'}
          {tab === 'map' && 'Xarita'}
          {tab === 'debts' && 'Qarzlar'}
          {tab === 'history' && 'Tarix'}
          {tab === 'walkin' && 'Tez sotuv'}
          {tab === 'profile' && 'Profil'}
        </h1>
        <div className="flex items-center gap-3">
          {profile?.shift_open ? (
            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              Smena ochiq
            </span>
          ) : (
            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium px-2.5 py-1 rounded-full">
              Smena yopiq
            </span>
          )}
        </div>
      </header>

      {/* Main */}
      <main className={`flex-1 min-h-0 ${tab === 'map' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {tab === 'orders' && <OrdersTab onOpenMap={handleOpenMap} />}
        {tab === 'map' && (
          <MapTab
            focusOrder={mapFocusOrder}
            onClearFocus={() => setMapFocusOrder(null)}
          />
        )}
        {tab === 'debts' && <DebtPaymentTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'walkin' && <WalkinTab />}
        {tab === 'profile' && <ProfileTab />}
      </main>

      <BottomNav
        tab={tab}
        setTab={setTab}
        activeCount={ordersData?.orders?.length}
      />
    </div>
  )
}
