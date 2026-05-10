import { clsx } from 'clsx'

type BadgeVariant = 'success' | 'info' | 'warning' | 'danger' | 'gray' | 'purple' | 'orange'

const VARIANTS: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  info:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500',
  danger:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  gray:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  purple:  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  orange:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

export default function Badge({ children, variant = 'gray', className }: BadgeProps) {
  return (
    <span className={clsx('badge', VARIANTS[variant], className)}>
      {children}
    </span>
  )
}
