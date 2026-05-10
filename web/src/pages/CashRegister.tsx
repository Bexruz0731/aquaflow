import { useState, useEffect } from 'react'
import api from '@/api/client'

interface CashCollection {
  id: string
  courier_id: string
  courier_name: string | null
  collected_by_name: string | null
  cash_amount: number
  card_amount: number
  total_amount: number
  full_containers_returned: number
  empty_containers_returned: number
  orders_completed: number
  note: string | null
  collection_date: string
}

interface CashSummary {
  total_cash: number
  total_card: number
  total_all: number
  collection_count: number
  total_orders: number
}

function formatMoney(sum: number) {
  return new Intl.NumberFormat('uz-UZ').format(sum) + ' сум'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function CashRegister() {
  const [collections, setCollections] = useState<CashCollection[]>([])
  const [summary, setSummary] = useState<CashSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    loadData()
  }, [startDate, endDate])

  const loadData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)

      const [collectionsRes, summaryRes] = await Promise.all([
        api.get(`/cash-register/collections?${params.toString()}`),
        api.get(`/cash-register/collections/summary?${params.toString()}`)
      ])

      setCollections(collectionsRes.data)
      setSummary(summaryRes.data)
    } catch (error) {
      console.error('Failed to load cash register data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !summary) {
    return <div className="p-6">Загрузка...</div>
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">💰 Касса - Сборы от курьеров</h1>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div>
            <label className="block text-sm mb-1">С даты:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">По дату:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setStartDate('')
                setEndDate('')
              }}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Сбросить
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Наличные</div>
              <div className="text-2xl font-bold text-green-700">
                {formatMoney(summary.total_cash)}
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Карта</div>
              <div className="text-2xl font-bold text-blue-700">
                {formatMoney(summary.total_card)}
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Всего собрано</div>
              <div className="text-2xl font-bold text-yellow-700">
                {formatMoney(summary.total_all)}
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Закрытий смен</div>
              <div className="text-2xl font-bold text-gray-700">
                {summary.collection_count}
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Заказов выполнено</div>
              <div className="text-2xl font-bold text-gray-700">
                {summary.total_orders}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Collections Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Дата/Время
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Курьер
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Наличные
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Карта
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Всего
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Заказов
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Тара
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Заметка
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {collections.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Нет данных
                </td>
              </tr>
            ) : (
              collections.map((collection) => (
                <tr key={collection.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    {formatDate(collection.collection_date)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">
                    {collection.courier_name || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {formatMoney(collection.cash_amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {formatMoney(collection.card_amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    {formatMoney(collection.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {collection.orders_completed}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <div className="text-xs space-y-0.5">
                      <div className="text-gray-700 dark:text-gray-300">To'la: {collection.full_containers_returned}</div>
                      <div className="text-gray-500">Bo'sh: {collection.empty_containers_returned}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {collection.note || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
