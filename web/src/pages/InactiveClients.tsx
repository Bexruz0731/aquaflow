import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Search, ChevronLeft, ChevronRight, MapPin, Clock, Edit2, Check, X } from 'lucide-react'
import api from '@/api/client'
import { formatPhone, formatDateTime, getInitials, getAvatarColor } from '@/utils/format'
import { useToastStore } from '@/store/toast'

interface Group {
  id: string
  name: string
  sort_order: number
  inactive_threshold_days: number
  client_count: number
}

interface InactiveClient {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  container_balance: number
  debt_amount: number
  last_order_at: string | null
  orders_count: number
  address: string | null
  address_label: string | null
}

interface NeverOrderedClient {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  debt_amount: number
  address: string | null
  registered_at: string | null
}

interface Meta { total: number; page: number; pages: number; per_page: number }

const UNGROUPED_TAB = '__ungrouped__'
const NEVER_ORDERED_TAB = '__never_ordered__'

export default function InactiveClients() {
  const navigate = useNavigate()
  const toast = useToastStore()

  const [groups, setGroups] = useState<Group[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clients, setClients] = useState<InactiveClient[]>([])
  const [neverOrdered, setNeverOrdered] = useState<NeverOrderedClient[]>([])
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, pages: 1, per_page: 25 })
  const [loading, setLoading] = useState(false)
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [editingThreshold, setEditingThreshold] = useState(false)
  const [thresholdInput, setThresholdInput] = useState('')
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    api.get('/client-groups/')
      .then(({ data }) => {
        const list: Group[] = data.groups || []
        setGroups(list)
        if (list.length > 0) setSelectedId(list[0].id)
        else setSelectedId(NEVER_ORDERED_TAB)
      })
      .catch(() => toast.error('Guruhlarni yuklashda xatolik'))
      .finally(() => setLoadingGroups(false))
  }, [])

  const selectedGroup = selectedId && selectedId !== UNGROUPED_TAB && selectedId !== NEVER_ORDERED_TAB
    ? groups.find(g => g.id === selectedId)
    : null

  const selectedThreshold = selectedId === UNGROUPED_TAB
    ? 30
    : selectedGroup?.inactive_threshold_days ?? 30

  useEffect(() => {
    if (!selectedId) return

    if (selectedId === NEVER_ORDERED_TAB) {
      setLoading(true)
      const params: Record<string, string | number> = { page, per_page: 25 }
      if (search) params.search = search
      api.get('/reports/never-ordered', { params })
        .then(({ data }) => {
          setNeverOrdered(data.items ?? [])
          setMeta({ total: data.total, page: data.page, pages: data.pages, per_page: data.per_page })
        })
        .catch(() => toast.error("Ma'lumotlarni yuklashda xatolik"))
        .finally(() => setLoading(false))
      return
    }

    setLoading(true)
    const params: Record<string, string | number> = { page, per_page: 25 }
    if (selectedId !== UNGROUPED_TAB) params.group_id = selectedId
    if (search) params.search = search
    api.get('/reports/inactive-by-group', { params })
      .then(({ data }) => {
        setClients(data.items ?? [])
        setMeta({ total: data.total, page: data.page, pages: data.pages, per_page: data.per_page })
      })
      .catch(() => toast.error("Ma'lumotlarni yuklashda xatolik"))
      .finally(() => setLoading(false))
  }, [selectedId, search, page, refreshKey])

  const handleTabChange = (id: string) => {
    setSelectedId(id); setPage(1); setSearch(''); setEditingThreshold(false)
  }

  const startEditThreshold = () => {
    setThresholdInput(String(selectedThreshold))
    setEditingThreshold(true)
  }

  const saveThreshold = async () => {
    const days = parseInt(thresholdInput)
    if (!days || days < 1) { toast.error("Muddatni to'g'ri kiriting"); return }
    if (!selectedId || selectedId === NEVER_ORDERED_TAB) return
    setSavingThreshold(true)
    try {
      if (selectedId === UNGROUPED_TAB) {
        // ungrouped doesn't have a persistent threshold — just refresh locally
        setRefreshKey(k => k + 1)
      } else {
        await api.patch(`/client-groups/${selectedId}/`, { inactive_threshold_days: days })
        setGroups(gs => gs.map(g => g.id === selectedId ? { ...g, inactive_threshold_days: days } : g))
        setRefreshKey(k => k + 1)
      }
      setEditingThreshold(false)
      toast.success('Muddat yangilandi')
    } catch { toast.error('Xatolik') } finally { setSavingThreshold(false) }
  }

  if (loadingGroups) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isGroupTab = selectedId !== NEVER_ORDERED_TAB

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
            <Users size={20} className="text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Noaktiv mijozlar</h1>
            <p className="text-sm text-gray-500">
              {selectedId === NEVER_ORDERED_TAB
                ? 'Hech qachon buyurtma bermaganlar'
                : selectedId === UNGROUPED_TAB
                  ? `Guruхsiz — so'nggi ${selectedThreshold} kunda buyurtma bermagan`
                  : selectedGroup
                    ? `"${selectedGroup.name}" — so'nggi ${selectedGroup.inactive_threshold_days} kunda buyurtma bermagan`
                    : 'Guruh tanlang'}
            </p>
          </div>
        </div>
        {!loading && meta.total > 0 && (
          <span className="badge badge-warning text-sm px-3 py-1.5">{meta.total} ta mijoz</span>
        )}
      </div>

      {/* Group Tabs */}
      <div className="flex gap-2 flex-wrap">
        {groups.map(g => (
          <button
            key={g.id}
            onClick={() => handleTabChange(g.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              selectedId === g.id
                ? 'bg-[#0f0f23] text-white border-[#0f0f23]'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
            }`}
          >
            {g.name}
            <span className={`ml-1.5 text-xs ${selectedId === g.id ? 'opacity-60' : 'text-gray-400'}`}>
              {g.inactive_threshold_days}k
            </span>
          </button>
        ))}
        {/* Ungrouped tab */}
        <button
          onClick={() => handleTabChange(UNGROUPED_TAB)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            selectedId === UNGROUPED_TAB
              ? 'bg-[#0f0f23] text-white border-[#0f0f23]'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
          }`}
        >
          Guruхsiz
        </button>
        {/* Separator + special tab */}
        <div className="w-px bg-gray-200 dark:bg-gray-700 mx-1 self-stretch" />
        <button
          onClick={() => handleTabChange(NEVER_ORDERED_TAB)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            selectedId === NEVER_ORDERED_TAB
              ? 'bg-orange-500 text-white border-orange-500'
              : 'bg-white dark:bg-gray-800 text-orange-500 border-orange-200 dark:border-orange-800 hover:border-orange-400'
          }`}
        >
          Mahsulot sotib olmaganlar
        </button>
      </div>

      {/* Threshold editor — shown for all group tabs except "never-ordered" */}
      {isGroupTab && selectedId !== UNGROUPED_TAB && (
        <div className="flex items-center gap-2 text-sm">
          <Clock size={14} className="text-gray-400" />
          <span className="text-gray-500">Faolsizlik muddati:</span>
          {editingThreshold ? (
            <>
              <input
                type="number" min={1} value={thresholdInput}
                onChange={e => setThresholdInput(e.target.value)}
                className="input w-20 py-1 px-2 text-sm" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveThreshold(); if (e.key === 'Escape') setEditingThreshold(false) }}
              />
              <span className="text-gray-400">kun</span>
              <button onClick={saveThreshold} disabled={savingThreshold}
                className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50">
                <Check size={14} />
              </button>
              <button onClick={() => setEditingThreshold(false)}
                className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <span className="font-semibold text-gray-800 dark:text-white">
                {selectedGroup?.inactive_threshold_days ?? 30} kun
              </span>
              <button onClick={startEditThreshold}
                className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="O'zgartirish">
                <Edit2 size={13} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-9 w-full" placeholder="Ism, telefon..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {selectedId === NEVER_ORDERED_TAB ? (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">Mijoz</th>
                  <th className="table-header">Telefon</th>
                  <th className="table-header">Manzil</th>
                  <th className="table-header">Ro'yxatdan o'tgan</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="table-cell"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  : neverOrdered.map((c, idx) => {
                      const displayLabel = c.address || c.phone
                      return (
                        <tr key={c.id} className="table-row-hover border-t border-gray-100 dark:border-gray-800 cursor-pointer"
                          onClick={() => navigate(`/clients/${c.id}`)}>
                          <td className="table-cell text-gray-400">{(page - 1) * 25 + idx + 1}</td>
                          <td className="table-cell">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${getAvatarColor(displayLabel)}`}>
                                {getInitials(displayLabel)}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-white">{displayLabel}</span>
                            </div>
                          </td>
                          <td className="table-cell text-gray-600 dark:text-gray-400">{formatPhone(c.phone)}</td>
                          <td className="table-cell text-xs text-gray-500 max-w-[180px]">
                            {c.address
                              ? <div className="flex items-start gap-1">
                                  <MapPin size={10} className="mt-0.5 shrink-0 text-gray-400" />
                                  <span className="truncate">{c.address}</span>
                                </div>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="table-cell text-xs text-gray-500">
                            {c.registered_at ? formatDateTime(c.registered_at) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                {!loading && neverOrdered.length === 0 && (
                  <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">
                    Hech qachon buyurtma bermaganlar yo'q 🎉
                  </td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">Mijoz</th>
                  <th className="table-header">Telefon</th>
                  <th className="table-header">Manzil</th>
                  <th className="table-header">Buyurtmalar</th>
                  <th className="table-header">Oxirgi buyurtma</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="table-cell"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  : clients.map((c, idx) => {
                      const displayLabel = c.address || c.phone
                      return (
                        <tr key={c.id} className="table-row-hover border-t border-gray-100 dark:border-gray-800 cursor-pointer"
                          onClick={() => navigate(`/clients/${c.id}`)}>
                          <td className="table-cell text-gray-400">{(page - 1) * 25 + idx + 1}</td>
                          <td className="table-cell">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${getAvatarColor(displayLabel)}`}>
                                {getInitials(displayLabel)}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-white">{displayLabel}</span>
                            </div>
                          </td>
                          <td className="table-cell text-gray-600 dark:text-gray-400">{formatPhone(c.phone)}</td>
                          <td className="table-cell text-xs text-gray-500 max-w-[180px]">
                            {c.address
                              ? <div className="flex items-start gap-1">
                                  <MapPin size={10} className="mt-0.5 shrink-0 text-gray-400" />
                                  <span className="truncate">{c.address_label ? `${c.address_label}: ` : ''}{c.address}</span>
                                </div>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="table-cell text-gray-600 dark:text-gray-400">{c.orders_count}</td>
                          <td className="table-cell text-xs font-medium">
                            {c.last_order_at
                              ? <span className="text-orange-500">{formatDateTime(c.last_order_at)}</span>
                              : <span className="text-gray-400">Hech qachon</span>}
                          </td>
                        </tr>
                      )
                    })}
                {!loading && clients.length === 0 && (
                  <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">
                    {selectedId === UNGROUPED_TAB
                      ? 'Guruхsiz noaktiv mijozlar yo\'q 🎉'
                      : selectedGroup ? `"${selectedGroup.name}" guruhida noaktiv mijozlar yo'q 🎉` : ''}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {meta.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-sm text-gray-500">Jami: {meta.total} ta</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <span className="text-sm px-2">{page} / {meta.pages}</span>
              <button onClick={() => setPage(p => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
