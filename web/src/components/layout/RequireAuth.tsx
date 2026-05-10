import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

export default function RequireAuth() {
  const { isAuthenticated } = useAuthStore()
  const token = localStorage.getItem('access_token')

  if (!isAuthenticated && !token) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
