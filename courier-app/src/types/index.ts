export interface CourierProfile {
  id: string
  user_id: string
  first_name: string
  last_name: string | null
  phone: string
  car_number: string | null
  is_active: boolean
  shift_open: boolean
  shift_started_at: string | null
  today_deliveries: number
  today_income: number
  cash_balance: number
  card_balance: number
  payme_balance: number
  container_balance: number
  preferred_navigator: 'yandex' | '2gis' | 'google'
  language: string
}

export interface OrderItem {
  product_id: string
  product_name: string
  quantity: number
  price_at_order: number
  volume_liters: number | null
  is_returnable: boolean
}

export interface ActiveOrder {
  id: string
  order_number: number
  client_name: string
  client_phone: string
  contact_phone: string | null
  address_text: string
  latitude: number | null
  longitude: number | null
  total_amount: number
  status: string
  created_at: string
  items: OrderItem[]
  client_debt: number
  client_advance: number
  client_container_balance: number
  paid_amount: number
  cash_amount: number
  card_amount: number
  payme_amount: number
  debt_amount: number
  discount_amount: number
}

export interface CompletedOrder {
  id: string
  order_number: number
  client_name: string
  total_amount: number
  payment_status: string
  status: string
  completed_at: string
  address_text: string
  items: OrderItem[]
  containers_returned: number
  containers_delivered: number
  cash_amount: number
  card_amount: number
  payme_amount: number
  advance_used: number
  debt_amount: number
  discount_amount: number
}
