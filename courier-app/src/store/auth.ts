import { create } from 'zustand'
import api from '@/api/client'
import type { CourierProfile } from '@/types'

interface AuthStore {
  token: string | null
  profile: CourierProfile | null
  hydrated: boolean
  loginWithTelegram: (initData: string) => Promise<void>
  fetchProfile: () => Promise<void>
  updateProfile: (patch: Partial<CourierProfile>) => void
  setLanguage: (lang: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: localStorage.getItem('access_token'),
  profile: null,
  hydrated: false,

  loginWithTelegram: async (initData: string) => {
    const { data } = await api.post('/auth/telegram/verify', { init_data: initData })
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    set({ token: data.access_token })
    await get().fetchProfile()
  },

  fetchProfile: async () => {
    const { data } = await api.get('/couriers/me')
    set({ profile: data, hydrated: true })
  },

  updateProfile: (patch) => {
    set(s => ({ profile: s.profile ? { ...s.profile, ...patch } : null }))
  },

  setLanguage: (lang) => {
    set(s => ({ profile: s.profile ? { ...s.profile, language: lang } : null }))
    api.patch('/couriers/me', { language: lang }).catch(() => {})
  },

  logout: () => {
    localStorage.clear()
    set({ token: null, profile: null, hydrated: false })
  },
}))
