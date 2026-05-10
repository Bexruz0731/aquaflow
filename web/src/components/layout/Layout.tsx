import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import Sidebar from './Sidebar'
import Header from './Header'
import ToastContainer from '@/components/ui/Toast'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className={clsx(
          'transition-all duration-200',
          collapsed ? 'md:ml-16' : 'md:ml-60'
        )}
      >
        <Header onMenuClick={() => setMobileOpen(!mobileOpen)} />
        <main className="p-3 sm:p-6 min-h-[calc(100vh-64px)]">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  )
}
