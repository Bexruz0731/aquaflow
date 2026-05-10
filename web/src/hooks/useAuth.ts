import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

export function useRequireAuth() {
  const { isAuthenticated, fetchMe } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      fetchMe().then(() => {}).catch(() => navigate('/login'))
    } else if (!isAuthenticated) {
      navigate('/login')
    }
  }, [])
}
