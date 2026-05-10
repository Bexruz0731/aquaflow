import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard, ShoppingCart, Users, AlertCircle, Package,
  UserCheck, Truck, Warehouse,
  FileText, Settings, ChevronLeft, ChevronRight, Droplets, Wallet, Clock,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { getInitials, getAvatarColor } from '@/utils/format'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  roles?: string[]
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'ASOSIY',
    items: [
      { to: '/dashboard',        icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
      { to: '/orders',           icon: <ShoppingCart size={18} />,    label: 'Buyurtmalar',      roles: ['boshliq', 'super_admin', 'operator', 'agent'] },
      { to: '/clients',          icon: <Users size={18} />,           label: 'Mijozlar',         roles: ['boshliq', 'super_admin', 'operator', 'agent'] },
      { to: '/debts',            icon: <AlertCircle size={18} />,     label: 'Qarzdorlar',       roles: ['boshliq', 'super_admin', 'operator', 'agent'] },
      { to: '/inactive-clients', icon: <Clock size={18} />,           label: 'Noaktiv mijozlar', roles: ['boshliq', 'super_admin', 'operator'] },
    ],
  },
  {
    title: 'KATALOG',
    items: [
      { to: '/products', icon: <Package size={18} />, label: 'Mahsulotlar', roles: ['boshliq', 'super_admin', 'operator', 'agent'] },
    ],
  },
  {
    title: 'XODIMLAR',
    items: [
      { to: '/staff',    icon: <UserCheck size={18} />, label: 'Xodimlar',             roles: ['boshliq', 'super_admin'] },
      { to: '/couriers', icon: <Truck size={18} />,     label: 'Yetkazib beruvchilar', roles: ['boshliq', 'super_admin', 'operator'] },
      { to: '/operator-kassa', icon: <Wallet size={18} />, label: 'Mening kassam',     roles: ['operator', 'agent'] },
    ],
  },
  {
    title: 'MOLIYA',
    items: [
      { to: '/finance',         icon: <Wallet size={18} />,    label: 'Moliya',          roles: ['boshliq', 'super_admin'] },
      { to: '/admin-expenses',  icon: <FileText size={18} />, label: 'Xarajatlar',      roles: ['boshliq', 'super_admin', 'operator'] },
      { to: '/warehouse',       icon: <Warehouse size={18} />, label: 'Ombor',           roles: ['boshliq', 'super_admin', 'operator', 'agent'] },
      { to: '/cash-register',   icon: <Wallet size={18} />,    label: 'Kassa',           roles: ['boshliq', 'super_admin'] },
      { to: '/reports',         icon: <FileText size={18} />,  label: 'Hisobotlar',      roles: ['boshliq', 'super_admin', 'operator'] },
    ],
  },
  {
    title: 'TIZIM',
    items: [
      { to: '/settings', icon: <Settings size={18} />, label: 'Sozlamalar', roles: ['boshliq', 'super_admin'] },
    ],
  },
]

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { user } = useAuthStore()
  const role = user?.role

  const canAccess = (item: NavItem) => {
    if (!item.roles) return true
    return item.roles.includes(role || '')
  }

  return (
    <aside
      className={clsx(
        'fixed top-0 left-0 h-screen bg-[#F8F9FA] dark:bg-gray-900',
        'border-r border-gray-200 dark:border-gray-800',
        'flex flex-col transition-all duration-200 z-30',
        // Desktop: width based on collapsed state
        collapsed ? 'md:w-16' : 'md:w-60',
        // Mobile: always full width, shown/hidden via transform
        'w-60',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      {/* Logo */}
      <div className={clsx('flex items-center gap-3 px-4 py-5 border-b border-gray-200 dark:border-gray-800', collapsed && 'justify-center px-2')}>
        <div className="flex-shrink-0 w-8 h-8 bg-[#0f0f23] rounded-lg flex items-center justify-center">
          <Droplets size={16} className="text-white" />
        </div>
        {!collapsed && <span className="font-bold text-gray-900 dark:text-white">AkoWater</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(canAccess)
          if (!visibleItems.length) return null
          return (
            <div key={group.title} className="mb-4">
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {group.title}
                </p>
              )}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      collapsed && 'justify-center px-2',
                      isActive
                        ? 'bg-[#0f0f23] text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800'
                    )
                  }
                  title={collapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      {/* User + Toggle */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3">
        {!collapsed && user && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0', getAvatarColor(user.first_name))}>
              {getInitials(user.first_name + (user.last_name ? ' ' + user.last_name : ''))}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.first_name}</p>
              <p className="text-xs text-gray-500 capitalize">{user.role}</p>
            </div>
          </div>
        )}
        {/* Desktop collapse toggle */}
        <button
          onClick={onToggle}
          className="hidden md:flex items-center justify-center w-full py-1.5 rounded-lg text-gray-500 hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span className="ml-2 text-xs">Yopish</span></>}
        </button>
        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="flex md:hidden items-center justify-center w-full py-1.5 rounded-lg text-gray-500 hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft size={16} /><span className="ml-2 text-xs">Yopish</span>
        </button>
      </div>
    </aside>
  )
}
