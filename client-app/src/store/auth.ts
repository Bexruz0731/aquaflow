import { create } from 'zustand'
import api from '@/api/client'

interface Profile {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  language: string
  advance_amount: number
  debt_amount: number
  container_balance: number
  addresses: Address[]
}

export interface Address {
  id: string
  label: string
  address_text: string
  latitude: number
  longitude: number
}

interface AuthStore {
  token: string | null
  profile: Profile | null
  hydrated: boolean
  loginWithTelegram: (initData: string) => Promise<void>
  loginWithTelegramId: (telegramId: number) => Promise<void>
  fetchProfile: () => Promise<void>
  setLanguage: (lang: string) => void
  logout: () => void
}

const _cachedProfile = () => {
  try {
    const raw = localStorage.getItem('profile_cache')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: localStorage.getItem('access_token'),
  profile: _cachedProfile(),
  hydrated: !!_cachedProfile(),

  loginWithTelegram: async (initData: string) => {
    const { data } = await api.post('/auth/telegram/verify', { init_data: initData })
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    set({ token: data.access_token })
    await get().fetchProfile()
  },

  loginWithTelegramId: async (telegramId: number) => {
    const { data } = await api.post('/auth/telegram/login-by-id', { telegram_id: telegramId })
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    set({ token: data.access_token })
    await get().fetchProfile()
  },

  fetchProfile: async () => {
    const { data } = await api.get('/clients/me')
    localStorage.setItem('profile_cache', JSON.stringify(data))
    set({ profile: data, hydrated: true })
  },

  setLanguage: (lang: string) => {
    set(s => ({ profile: s.profile ? { ...s.profile, language: lang } : null }))
    api.patch('/clients/me', { language: lang }).catch(() => {})
  },

  logout: () => {
    localStorage.clear()
    set({ token: null, profile: null, hydrated: false })
  },
}))
