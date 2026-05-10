/**
 * Format UZS amount: 12000 → "12,000 so'm"
 */
export function formatMoney(amount: number): string {
  return `${amount.toLocaleString('uz-UZ')} so'm`
}

/**
 * Format compact: 1500000 → "1.5M"
 */
export function formatCompact(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`
  return String(amount)
}

/**
 * UTC → UTC+5 display
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Asia/Tashkent',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  })
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  d.setHours(d.getHours() + 5)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Format Date object to YYYY-MM-DD in local timezone (GMT+5)
 * Use this instead of toISOString() to avoid timezone conversion issues
 */
export function formatDateToString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Phone: 998901234567 → +998 90 123 45 67
 */
export function formatPhone(phone: string): string {
  if (!phone) return ''
  const p = phone.replace(/\D/g, '')
  if (p.length === 12) return `+${p.slice(0,3)} ${p.slice(3,5)} ${p.slice(5,8)} ${p.slice(8,10)} ${p.slice(10)}`
  return `+${p}`
}

/**
 * Normalize phone to +998XXXXXXXXX format:
 *   901234567   (9 digits)  → +998901234567
 *   998901234567 (12 digits) → +998901234567
 *   +998901234567            → +998901234567
 *   0901234567  (10 digits)  → +998901234567
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 9) return `+998${digits}`
  if (digits.length === 10 && digits.startsWith('0')) return `+998${digits.slice(1)}`
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`
  if (raw.startsWith('+')) return raw
  return raw
}

/**
 * Get initials from name: "Azamat Karimov" → "AK"
 */
export function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('')
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
]

export function getAvatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

export function clientDisplay(client: { display_name?: string | null; addresses?: { address_text: string; is_primary?: boolean }[]; phone?: string }): string {
  if (client.display_name) return client.display_name
  const primary = client.addresses?.find(a => a.is_primary) ?? client.addresses?.[0]
  return primary?.address_text ?? client.phone ?? '—'
}
