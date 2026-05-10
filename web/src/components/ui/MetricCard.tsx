import { clsx } from 'clsx'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  className?: string
}

export default function MetricCard({ title, value, subtitle, icon: Icon, className }: MetricCardProps) {
  return (
    <div className={clsx('card-hover', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg flex-shrink-0">
          <Icon size={20} className="text-gray-400" />
        </div>
      </div>
    </div>
  )
}
