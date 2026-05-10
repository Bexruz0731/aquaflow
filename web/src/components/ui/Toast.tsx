import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useToastStore } from '@/store/toast'
import { clsx } from 'clsx'

const ICONS = {
  success: <CheckCircle size={18} className="text-green-500" />,
  error: <XCircle size={18} className="text-red-500" />,
  info: <Info size={18} className="text-blue-500" />,
}

const BG = {
  success: 'border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800',
  error: 'border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800',
  info: 'border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800',
}

export default function ToastContainer() {
  const { toasts, remove } = useToastStore()

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg',
            'animate-in slide-in-from-bottom-4 duration-200',
            BG[t.type]
          )}
        >
          {ICONS[t.type]}
          <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">{t.message}</span>
          <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-gray-600 ml-2">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
