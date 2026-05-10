import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { initTheme } from '@/store/theme'

import RequireAuth from '@/components/layout/RequireAuth'
import Layout from '@/components/layout/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Orders from '@/pages/Orders'
import Clients from '@/pages/Clients'
import Debts from '@/pages/Debts'
import Products from '@/pages/Products'
import Staff from '@/pages/Staff'
import StaffDetail from '@/pages/StaffDetail'
import CouriersPage from '@/pages/Couriers'
import Regions from '@/pages/Regions'
import Warehouse from '@/pages/Warehouse'
import Treasury from '@/pages/Treasury'
import Statistics from '@/pages/Statistics'
import Reports from '@/pages/Reports'
import SettingsPage from '@/pages/Settings'
import CashRegister from '@/pages/CashRegister'
import Finance from '@/pages/Finance'
import InactiveClients from '@/pages/InactiveClients'
import OperatorKassa from '@/pages/OperatorKassa'
import AdminExpenses from '@/pages/AdminExpenses'

export default function App() {
  useEffect(() => { initTheme() }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/orders/*"    element={<Orders />} />
          <Route path="/clients/*"   element={<Clients />} />
          <Route path="/debts/*"     element={<Debts />} />
          <Route path="/products/*"  element={<Products />} />
          <Route path="/staff"       element={<Staff />} />
          <Route path="/staff/:id"   element={<StaffDetail />} />
          <Route path="/couriers/*"  element={<CouriersPage />} />
          <Route path="/regions"     element={<Regions />} />
          <Route path="/warehouse"      element={<Warehouse />} />
          <Route path="/treasury"       element={<Treasury />} />
          <Route path="/cash-register"  element={<CashRegister />} />
          <Route path="/finance"        element={<Finance />} />
          <Route path="/statistics"     element={<Statistics />} />
          <Route path="/reports"            element={<Reports />} />
          <Route path="/inactive-clients" element={<InactiveClients />} />
          <Route path="/operator-kassa"   element={<OperatorKassa />} />
          <Route path="/admin-expenses"   element={<AdminExpenses />} />
          <Route path="/settings"       element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
