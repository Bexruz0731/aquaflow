import { useState, type FormEvent } from 'react'
import { Droplets, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

export default function LoginForm() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { loginWithPassword } = useAuthStore()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!phone || !password) return
    setLoading(true)
    setError(null)
    try {
      await loginWithPassword(phone, password)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Telefon yoki parol noto\'g\'ri')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-green-600 rounded-2xl mb-4">
            <Droplets size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AkoWater</h1>
          <p className="text-sm text-gray-500 mt-1">Yetkazuvchi paneli</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Tizimga kirish</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Telefon raqam
              </label>
              <input
                type="tel"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="998901234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="username"
                inputMode="tel"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Parol
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !phone || !password}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors mt-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Kirish...' : 'Kirish'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Parolni operator yoki menejerdan oling
        </p>
      </div>
    </div>
  )
}
