export type UserRole = 'super_admin' | 'boshliq' | 'operator' | 'agent' | 'courier' | 'client'

export interface User {
  id: string
  tenant_id: string | null
  first_name: string
  last_name: string | null
  phone: string | null
  role: UserRole
  language: string
  is_active: boolean
}

export type OrderStatus =
  | 'yangi' | 'qabul_qilindi' | 'tayinlandi'
  | 'yolda' | 'yetkazildi' | 'bekor_qilindi'
  | 'muammo' | 'yopildi'

export type PaymentStatus = 'tolangan' | 'tolanmagan' | 'qisman'
export type PaymentMethod = 'naqd' | 'plastik' | 'payme' | 'click' | 'qarz'

export interface Order {
  id: number
  client_id: string | null
  client_name: string | null
  client_phone: string | null
  courier_id: string | null
  courier_name: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: PaymentMethod | null
  total_amount: number
  discount_amount: number
  paid_amount: number
  cash_amount: number
  card_amount: number
  payme_amount: number
  advance_used: number
  debt_amount: number
  comment: string | null
  created_at: string
  address_text: string | null
  items: OrderItem[]
  containers_returned?: number
  containers_delivered?: number
  client_debt?: number
  is_walkin?: boolean
  walkin_phone?: string | null
  walkin_address?: string | null
  walkin_store?: string | null
}

export interface OrderItem {
  id: string
  product_id: string
  product_name?: string | null
  quantity: number
  delivered_quantity?: number
  price_at_order: number
  total: number
}

export interface Client {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  is_active: boolean
  is_verified: boolean
  is_blocked: boolean
  has_contract: boolean
  container_balance: number
  debt_amount: number
  advance_amount: number
  created_at: string
  addresses: ClientAddress[]
}

export interface ClientAddress {
  id: string
  label: string
  address_text: string
  landmark: string | null
  is_primary: boolean
}

export interface Product {
  id: string
  name: string
  price: number
  volume: number | null
  volume_unit: string | null
  is_returnable_container: boolean
  is_active: boolean
  image_url: string | null
  category_id: string | null
}

export interface Courier {
  id: string
  user_id: string
  car_number: string | null
  is_active: boolean
  shift_status: 'open' | 'closed'
  full_containers: number
  empty_containers: number
  cash_balance: number
  card_balance: number
  payme_balance: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}
