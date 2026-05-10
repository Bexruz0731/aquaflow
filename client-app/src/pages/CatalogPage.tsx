import { useState, useEffect } from 'react'
import { Search, Plus, Minus, ShoppingCart } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { getT } from '@/i18n'
import type { Product } from '@/types'

interface Props { onGoCart: () => void }

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function formatMoney(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }

export default function CatalogPage({ onGoCart }: Props) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const { items, add, setQty, count } = useCartStore()
  const lang = useAuthStore(s => s.profile?.language)
  const t = getT(lang)

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', debouncedSearch],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data } = await api.get('/products/', { params: { search: debouncedSearch || undefined, is_active: true } })
      return (Array.isArray(data) ? data : (data.items || [])) as Product[]
    },
  })

  const getQty = (id: string) => items.find(i => i.product_id === id)?.quantity ?? 0

  return (
    <div className="p-4 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={t.searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Cart button (floating) */}
      {count() > 0 && (
        <button
          onClick={onGoCart}
          className="fixed bottom-20 right-4 z-10 bg-blue-600 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-xl"
        >
          <ShoppingCart size={18} />
          <span className="font-semibold text-sm">{count()} ta • {formatMoney(useCartStore.getState().total())}</span>
        </button>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-3 animate-pulse">
                <div className="aspect-square bg-gray-200 dark:bg-gray-700 rounded-xl mb-3" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
              </div>
            ))
          : (products ?? []).map(product => {
              const qty = getQty(product.id)
              return (
                <div key={product.id} className="bg-white dark:bg-gray-800 rounded-2xl p-3 flex flex-col shadow-sm">
                  {/* Image */}
                  <div className="aspect-square bg-blue-50 dark:bg-blue-900/20 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
                    {product.image_url
                      ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-xl" />
                      : <span className="text-4xl">💧</span>}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{product.name}</p>
                    {product.volume_liters && (
                      <span className="inline-block mt-1 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                        {product.volume_liters}L
                      </span>
                    )}
                    <p className="text-blue-600 font-bold text-sm mt-2">{formatMoney(product.price)}</p>
                  </div>

                  {/* Counter */}
                  <div className="mt-3">
                    {qty === 0
                      ? (
                        <button
                          onClick={() => add({ product_id: product.id, name: product.name, price: product.price, volume_liters: product.volume_liters, image_url: product.image_url })}
                          className="w-full py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                        >
                          <Plus size={15} /> Qo'shish
                        </button>
                      )
                      : (
                        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-xl px-2 py-1.5">
                          <button onClick={() => setQty(product.id, qty - 1)} className="w-7 h-7 bg-white dark:bg-gray-700 rounded-lg flex items-center justify-center shadow-sm active:scale-90 transition-transform">
                            <Minus size={14} className="text-blue-600" />
                          </button>
                          <span className="font-bold text-blue-600 text-sm">{qty}</span>
                          <button onClick={() => setQty(product.id, qty + 1)} className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm active:scale-90 transition-transform">
                            <Plus size={14} className="text-white" />
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              )
            })}
      </div>

      {!isLoading && (products ?? []).length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🔍</p>
          <p>{t.noProducts}</p>
        </div>
      )}
    </div>
  )
}
