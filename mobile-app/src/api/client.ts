import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

const API_URL = Constants.expoConfig?.extra?.API_URL ?? 'http://localhost:8000/api/v1'
export const TENANT_ID = Constants.expoConfig?.extra?.TENANT_ID ?? ''

const api = axios.create({ baseURL: API_URL, timeout: 15000 })

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        const refresh = await SecureStore.getItemAsync('refresh_token')
        if (refresh) {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refresh })
          await SecureStore.setItemAsync('access_token', data.access_token)
          await SecureStore.setItemAsync('refresh_token', data.refresh_token)
          error.config.headers.Authorization = `Bearer ${data.access_token}`
          return api(error.config)
        }
      } catch {
        await SecureStore.deleteItemAsync('access_token')
        await SecureStore.deleteItemAsync('refresh_token')
      }
    }
    return Promise.reject(error)
  }
)

export default api
