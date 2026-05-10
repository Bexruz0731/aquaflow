import { useState, useEffect, lazy, Suspense } from 'react'
import { useAuthStore } from '@/store/auth'
import { useCartStore } from '@/store/cart'
import BottomNav from '@/components/BottomNav'
import SplashScreen from '@/components/SplashScreen'
import TdesktopLogin from '@/components/TdesktopLogin'
import api from '@/api/client'
import { queryClient } from './main'

const CatalogPage = lazy(() => import('@/pages/CatalogPage'))
const CartPage = lazy(() => import('@/pages/CartPage'))
const OrdersPage = lazy(() => import('@/pages/OrdersPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))

export type TabName = 'catalog' | 'cart' | 'orders' | 'profile'

// Extend window for Telegram WebApp
declare global {
  interface Window {
    Telegram?: { WebApp: { initData: string; initDataUnsafe: { user?: { id: number } }; ready: () => void; expand: () => void; close: () => void; colorScheme: 'light' | 'dark' } }
  }
}

const TG_INIT_DATA_KEY = 'tg_init_data'

export default function App() {
  const [tab, setTab] = useState<TabName>('catalog')
  const [initializing, setInitializing] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const { token, loginWithTelegram, loginWithTelegramId, fetchProfile, hydrated } = useAuthStore()
  const cartCount = useCartStore(s => s.count())

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
    }

    // Save initData to sessionStorage on first load — Telegram clears it on page reload
    const freshInitData = tg?.initData
    if (freshInitData) {
      sessionStorage.setItem(TG_INIT_DATA_KEY, freshInitData)
    }
    // Use saved initData if current one is empty (e.g. after token refresh cleared and no reload)
    const initData = freshInitData || sessionStorage.getItem(TG_INIT_DATA_KEY) || ''

    const init = async () => {
      if (token) {
        if (hydrated) {
          // Already have cached profile — show app immediately, refresh in background
          setInitializing(false)
          fetchProfile().catch(() => {
            // Token expired — try re-login
            if (initData) loginWithTelegram(initData).catch(() => {})
          })
          return
        }
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
      } else if (!tg) {
        setAuthError('no_telegram')
      } else {
        const tgUserId = tg?.initDataUnsafe?.user?.id
        if (tgUserId) {
          await loginWithTelegramId(tgUserId).catch((err) => {
            setAuthError(String(err?.response?.data?.detail ?? err?.message ?? 'Auth error'))
          })
        } else {
          setAuthError('tdesktop_no_data')
        }
      }
      // After auth: check catalog version and invalidate cache if products changed
      try {
        const { data: versionData } = await api.get('/products/catalog-ts')
        if (versionData?.ts) {
          const stored = localStorage.getItem('catalogTs')
          if (stored !== versionData.ts) {
            queryClient.removeQueries({ queryKey: ['products'] })
            localStorage.setItem('catalogTs', versionData.ts)
          }
        }
      } catch {
        // non-critical — ignore
      }

      setInitializing(false)
    }
    init()
  }, [])

  if (initializing || (!hydrated && token)) {
    return <SplashScreen />
  }

  if (authError === 'tdesktop_no_data' && !token) {
    return <TdesktopLogin onLogin={async (id) => {
      const { loginWithTelegramId } = useAuthStore.getState()
      await loginWithTelegramId(id)
      setAuthError(null)
    }} />
  }

  if (authError && authError !== 'no_telegram' && !token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-gray-700 font-semibold mb-1">Avtorizatsiya xatosi</p>
          <p className="text-xs text-gray-400 mb-4">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold"
          >
            Qayta urinish
          </button>
        </div>
      </div>
    )
  }

  const PAGES = {
    catalog: <CatalogPage onGoCart={() => setTab('cart')} />,
    cart: <CartPage onOrderPlaced={() => setTab('orders')} />,
    orders: <OrdersPage onGoCart={() => setTab('cart')} />,
    profile: <ProfilePage />,
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 max-w-md mx-auto">
      <main className="flex-1 overflow-y-auto pb-20">
        <Suspense fallback={<SplashScreen />}>
          {PAGES[tab]}
        </Suspense>
      </main>
      <BottomNav tab={tab} setTab={setTab} cartCount={cartCount} />
    </div>
  )
}
