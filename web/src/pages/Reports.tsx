import { useState, useEffect } from 'react'
import { Download, Printer, FileText, ShoppingBag, Users, DollarSign, Calendar, Package } from 'lucide-react'
import api from '@/api/client'
import { formatMoney, formatDate, formatDateTime, formatDateToString } from '@/utils/format'
import { OrderStatusBadge } from '@/utils/orderStatus'
import { useToastStore } from '@/store/toast'

interface ReportSummary {
  total_orders: number
  completed_orders: number
  cancelled_orders: number
  total_revenue: number
  total_debt: number
  new_clients: number
}

interface ReportOrder {
  id: string
  client_name: string
  courier_name: string | null
  status: string
  total_amount: number
  payment_status: string
  created_at: string
  completed_at: string | null
}

interface ProductStat {
  product_id: string
  product_name: string
  total_quantity: number
  total_revenue: number
  order_count: number
  avg_price: number
}

interface ProductReportData {
  summary: {
    total_quantity: number
    total_revenue: number
    product_count: number
  }
  products: ProductStat[]
}

type Tab = 'orders' | 'products'

export default function Reports() {
  const toast = useToastStore()
  const [activeTab, setActiveTab] = useState<Tab>('orders')
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [orders, setOrders] = useState<ReportOrder[]>([])
  const [productReport, setProductReport] = useState<ProductReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return formatDateToString(d)
  })
  const [dateTo, setDateTo] = useState(() => formatDateToString(new Date()))
  const [exporting, setExporting] = useState(false)
  const [selectedSheets, setSelectedSheets] = useState({
    orders: true, clients: true, couriers: true, finance: true,
  })

  const fetchReport = async () => {
    setLoading(true)
    try {
      const params = { date_from: dateFrom, date_to: dateTo }
      if (activeTab === 'orders') {
        const [sumRes, ordersRes] = await Promise.all([
          api.get('/statistics/', { params }),
          api.get('/reports/orders', { params: { ...params, per_page: 100 } }),
        ])
        setSummary(sumRes.data)
        setOrders(ordersRes.data.items ?? ordersRes.data)
      } else {
        const productRes = await api.get('/reports/products', { params })
        setProductReport(productRes.data)
      }
    } catch {
      toast.error('Hisobot yuklanmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReport() }, [dateFrom, dateTo, activeTab])

  const handleExport = async () => {
    setExporting(true)
    try {
      const sheets = Object.entries(selectedSheets).filter(([, v]) => v).map(([k]) => k)
      const resp = await api.get('/reports/export/excel', {
        params: { date_from: dateFrom, date_to: dateTo, sheets: sheets.join(',') },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([resp.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `hisobot_${dateFrom}_${dateTo}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Excel eksport amalga oshmadi')
    } finally {
      setExporting(false)
    }
  }

  const handlePrint = () => window.print()

  const handleExportProduct = async (productId: string, productName: string) => {
    try {
      const resp = await api.get(`/reports/export/product/${productId}`, {
        params: { date_from: dateFrom, date_to: dateTo },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([resp.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `${productName}_hisobot_${dateFrom}_${dateTo}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Excel eksport amalga oshmadi')
    }
  }

  const SUMMARY_CARDS = [
    { label: "Jami buyurtmalar", value: summary?.total_orders, icon: ShoppingBag, color: 'text-blue-500' },
    { label: "Bajarildi", value: summary?.completed_orders, icon: ShoppingBag, color: 'text-green-500' },
    { label: "Bekor qilindi", value: summary?.cancelled_orders, icon: ShoppingBag, color: 'text-red-500' },
    { label: "Umumiy daromad", value: summary?.total_revenue ? formatMoney(summary.total_revenue) : '—', icon: DollarSign, color: 'text-purple-500', isMoney: true },
    { label: "Qarz", value: summary?.total_debt ? formatMoney(summary.total_debt) : '—', icon: DollarSign, color: 'text-orange-500', isMoney: true },
    { label: "Yangi mijozlar", value: summary?.new_clients, icon: Users, color: 'text-teal-500' },
  ]

  return (
    <div className="space-y-5 print:space-y-3">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hisobotlar</h1>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="btn btn-secondary flex items-center gap-1.5">
            <Printer size={15} /> Chop etish
          </button>
          {activeTab === 'orders' && (
            <button onClick={handleExport} disabled={exporting} className="btn btn-primary flex items-center gap-1.5">
              <Download size={15} /> {exporting ? 'Yuklanmoqda...' : 'Excel export'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 print:hidden">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'orders'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <FileText size={15} className="inline mr-1.5" />
          Buyurtmalar
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'products'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Package size={15} className="inline mr-1.5" />
          Mahsulotlar
        </button>
      </div>

      {/* Date range + sheet selector */}
      <div className="flex items-start gap-4 flex-wrap print:hidden">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-gray-400" />
          <input type="date" className="input text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-gray-400">—</span>
          <input type="date" className="input text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500">Excel varaqlari:</span>
          {Object.entries(selectedSheets).map(([key, checked]) => (
            <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setSelectedSheets(s => ({ ...s, [key]: e.target.checked }))}
                className="rounded"
              />
              <span className="capitalize text-gray-600 dark:text-gray-400">{key}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Period heading for print */}
      <div className="hidden print:block text-center mb-4">
        <h2 className="text-xl font-bold">Hisobot: {dateFrom} — {dateTo}</h2>
      </div>

      {/* Summary cards - Orders tab */}
      {activeTab === 'orders' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SUMMARY_CARDS.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">{label}</span>
                <Icon size={16} className={color} />
              </div>
              {loading
                ? <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                : <p className="text-xl font-bold text-gray-900 dark:text-white">{value ?? '—'}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Summary cards - Products tab */}
      {activeTab === 'products' && productReport && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Jami sotildi</span>
              <Package size={16} className="text-blue-500" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {productReport.summary.total_quantity} dona
            </p>
          </div>
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Umumiy daromad</span>
              <DollarSign size={16} className="text-green-500" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatMoney(productReport.summary.total_revenue)}
            </p>
          </div>
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Mahsulotlar soni</span>
              <ShoppingBag size={16} className="text-purple-500" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {productReport.summary.product_count} ta
            </p>
          </div>
        </div>
      )}

      {/* Orders table */}
      {activeTab === 'orders' && (
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <FileText size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Buyurtmalar ro'yxati</span>
          <span className="badge badge-gray ml-auto">{orders.length} ta</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="hidden sm:table-cell table-header text-left">#</th>
                <th className="table-header text-left">Sana</th>
                <th className="table-header text-left">Mijoz</th>
                <th className="hidden sm:table-cell table-header text-left">Kurer</th>
                <th className="table-header text-left">Holat</th>
                <th className="table-header text-left">Summa</th>
                <th className="hidden md:table-cell table-header text-left">Tugatildi</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="table-cell">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : orders.map((order, idx) => (
                    <tr key={order.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="hidden sm:table-cell table-cell text-gray-400 text-xs">{idx + 1}</td>
                      <td className="table-cell text-xs text-gray-500">{formatDate(order.created_at)}</td>
                      <td className="table-cell font-medium text-gray-800 dark:text-gray-200">{order.client_name}</td>
                      <td className="hidden sm:table-cell table-cell text-gray-500">{order.courier_name ?? '—'}</td>
                      <td className="table-cell"><OrderStatusBadge status={order.status} /></td>
                      <td className="table-cell font-semibold text-gray-900 dark:text-white">{formatMoney(order.total_amount)}</td>
                      <td className="hidden md:table-cell table-cell text-xs text-gray-500">
                        {order.completed_at ? formatDateTime(order.completed_at) : '—'}
                      </td>
                    </tr>
                  ))}
              {!loading && orders.length === 0 && (
                <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Buyurtmalar yo'q</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Products table */}
      {activeTab === 'products' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <Package size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Mahsulotlar bo'yicha hisobot</span>
            <span className="badge badge-gray ml-auto">{productReport?.products.length ?? 0} ta</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="hidden sm:table-cell table-header text-left">#</th>
                  <th className="table-header text-left">Mahsulot</th>
                  <th className="table-header text-right">Sotildi</th>
                  <th className="hidden sm:table-cell table-header text-right">Buyurtmalar</th>
                  <th className="hidden md:table-cell table-header text-right">O'rtacha narx</th>
                  <th className="table-header text-right">Jami daromad</th>
                  <th className="table-header text-center print:hidden">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="table-cell">
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : productReport?.products.map((product, idx) => (
                      <tr key={product.product_id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="hidden sm:table-cell table-cell text-gray-400 text-xs">{idx + 1}</td>
                        <td className="table-cell font-medium text-gray-800 dark:text-gray-200">{product.product_name}</td>
                        <td className="table-cell text-right font-semibold text-blue-600">{product.total_quantity}</td>
                        <td className="hidden sm:table-cell table-cell text-right text-gray-500">{product.order_count}</td>
                        <td className="hidden md:table-cell table-cell text-right text-gray-500">{formatMoney(product.avg_price)}</td>
                        <td className="table-cell text-right font-bold text-gray-900 dark:text-white">{formatMoney(product.total_revenue)}</td>
                        <td className="table-cell text-center print:hidden">
                          <button
                            onClick={() => handleExportProduct(product.product_id, product.product_name)}
                            className="btn btn-sm btn-secondary flex items-center gap-1 mx-auto"
                            title="Excel yuklab olish"
                          >
                            <Download size={13} /> Excel
                          </button>
                        </td>
                      </tr>
                    ))}
                {!loading && productReport?.products.length === 0 && (
                  <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Ma'lumot yo'q</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
