import { useState } from 'react'

interface Props {
  onLogin: (telegramId: number) => Promise<void>
}

export default function TdesktopLogin({ onLogin }: Props) {
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    const num = parseInt(id.trim(), 10)
    if (!num) { setError('Noto\'g\'ri ID'); return }
    setLoading(true)
    setError('')
    try {
      await onLogin(num)
    } catch (e: any) {
      setError(String(e?.response?.data?.detail ?? e?.message ?? 'Xato'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="text-center w-full max-w-xs">
        <p className="text-3xl mb-3">🖥️</p>
        <p className="text-gray-700 font-semibold mb-1">Telegram Desktop</p>
        <p className="text-xs text-gray-400 mb-5">
          Desktop versiyada avtomatik login ishlamaydi.<br />
          Telegram ID kiriting (dev rejimi):
        </p>
        <input
          type="number"
          placeholder="Telegram ID (masalan: 123456789)"
          value={id}
          onChange={e => setId(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm mb-3 outline-none focus:border-blue-400"
        />
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          {loading ? 'Yuklanmoqda...' : 'Kirish'}
        </button>
      </div>
    </div>
  )
}
