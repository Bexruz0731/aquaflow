import { useState, useEffect, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Plus, Edit2, X, Package, Tag, Trash2, EyeOff, ImagePlus, Loader2, TrendingUp, TrendingDown, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import api from '@/api/client'
import { formatMoney } from '@/utils/format'
import { useToastStore } from '@/store/toast'
import { useAuthStore } from '@/store/auth'

interface Category { id: string; name: string }
interface Product {
  id: string
  name: string
  category_id: string | null
  volume: number | null
  price: number
  is_returnable_container: boolean
  is_active: boolean
  show_to_clients: boolean
  image_url: string | null
  inactive_threshold_days: number
}

interface StockItem {
  item_id: string
  product_id: string | null
  name: string
  quantity: number
  status: 'ok' | 'low' | 'out'
  empty_quantity?: number
}

interface ProductForm {
  name: string; category_id: string; volume: string
  price: string; is_returnable_container: boolean; is_active: boolean
  show_to_clients: boolean; image_url: string; inactive_threshold_days: string
}

function ProductsList() {
  const toast = useToastStore()
  const { user } = useAuthStore()
  const isAgent = user?.role === 'agent'
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stock, setStock] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>({ name: '', category_id: '', volume: '', price: '', is_returnable_container: false, is_active: true, show_to_clients: true, image_url: '', inactive_threshold_days: '30' })
  const [saving, setSaving] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const [showCatForm, setShowCatForm] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [savingCat, setSavingCat] = useState(false)

  // Stock modal
  const [stockModal, setStockModal] = useState<{ product: Product; type: 'kirim' | 'chiqim' } | null>(null)
  const [stockQty, setStockQty] = useState('')
  const [stockNote, setStockNote] = useState('')
  const [savingStock, setSavingStock] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [pRes, cRes, sRes] = await Promise.all([
        api.get('/products/'),
        api.get('/products/categories'),
        api.get('/warehouse/stock').catch(() => ({ data: [] })),
      ])
      setProducts(Array.isArray(pRes.data) ? pRes.data : (pRes.data.items || []))
      setCategories(Array.isArray(cRes.data) ? cRes.data : (cRes.data.items || []))
      setStock(sRes.data)
    } catch {
      toast.error('Mahsulotlarni yuklashda xatolik')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const stockByProduct = (productId: string): StockItem | undefined =>
    stock.find(s => s.product_id === productId)

  const set = (k: keyof ProductForm, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => {
    setEditTarget(null)
    setForm({ name: '', category_id: categories[0]?.id ?? '', volume: '', price: '', is_returnable_container: false, is_active: true, show_to_clients: true, image_url: '', inactive_threshold_days: '30' })
    setShowForm(true)
  }

  const openEdit = (p: Product) => {
    setEditTarget(p)
    setForm({ name: p.name, category_id: p.category_id ?? '', volume: p.volume ? String(p.volume) : '', price: String(p.price), is_returnable_container: p.is_returnable_container, is_active: p.is_active, show_to_clients: p.show_to_clients ?? true, image_url: p.image_url ?? '', inactive_threshold_days: String(p.inactive_threshold_days ?? 30) })
    setShowForm(true)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    try {
      // Оптимизируем изображение перед загрузкой
      const optimizedFile = await optimizeImage(file)
      const fd = new FormData()
      fd.append('file', optimizedFile)
      const { data } = await api.post('/products/upload-image/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      set('image_url', data.url)
      toast.success('Rasm yuklandi')
    } catch { toast.error('Rasmni yuklashda xatolik') } finally { setUploadingImg(false) }
  }

  // Функция для оптимизации изображения с сохранением качества
  const optimizeImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(file)
            return
          }

          // Максимальная ширина/высота - 1200px (хорошее качество для веб)
          const MAX_SIZE = 1200
          let width = img.width
          let height = img.height

          // Вычисляем новые размеры с сохранением пропорций
          if (width > height && width > MAX_SIZE) {
            height = (height / width) * MAX_SIZE
            width = MAX_SIZE
          } else if (height > MAX_SIZE) {
            width = (width / height) * MAX_SIZE
            height = MAX_SIZE
          }

          canvas.width = width
          canvas.height = height

          // Используем высококачественный алгоритм масштабирования
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, width, height)

          // Конвертируем в PNG для сохранения качества (без потерь)
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const optimizedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.png'), {
                  type: 'image/png',
                  lastModified: Date.now(),
                })
                resolve(optimizedFile)
              } else {
                resolve(file)
              }
            },
            'image/png' // PNG = без потерь качества
          )
        }
        img.onerror = () => resolve(file)
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('Ошибка чтения файла'))
      reader.readAsDataURL(file)
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.price) return
    setSaving(true)
    try {
      const payload = { name: form.name, category_id: form.category_id || null, volume: form.volume ? parseInt(form.volume) : null, price: parseInt(form.price), is_returnable_container: form.is_returnable_container, is_active: form.is_active, show_to_clients: form.show_to_clients, image_url: form.image_url || null, inactive_threshold_days: parseInt(form.inactive_threshold_days) || 30 }
      if (editTarget) { await api.patch(`/products/${editTarget.id}/`, payload); toast.success('Yangilandi') }
      else { await api.post('/products/', payload); toast.success('Qo\'shildi') }
      setShowForm(false); fetchAll()
    } catch { toast.error('Xatolik') } finally { setSaving(false) }
  }

  const toggleActive = async (p: Product) => {
    try {
      await api.patch(`/products/${p.id}/`, { is_active: !p.is_active })
      toast.success(p.is_active ? 'Mahsulot nofaol qilindi' : 'Mahsulot faollashtirildi')
      fetchAll()
    } catch { toast.error('Xatolik') }
  }

  const deleteProduct = async (p: Product) => {
    if (!confirm(`"${p.name}" mahsulotini o'chirishni tasdiqlaysizmi?`)) return
    try {
      await api.delete(`/products/${p.id}/`)
      toast.success('Mahsulot o\'chirildi')
      fetchAll()
    } catch { toast.error('O\'chirishda xatolik') }
  }

  const deleteCategory = async (cat: Category) => {
    if (!confirm(`"${cat.name}" kategoriyasini o'chirishni tasdiqlaysizmi?`)) return
    try {
      await api.delete(`/products/categories/${cat.id}`)
      toast.success('Kategoriya o\'chirildi')
      fetchAll()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'O\'chirishda xatolik')
    }
  }

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCat.trim()) return
    setSavingCat(true)
    try {
      await api.post('/products/categories', { name: newCat })
      toast.success('Kategoriya qo\'shildi')
      setNewCat(''); setShowCatForm(false); fetchAll()
    } catch { toast.error('Xatolik') } finally { setSavingCat(false) }
  }

  const openStockModal = (product: Product, type: 'kirim' | 'chiqim') => {
    setStockModal({ product, type })
    setStockQty('')
    setStockNote('')
  }

  const submitStock = async () => {
    if (!stockModal) return
    const qty = parseInt(stockQty)
    if (!qty || qty <= 0) { toast.error('Miqdorni kiriting'); return }
    setSavingStock(true)
    try {
      await api.post('/warehouse/transactions/by-product', {
        product_id: stockModal.product.id,
        quantity: qty,
        transaction_type: stockModal.type,
        note: stockNote || undefined,
      })
      toast.success(stockModal.type === 'kirim' ? `+${qty} ta qo'shildi` : `-${qty} ta chiqarildi`)
      setStockModal(null)
      fetchAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Xatolik')
    } finally { setSavingStock(false) }
  }

  const categoryMap: Record<string, string> = {}
  for (const c of categories) { categoryMap[c.id] = c.name }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mahsulotlar</h1>
        {!isAgent && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCatForm(true)} className="btn btn-secondary flex items-center gap-1.5">
              <Tag size={15} /> Kategoriya
            </button>
            <button onClick={openNew} className="btn btn-primary flex items-center gap-1.5">
              <Plus size={15} /> Yangi mahsulot
            </button>
          </div>
        )}
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {categories.map(c => (
            <span key={c.id} className="badge badge-info flex items-center gap-1">
              {c.name}
              {!isAgent && (
                <button
                  onClick={() => deleteCategory(c)}
                  className="ml-0.5 hover:text-red-500 transition-colors"
                  title="O'chirish"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="aspect-square bg-gray-200 dark:bg-gray-700 rounded-xl mb-3" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
            </div>
          ))
          : products.map(p => {
            const s = stockByProduct(p.id)
            return (
              <div key={p.id} className="card hover:shadow-lg transition-shadow duration-200">
                {/* Изображение товара */}
                <div className="aspect-square rounded-xl overflow-hidden mb-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="w-full h-full object-contain" />
                    : <Package size={48} className="text-gray-300 dark:text-gray-600" />}
                </div>

                {/* Информация о товаре */}
                <div className="space-y-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-1">{p.name}</h3>
                    {p.category_id && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                        {categoryMap[p.category_id]}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Hajm:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{p.volume ? `${p.volume} L` : '—'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Narxi:</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatMoney(p.price)}</span>
                  </div>

                  {p.is_returnable_container && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">
                      <Package size={12} />
                      <span>Qaytariladigan tara</span>
                    </div>
                  )}
                  {!p.show_to_clients && (
                    <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded-lg">
                      <EyeOff size={12} />
                      <span>Ichki tovar</span>
                    </div>
                  )}

                  {/* Остатки на складе */}
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">Omborda:</span>
                      <span className={`text-sm font-semibold ${s && s.quantity > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {s ? `${s.quantity} ta` : '0 ta'}
                      </span>
                    </div>
                    {p.is_returnable_container && s && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Bo'sh:</span>
                        <span className="text-sm font-semibold text-gray-600">{s.empty_quantity || 0} ta</span>
                      </div>
                    )}
                  </div>

                  {/* Действия */}
                  {!isAgent && (
                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => openStockModal(p, 'kirim')}
                        className="flex-1 px-3 py-2 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                      >
                        <ArrowDownCircle size={14} className="inline mr-1" />
                        Kirim
                      </button>
                      <button
                        onClick={() => openStockModal(p, 'chiqim')}
                        className="flex-1 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <ArrowUpCircle size={14} className="inline mr-1" />
                        Chiqim
                      </button>
                    </div>
                  )}

                  {/* Статус и редактирование */}
                  {!isAgent && (
                    <div className="pt-2 flex items-center justify-between border-t border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={p.is_active}
                            onChange={() => toggleActive(p)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                        </label>
                        <span className="text-xs text-gray-500">{p.is_active ? 'Aktiv' : 'Nofaol'}</span>
                      </div>
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => deleteProduct(p)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        }
      </div>

      {/* Сообщение если нет товаров */}
      {!loading && products.length === 0 && (
        <div className="card text-center py-12">
          <Package size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">Mahsulotlar yo'q</p>
        </div>
      )}

      {/* Stock kirim/chiqim modal */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {stockModal.type === 'kirim'
                  ? <><TrendingUp size={18} className="text-green-500" /> Kirim</>
                  : <><TrendingDown size={18} className="text-red-500" /> Chiqim</>}
              </h2>
              <button onClick={() => setStockModal(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  {stockModal.product.image_url
                    ? <img src={stockModal.product.image_url} className="w-10 h-10 rounded-lg object-cover" />
                    : <span className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center"><Package size={16} className="text-gray-400" /></span>}
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{stockModal.product.name}</p>
                    <p className="text-xs text-gray-400">
                      Joriy zaxira: <b>{stockByProduct(stockModal.product.id)?.quantity ?? 0}</b> ta
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Miqdor (ta) *</label>
                <input
                  className="input w-full"
                  type="number"
                  min="1"
                  value={stockQty}
                  onChange={e => setStockQty(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Izoh</label>
                <input className="input w-full" value={stockNote} onChange={e => setStockNote(e.target.value)} placeholder="Ixtiyoriy..." />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStockModal(null)} className="btn btn-secondary flex-1">Bekor</button>
                <button
                  onClick={submitStock}
                  disabled={savingStock}
                  className={`btn flex-1 ${stockModal.type === 'kirim' ? 'btn-success' : 'btn-danger'}`}
                >
                  {savingStock ? 'Saqlanmoqda...' : 'Tasdiqlash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editTarget ? 'Tahrirlash' : 'Yangi mahsulot'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Rasm</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden shrink-0 bg-gray-50 dark:bg-gray-700">
                    {form.image_url
                      ? <img src={form.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                      : <Package size={22} className="text-gray-300" />}
                  </div>
                  <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <button type="button" onClick={() => imgInputRef.current?.click()} disabled={uploadingImg}
                    className="btn btn-secondary flex items-center gap-1.5 text-xs">
                    {uploadingImg ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                    {uploadingImg ? 'Yuklanmoqda...' : 'Rasm yuklash'}
                  </button>
                  {form.image_url && (
                    <button type="button" onClick={() => set('image_url', '')} className="text-red-400 hover:text-red-600 text-xs">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nomi *</label>
                <input className="input w-full" value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Kategoriya</label>
                  <select className="input w-full" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                    <option value="">—</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Hajm (L)</label>
                  <input className="input w-full" type="number" step="1" value={form.volume} onChange={e => set('volume', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Narx (so'm) *</label>
                <input className="input w-full" type="number" value={form.price} onChange={e => set('price', e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Noaktivlik muddati (kun)</label>
                <input className="input w-full" type="number" min={1} value={form.inactive_threshold_days}
                  onChange={e => set('inactive_threshold_days', e.target.value)}
                  placeholder="30" />
                <p className="text-xs text-gray-400 mt-1">Mijoz bu mahsulotni necha kun buyurtma bermasa noaktiv hisoblanadi</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_returnable_container} onChange={e => set('is_returnable_container', e.target.checked)} className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Qaytariladigan tara</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Faol</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.show_to_clients} onChange={e => set('show_to_clients', e.target.checked)} className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Mijozlarga ko'rsatish</span>
                </label>
              </div>
              {!form.show_to_clients && (
                <p className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-lg">
                  Bu tovar mijozlar katalogida ko'rsatilmaydi. Faqat ichki hisobda (naklеykalar, qopqoqlar va boshqa sarflanuvchi materiallar uchun).
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary flex-1">Bekor</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Saqlanmoqda...' : 'Saqlash'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category form modal */}
      {showCatForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Yangi kategoriya</h2>
              <button onClick={() => setShowCatForm(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X size={18} /></button>
            </div>
            <form onSubmit={addCategory} className="p-5 space-y-4">
              <input className="input w-full" value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Kategoriya nomi" required />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowCatForm(false)} className="btn btn-secondary flex-1">Bekor</button>
                <button type="submit" disabled={savingCat} className="btn btn-primary flex-1">{savingCat ? '...' : 'Saqlash'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Products() {
  return (
    <Routes>
      <Route index element={<ProductsList />} />
    </Routes>
  )
}
