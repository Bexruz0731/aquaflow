import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://api.suvpro.uz/api/v1'

const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('courier_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  r => r,
  async err => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem('courier_refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refresh })
          localStorage.setItem('courier_access_token', data.access_token)
          localStorage.setItem('courier_refresh_token', data.refresh_token)
          err.config.headers.Authorization = `Bearer ${data.access_token}`
          return api(err.config)
        } catch {
          localStorage.removeItem('courier_access_token')
          localStorage.removeItem('courier_refresh_token')
          window.location.reload()
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api
