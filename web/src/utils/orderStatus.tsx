import type { OrderStatus, PaymentStatus } from '@/types'

interface StatusConfig {
  label: string
  className: string
}

export const ORDER_STATUS: Record<OrderStatus, StatusConfig> = {
  yangi:          { label: 'YANGI',          className: 'badge-info' },
  qabul_qilindi:  { label: 'QABUL QILINDI',  className: 'badge bg-purple-100 text-purple-700' },
  tayinlandi:     { label: 'TAYINLANDI',     className: 'badge bg-orange-100 text-orange-700' },
  yolda:          { label: "YO'LDA",          className: 'badge-warning' },
  yetkazildi:     { label: 'YETKAZILDI',     className: 'badge-success' },
  bekor_qilindi:  { label: 'BEKOR QILINDI',  className: 'badge-danger' },
  muammo:         { label: 'MUAMMO',         className: 'badge-gray' },
  yopildi:        { label: 'YOPILDI',        className: 'badge bg-emerald-100 text-emerald-800' },
}

export const PAYMENT_STATUS: Record<PaymentStatus, StatusConfig> = {
  tolangan:    { label: "To'langan",   className: 'text-green-600 font-medium' },
  tolanmagan:  { label: "To'lanmagan", className: 'text-gray-500' },
  qisman:      { label: 'Qisman',      className: 'text-yellow-600 font-medium' },
}

export function OrderStatusBadge({ status }: { status: string }) {
  const cfg = ORDER_STATUS[status as OrderStatus] ?? { label: status, className: 'badge badge-gray' }
  return <span className={cfg.className}>{cfg.label}</span>
}

export function PaymentStatusText({ status }: { status: PaymentStatus }) {
  const cfg = PAYMENT_STATUS[status]
  return <span className={cfg.className}>{cfg.label}</span>
}
