import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import api, { TENANT_ID } from '../api/client'

export type AppRole = 'courier' | 'operator' | 'boshliq' | 'super_admin' | 'client'

interface AuthState {
  isLoading: boolean
  isAuthenticated: boolean
  role: AppRole | null
  secondaryRole: string | null
  userId: string | null
  firstName: string | null
  // courier+operator dual role: which interface is active
  activeMode: 'courier' | 'operator'
  tenantId: string

  init: () => Promise<void>
  login: (phone: string) => Promise<void>
  register: (phone: string, firstName: string, lastName: string | null, address: string) => Promise<void>
  logout: () => Promise<void>
  switchMode: () => void
  saveFcmToken: (token: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isLoading: true,
  isAuthenticated: false,
  role: null,
  secondaryRole: null,
  userId: null,
  firstName: null,
  activeMode: 'courier',
  tenantId: TENANT_ID,

  init: async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token')
      if (!token) { set({ isLoading: false }); return }
      const { data } = await api.get('/auth/me')
      set({
        isAuthenticated: true,
        role: data.role,
        secondaryRole: data.secondary_role ?? null,
        userId: data.id,
        firstName: data.first_name,
        activeMode: data.role === 'operator' ? 'operator' : 'courier',
        isLoading: false,
      })
    } catch {
      await SecureStore.deleteItemAsync('access_token')
      await SecureStore.deleteItemAsync('refresh_token')
      set({ isLoading: false, isAuthenticated: false })
    }
  },

  login: async (phone) => {
    const { data: tokens } = await api.post('/auth/mobile/login', { phone, tenant_id: TENANT_ID })
    await SecureStore.setItemAsync('access_token', tokens.access_token)
    await SecureStore.setItemAsync('refresh_token', tokens.refresh_token)
    const { data: me } = await api.get('/auth/me')
    set({
      isAuthenticated: true,
      role: me.role,
      secondaryRole: me.secondary_role ?? null,
      userId: me.id,
      firstName: me.first_name,
      activeMode: me.role === 'operator' ? 'operator' : 'courier',
    })
  },

  register: async (phone, firstName, lastName, address) => {
    const { data: tokens } = await api.post('/auth/mobile/register', {
      phone, first_name: firstName, last_name: lastName, address, tenant_id: TENANT_ID,
    })
    await SecureStore.setItemAsync('access_token', tokens.access_token)
    await SecureStore.setItemAsync('refresh_token', tokens.refresh_token)
    const { data: me } = await api.get('/auth/me')
    set({ isAuthenticated: true, role: me.role, userId: me.id, firstName: me.first_name })
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('access_token')
    await SecureStore.deleteItemAsync('refresh_token')
    set({ isAuthenticated: false, role: null, userId: null, firstName: null })
  },

  switchMode: () => {
    const { activeMode } = get()
    set({ activeMode: activeMode === 'courier' ? 'operator' : 'courier' })
  },

  saveFcmToken: async (token) => {
    try {
      await api.post('/auth/mobile/fcm-token', { token })
    } catch {}
  },
}))
