import { clsx } from 'clsx'
import { getInitials, getAvatarColor } from '@/utils/format'

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }

export default function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <div className={clsx('rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0', SIZES[size], getAvatarColor(name), className)}>
      {getInitials(name)}
    </div>
  )
}
