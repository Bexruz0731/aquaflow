import { useState, useEffect } from 'react'
import { Package, TrendingUp, TrendingDown, AlertTriangle, X, History } from 'lucide-react'
import api from '@/api/client'
import { formatDateTime } from '@/utils/format'
import { useToastStore } from '@/store/toast'
import { useAuthStore } from '@/store/auth'

interface StockItem {
  item_id: string
  product_id: string | null
  name: string
  unit: string
  quantity: number
  empty_quantity: number
  client_containers: number
  with_couriers: number
  total: number
  low_threshold: number
  out_threshold: number
  status: 'ok' | 'low' | 'out'
  is_container: boolean
  is_returnable: boolean
}

interface WarehousTx {
  id: string
  transaction_type: 'kirim' | 'chiqim'
  quantity: number
  note: string | null
  created_at: string
}

type FormType = 'kirim' | 'chiqim'

export default function Warehouse() {
  const toast = useToastStore()
  const { user } = useAuthStore()
  const isAgent = user?.role === 'agent'
  const [stock, setStock] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [history, setHistory] = useState<WarehousTx[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [formType, setFormType] = useState<FormType | null>(null)
  const [formItem, setFormItem] = useState<StockItem | null>(null)
  const [formQty, setFormQty] = useState('')
  const [formNote, setFormNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [emptyContainerForm, setEmptyContainerForm] = useState<StockItem | null>(null)
  const [emptyQty, setEmptyQty] = useState('')
  const [emptyType, setEmptyType] = useState<FormType>('kirim')

  const fetchStock = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/warehouse/stock')
      setStock(data)
    } catch {
      toast.error('Omborni yuklashda xatolik')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async (itemId: string) => {
    setHistoryLoading(true)
    try {
      const { data } = await api.get('/warehouse/transactions', { params: { item_id: itemId, per_page: 30 } })
      setHistory(data.items ?? data)
    } catch {
      toast.error('Tarix yuklanmadi')
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => { fetchStock() }, [])

  const openHistory = (item: StockItem) => {
    setSelectedItem(item)
    fetchHistory(item.item_id)
  }

  const openForm = (type: FormType, item: StockItem) => {
    setFormType(type)
    setFormItem(item)
    setFormQty('')
    setFormNote('')
  }

  const submitForm = async () => {
    if (!formItem || !formType) return
    const qty = parseInt(formQty)
    if (!qty || qty <= 0) { toast.error('Miqdorni kiriting'); return }

    // Agar bu returnable product va Kirim (производство), проверяем наличие пустой тары
    if (formType === 'kirim' && formItem.is_returnable && formItem.empty_quantity < qty) {
      toast.error(`Yetarli bo'sh tara yo'q! Mavjud: ${formItem.empty_quantity} ta, kerak: ${qty} ta`)
      return
    }

    setSaving(true)
    try {
      await api.post('/warehouse/transactions', {
        item_id: formItem.item_id,
        transaction_type: formType,
        quantity: qty,
        note: formNote || undefined,
      })
      toast.success(formType === 'kirim' ? 'Kirim amalga oshirildi' : 'Chiqim amalga oshirildi')
      setFormType(null)
      setFormItem(null)
      fetchStock()
      if (selectedItem?.item_id === formItem.item_id) fetchHistory(formItem.item_id)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const submitEmptyContainer = async () => {
    if (!emptyContainerForm || !emptyContainerForm.product_id) return
    const qty = parseInt(emptyQty)
    if (!qty || qty <= 0) { toast.error('Miqdorni kiriting'); return }
    setSaving(true)
    try {
      await api.post('/warehouse/empty-containers', {
        product_id: emptyContainerForm.product_id,
        quantity: qty,
        transaction_type: emptyType,
      })
      toast.success(emptyType === 'kirim' ? "Bo'sh tara qo'shildi" : "Bo'sh tara chiqarildi")
      setEmptyContainerForm(null)
      setEmptyQty('')
      fetchStock()
      if (selectedItem?.item_id === emptyContainerForm.item_id) fetchHistory(emptyContainerForm.item_id)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const getStatusInfo = (item: StockItem) => {
    if (item.status === 'out') return { label: 'Tugagan', className: 'badge-danger' }
    if (item.status === 'low') return { label: 'Kam qoldi', className: 'badge-warning' }
    return { label: 'Yetarli', className: 'badge-success' }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-full">
      {/* Main table */}
      <div className="flex-1 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ombor</h1>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Mahsulot</th>
                  <th className="table-header">Miqdorlar</th>
                  <th className="table-header">Holat</th>
                  <th className="table-header">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <td key={j} className="table-cell">
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : stock.map(item => {
                      const status = getStatusInfo(item)
                      const isSelected = selectedItem?.item_id === item.item_id
                      return (
                        <tr
                          key={item.item_id}
                          onClick={() => openHistory(item)}
                          className={`table-row-hover border-t border-gray-100 dark:border-gray-800 cursor-pointer ${
                            isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                        >
                          <td className="table-cell">
                            <div className="flex items-center gap-2">
                              <Package size={15} className="text-gray-400" />
                              <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                            </div>
                          </td>
                          <td className="table-cell">
                            {item.is_returnable ? (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="text-xs text-gray-500">Tayyor: <span className={`font-bold ${item.status === 'out' ? 'text-red-500' : item.status === 'low' ? 'text-yellow-500' : 'text-gray-900 dark:text-white'}`}>{item.quantity}</span></span>
                                <span className="text-xs text-gray-500 flex items-center gap-1">Bo'sh: <span className="font-bold text-gray-900 dark:text-white">{item.empty_quantity}</span>
                                  {!isAgent && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEmptyContainerForm(item); setEmptyType('kirim'); setEmptyQty(''); }}
                                      className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center hover:bg-blue-700 leading-none"
                                      title="Tara qo'shish"
                                    >+</button>
                                  )}
                                </span>
                                {item.client_containers > 0 && (
                                  <span className="text-xs text-gray-500">Mijozda: <span className="font-bold text-green-600">{item.client_containers}</span></span>
                                )}
                                {item.with_couriers > 0 && (
                                  <span className="text-xs text-gray-500">Kuryer: <span className="font-bold text-orange-500">{item.with_couriers}</span></span>
                                )}
                                <span className="text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">Jami: {item.total}</span>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="text-xs text-gray-500">Ombor: <span className={`font-bold ${item.status === 'out' ? 'text-red-500' : item.status === 'low' ? 'text-yellow-500' : 'text-gray-900 dark:text-white'}`}>{item.quantity}</span>
                                  {item.status === 'low' && <AlertTriangle size={12} className="inline ml-1 text-yellow-500" />}
                                </span>
                                {item.with_couriers > 0 && (
                                  <span className="text-xs text-gray-500">Kuryer: <span className="font-bold text-orange-500">{item.with_couriers}</span></span>
                                )}
                                <span className="text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">Jami: {item.total}</span>
                              </div>
                            )}
                          </td>
                          <td className="table-cell">
                            <span className={`badge ${status.className}`}>{status.label}</span>
                          </td>
                          {!isAgent && (
                            <td className="table-cell" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => openForm('kirim', item)}
                                  className="btn btn-success text-xs py-1 px-2 flex items-center gap-1"
                                >
                                  <TrendingUp size={12} /> Kirim
                                </button>
                                <button
                                  onClick={() => openForm('chiqim', item)}
                                  className="btn btn-danger text-xs py-1 px-2 flex items-center gap-1"
                                >
                                  <TrendingDown size={12} /> Chiqim
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                {!loading && stock.length === 0 && (
                  <tr>
                    <td colSpan={4} className="table-cell text-center text-gray-400 py-8">
                      Mahsulotlar yo'q
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Side panel: transaction history */}
      {selectedItem && (
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <History size={15} className="text-blue-500" />
                Harakatlar tarixi
              </h3>
              <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">{selectedItem.name}</p>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {historyLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
                  ))
                : history.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-4">Tarix yo'q</p>
                  : history.map(tx => (
                      <div key={tx.id} className="flex items-start justify-between p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div>
                          <div className="flex items-center gap-1.5">
                            {tx.transaction_type === 'kirim'
                              ? <TrendingUp size={13} className="text-green-500" />
                              : <TrendingDown size={13} className="text-red-500" />}
                            <span className={`text-sm font-semibold ${tx.transaction_type === 'kirim' ? 'text-green-600' : 'text-red-500'}`}>
                              {tx.transaction_type === 'kirim' ? '+' : '−'}{tx.quantity}
                            </span>
                            <span className="text-xs text-gray-400">{tx.transaction_type}</span>
                          </div>
                          {tx.note && <p className="text-xs text-gray-400 mt-0.5">{tx.note}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">{formatDateTime(tx.created_at)}</p>
                        </div>
                      </div>
                    ))}
            </div>
          </div>
        </div>
      )}

      {/* Kirim / Chiqim Modal */}
      {formType && formItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {formType === 'kirim'
                  ? <><TrendingUp size={18} className="text-green-500" /> Kirim</>
                  : <><TrendingDown size={18} className="text-red-500" /> Chiqim</>}
              </h2>
              <button onClick={() => setFormType(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                <p className="text-xs text-gray-500">Mahsulot</p>
                <p className="font-semibold text-gray-900 dark:text-white">{formItem.name}</p>
                <p className="text-xs text-gray-400 mt-1">Joriy qoldiq: <b>{formItem.quantity}</b> {formItem.unit}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Miqdor *</label>
                <input
                  className="input w-full"
                  type="number"
                  value={formQty}
                  onChange={e => setFormQty(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Izoh</label>
                <input className="input w-full" value={formNote} onChange={e => setFormNote(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setFormType(null)} className="btn btn-secondary flex-1">Bekor</button>
                <button
                  onClick={submitForm}
                  disabled={saving}
                  className={`btn flex-1 ${formType === 'kirim' ? 'btn-success' : 'btn-danger'}`}
                >
                  {saving ? 'Saqlanmoqda...' : 'Tasdiqlash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty Container Modal */}
      {emptyContainerForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Bo'sh tara boshqaruvi
              </h2>
              <button onClick={() => setEmptyContainerForm(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-gray-500">Mahsulot</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{emptyContainerForm.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Hozirgi bo'sh tara</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{emptyContainerForm.empty_quantity} ta</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tur</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEmptyType('kirim')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium ${emptyType === 'kirim' ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  >
                    Kirim (+)
                  </button>
                  <button
                    onClick={() => setEmptyType('chiqim')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium ${emptyType === 'chiqim' ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  >
                    Chiqim (−)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Miqdor</label>
                <input
                  type="number"
                  min="1"
                  className="input w-full"
                  value={emptyQty}
                  onChange={e => setEmptyQty(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEmptyContainerForm(null)} className="btn btn-secondary flex-1">Bekor</button>
                <button
                  onClick={submitEmptyContainer}
                  disabled={saving}
                  className={`btn flex-1 ${emptyType === 'kirim' ? 'btn-success' : 'btn-danger'}`}
                >
                  {saving ? 'Saqlanmoqda...' : 'Tasdiqlash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
