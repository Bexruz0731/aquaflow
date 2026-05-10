import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface PaginationProps {
  page: number
  pages: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
}

export default function Pagination({ page, pages, perPage, total, onPageChange, onPerPageChange }: PaginationProps) {
  const getPages = () => {
    const arr: (number | '...')[] = []
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
    arr.push(1)
    if (page > 3) arr.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) arr.push(i)
    if (page < pages - 2) arr.push('...')
    arr.push(pages)
    return arr
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>Jami: {total}</span>
        {onPerPageChange && (
          <div className="flex items-center gap-1 ml-3">
            <span>Qatorlar:</span>
            <select
              value={perPage}
              onChange={(e) => onPerPageChange(Number(e.target.value))}
              className="border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(1)} disabled={page === 1} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30">
          <ChevronsLeft size={14} />
        </button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30">
          <ChevronLeft size={14} />
        </button>

        {getPages().map((p, i) => (
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-gray-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={clsx(
                'w-8 h-8 rounded text-sm font-medium',
                p === page
                  ? 'bg-[#0f0f23] text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
              )}
            >
              {p}
            </button>
          )
        ))}

        <button onClick={() => onPageChange(page + 1)} disabled={page >= pages} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30">
          <ChevronRight size={14} />
        </button>
        <button onClick={() => onPageChange(pages)} disabled={page >= pages} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30">
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  )
}
