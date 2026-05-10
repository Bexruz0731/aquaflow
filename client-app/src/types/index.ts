export interface Product {
  id: string
  name: string
  category_id: string | null
  category_name: string | null
  volume_liters: number | null
  price: number
  is_returnable: boolean
  is_active: boolean
  image_url: string | null
}

export interface OrderItem {
  id: string
  product_id: string
  product_name: string | null
  quantity: number
  price_at_order: number
  total: number
  volume_liters: number | null
  is_returnable: boolean
}

export interface Order {
  id: number
  status: string
  payment_status: string
  total_amount: number
  paid_amount: number
  debt_amount: number
  comment: string | null
  created_at: string
  completed_at: string | null
  address_text: string | null
  courier_name: string | null
  courier_phone: string | null
  order_number: number | null
  containers_returned: number
  items: OrderItem[]
}
