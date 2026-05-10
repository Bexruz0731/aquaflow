import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  product_id: string
  name: string
  price: number
  volume_liters: number | null
  image_url: string | null
  quantity: number
}

interface CartStore {
  items: CartItem[]
  selectedAddressId: string | null
  comment: string
  contactPhone: string
  add: (item: Omit<CartItem, 'quantity'>) => void
  remove: (product_id: string) => void
  setQty: (product_id: string, qty: number) => void
  setAddress: (id: string | null) => void
  setComment: (c: string) => void
  setContactPhone: (phone: string) => void
  clear: () => void
  total: () => number
  count: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      selectedAddressId: null,
      comment: '',
      contactPhone: '',

      add: item => set(s => {
        const existing = s.items.find(i => i.product_id === item.product_id)
        if (existing) {
          return { items: s.items.map(i => i.product_id === item.product_id ? { ...i, quantity: i.quantity + 1 } : i) }
        }
        return { items: [...s.items, { ...item, quantity: 1 }] }
      }),

      remove: id => set(s => ({ items: s.items.filter(i => i.product_id !== id) })),

      setQty: (id, qty) => set(s => {
        if (qty <= 0) return { items: s.items.filter(i => i.product_id !== id) }
        return { items: s.items.map(i => i.product_id === id ? { ...i, quantity: qty } : i) }
      }),

      setAddress: id => set({ selectedAddressId: id }),
      setComment: c => set({ comment: c }),
      setContactPhone: phone => set({ contactPhone: phone }),
      clear: () => set({ items: [], selectedAddressId: null, comment: '', contactPhone: '' }),

      total: () => get().items.reduce((s, i) => s + i.price * i.quantity, 0),
      count: () => get().items.reduce((s, i) => s + i.quantity, 0),
    }),
    { name: 'cart' }
  )
)
