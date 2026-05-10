import { ShoppingBag, ShoppingCart, Package, User } from 'lucide-react'
import type { TabName } from '@/App'
import { useAuthStore } from '@/store/auth'
import { getT } from '@/i18n'

interface Props {
  tab: TabName
  setTab: (t: TabName) => void
  cartCount: number
}

export default function BottomNav({ tab, setTab, cartCount }: Props) {
  const lang = useAuthStore(s => s.profile?.language)
  const t = getT(lang)

  const TABS = [
    { key: 'catalog' as TabName, icon: ShoppingBag, label: t.catalog },
    { key: 'cart' as TabName, icon: ShoppingCart, label: t.cart },
    { key: 'orders' as TabName, icon: Package, label: t.orders },
    { key: 'profile' as TabName, icon: User, label: t.profile },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex safe-bottom">
      {TABS.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 relative transition-colors ${
            tab === key ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <div className="relative">
            <Icon size={22} strokeWidth={tab === key ? 2.5 : 1.8} />
            {key === 'cart' && cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-600 text-white text-[10px] rounded-full flex items-center justify-center font-bold leading-none">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium">{label}</span>
        </button>
      ))}
    </nav>
  )
}
