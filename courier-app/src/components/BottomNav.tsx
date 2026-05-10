import { ShoppingBag, Map, Clock, User, DollarSign, Zap } from 'lucide-react'
import type { TabName } from '@/App'
import { useAuthStore } from '@/store/auth'
import { getT } from '@/i18n'

interface Props {
  tab: TabName
  setTab: (t: TabName) => void
  activeCount?: number
}

export default function BottomNav({ tab, setTab, activeCount }: Props) {
  const lang = useAuthStore(s => s.profile?.language)
  const t = getT(lang)

  const TABS = [
    { key: 'orders' as TabName,  icon: ShoppingBag, label: t.orders },
    { key: 'map' as TabName,     icon: Map,         label: t.map },
    { key: 'debts' as TabName,   icon: DollarSign,  label: t.debts },
    { key: 'history' as TabName, icon: Clock,       label: t.history },
    { key: 'walkin' as TabName,  icon: Zap,         label: t.walkin ?? 'Tez sotuv' },
    { key: 'profile' as TabName, icon: User,        label: t.profile },
  ]

  return (
    <nav className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex safe-bottom z-40 w-full">
      {TABS.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 relative transition-colors ${
            tab === key
              ? key === 'walkin' ? 'text-orange-500' : 'text-blue-600'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <div className="relative">
            <Icon size={22} strokeWidth={tab === key ? 2.5 : 1.8} />
            {key === 'orders' && activeCount && activeCount > 0 ? (
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-blue-600 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1 leading-none">
                {activeCount > 9 ? '9+' : activeCount}
              </span>
            ) : null}
          </div>
          <span className="text-[10px] font-medium">{label}</span>
        </button>
      ))}
    </nav>
  )
}
