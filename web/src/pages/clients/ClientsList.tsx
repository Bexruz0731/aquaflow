import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Users, UserCheck, TrendingUp, UserX, Clock,
  Search, Plus, Upload, Download,
  ChevronLeft, ChevronRight, Eye, Ban, CheckCircle,
  MoreVertical, Trash2, Pencil, X, Check, FolderInput, ChevronRight as ChevronRightIcon,
} from 'lucide-react'
import api from '@/api/client'
import { formatPhone, formatMoney, formatDate, getInitials, getAvatarColor, clientDisplay } from '@/utils/format'
import { useToastStore } from '@/store/toast'
import { useAuthStore } from '@/store/auth'
import ClientImportModal from './ClientImportModal'
import NewClientModal from './NewClientModal'
import * as XLSX from 'xlsx'

interface ClientAddr { id: string; label: string; address_text: string; is_primary: boolean }
interface Client {
  id: string
  first_name: string
  last_name: string | null
  display_name?: string | null
  phone: string
  company_name?: string | null
  debt_amount: number
  advance_amount: number
  container_balance: number
  is_active: boolean
  is_blocked: boolean
  created_at: string
  orders_count?: number
  last_order_at?: string | null
  addresses?: ClientAddr[]
  group_id?: string | null
}

interface Meta { total: number; page: number; pages: number; per_page: number }

interface ClientGroup {
  id: string
  name: string
  sort_order: number
  client_count: number
}

export default function ClientsList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToastStore()
  const { user } = useAuthStore()
  const canDelete = user?.role !== 'operator' && user?.role !== 'agent'
  const isBoshliq = user?.role === 'boshliq' || user?.role === 'super_admin'

  // URL-derived state — survives navigate(-1) automatically
  const search = searchParams.get('q') ?? ''
  const filterStatus = (searchParams.get('filter') ?? 'all') as 'all' | 'active' | 'blocked' | 'top30'
  const page = Number(searchParams.get('page') ?? '1')
  const perPage = Number(searchParams.get('per') ?? localStorage.getItem('clients_per_page') ?? '25')
  const selectedGroupId: string | null | 'ungrouped' = searchParams.get('group') ?? 'all'

  const updateParams = (updates: Record<string, string | number | null>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, String(v))
      }
      return next
    }, { replace: true })
  }

  const [clients, setClients] = useState<Client[]>([])
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, pages: 1, per_page: 25 })
  const [stats, setStats] = useState({ total: 0, active: 0, blocked: 0, top30: 0, inactive: 0 })
  const [loading, setLoading] = useState(true)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [menuMode, setMenuMode] = useState<'main' | 'move'>('main')
  const [showImport, setShowImport] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Groups
  const [groups, setGroups] = useState<ClientGroup[]>([])
  const [ungroupedCount, setUngroupedCount] = useState(0)
  const selectedGroupIdForNew = selectedGroupId !== 'all' && selectedGroupId !== 'ungrouped' ? selectedGroupId : null
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)
  const newGroupInputRef = useRef<HTMLInputElement>(null)

  const fetchGroups = async () => {
    try {
      const { data } = await api.get('/client-groups/')
      setGroups(data.groups)
      setUngroupedCount(data.ungrouped_count)
    } catch { /* ignore */ }
  }

  const fetchStats = async () => {
    try {
      const [all, active, blocked, top30, inactive] = await Promise.all([
        api.get('/clients/', { params: { page: 1, per_page: 1 } }),
        api.get('/clients/', { params: { page: 1, per_page: 1, is_active: 1 } }),
        api.get('/clients/', { params: { page: 1, per_page: 1, is_blocked: 1 } }),
        api.get('/clients/', { params: { page: 1, per_page: 1, top30: 1 } }),
        api.get('/clients/', { params: { page: 1, per_page: 1, inactive_days: 30 } }),
      ])
      const getTotal = (d: any) => d.data.meta?.total ?? d.data.total ?? 0
      setStats({ total: getTotal(all), active: getTotal(active), blocked: getTotal(blocked), top30: getTotal(top30), inactive: getTotal(inactive) })
    } catch { /* silently ignore */ }
  }

  const fetchClients = async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, per_page: perPage, sort_by: 'address' }
      if (search) params.search = search
      if (filterStatus === 'blocked') params.is_blocked = 1
      if (filterStatus === 'active') params.is_active = 1
      if (filterStatus === 'top30') params.top30 = 1
      if (selectedGroupId && selectedGroupId !== 'all' && selectedGroupId !== 'ungrouped') params.group_id = selectedGroupId
      if (selectedGroupId === 'ungrouped') params.ungrouped = 1
      const { data } = await api.get('/clients/', { params })
      setClients(data.items ?? data)
      if (data.meta) setMeta(data.meta)
      else if (data.total !== undefined) setMeta({ total: data.total, page: data.page, pages: data.pages, per_page: data.per_page ?? 25 })
    } catch {
      toast.error('Mijozlarni yuklashda xatolik')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStats(); fetchGroups() }, [])
  useEffect(() => {
    const timer = setTimeout(() => fetchClients(), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search, filterStatus, page, perPage, selectedGroupId])

  useEffect(() => {
    if (!loading) {
      const savedY = sessionStorage.getItem('clients_scroll_y')
      if (savedY) {
        sessionStorage.removeItem('clients_scroll_y')
        requestAnimationFrame(() => window.scrollTo(0, Number(savedY)))
      }
    }
  }, [loading])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (editingGroupId && editInputRef.current) editInputRef.current.focus()
  }, [editingGroupId])

  useEffect(() => {
    if (showNewGroup && newGroupInputRef.current) newGroupInputRef.current.focus()
  }, [showNewGroup])

  const handleBlock = async (client: Client) => {
    setOpenMenu(null)
    try {
      await api.patch(`/clients/${client.id}`, { is_blocked: !client.is_blocked })
      toast.success(client.is_blocked ? 'Blok olib tashlandi' : 'Mijoz bloklandi')
      fetchClients(); fetchStats()
    } catch {
      toast.error('Amal bajarilmadi')
    }
  }

  const handleDelete = async (client: Client) => {
    setOpenMenu(null)
    const displayLabel = clientDisplay(client)
    if (!confirm(`"${displayLabel}" mijozini o'chirishni tasdiqlaysizmi?\n\nBarcha buyurtmalari saqlanib qoladi. Mijoz qayta ro'yxatdan o'tmaguncha yangi buyurtma ola olmaydi.`)) return
    try {
      await api.delete(`/clients/${client.id}`)
      toast.success('Mijoz o\'chirildi')
      fetchClients(); fetchStats()
    } catch {
      toast.error('O\'chirishda xatolik')
    }
  }

  const handleMoveToGroup = async (clientId: string, targetGroupId: string | null) => {
    setOpenMenu(null)
    setMenuMode('main')
    try {
      await api.patch(`/clients/${clientId}`, { group_id: targetGroupId })
      fetchClients(); fetchGroups()
    } catch {
      toast.error('Ko\'chirishda xatolik')
    }
  }

  const createGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    try {
      await api.post('/client-groups/', { name })
      setNewGroupName('')
      setShowNewGroup(false)
      fetchGroups()
      toast.success('Guruh yaratildi')
    } catch {
      toast.error('Guruh yaratishda xatolik')
    }
  }

  const saveGroupRename = async (groupId: string) => {
    const name = editingGroupName.trim()
    if (!name) { setEditingGroupId(null); return }
    try {
      await api.patch(`/client-groups/${groupId}/`, { name })
      setEditingGroupId(null)
      fetchGroups()
    } catch {
      toast.error('Nomni o\'zgartirishda xatolik')
    }
  }

  const deleteGroup = async (groupId: string) => {
    if (!confirm('Guruhni o\'chirishni tasdiqlaysizmi?')) return
    try {
      await api.delete(`/client-groups/${groupId}/`)
      if (selectedGroupId === groupId) updateParams({ group: null })
      fetchGroups()
      fetchStats()
      toast.success('Guruh o\'chirildi')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'O\'chirishda xatolik')
    }
  }

  const [exporting, setExporting] = useState(false)

  const exportToExcel = useCallback(async () => {
    setExporting(true)
    try {
      const params: Record<string, string | number> = { page: 1, per_page: 5000, sort_by: 'address' }
      if (search) params.search = search
      if (filterStatus === 'blocked') params.is_blocked = 1
      if (filterStatus === 'active') params.is_active = 1
      if (filterStatus === 'top30') params.top30 = 1
      if (selectedGroupId && selectedGroupId !== 'all' && selectedGroupId !== 'ungrouped') params.group_id = selectedGroupId
      if (selectedGroupId === 'ungrouped') params.ungrouped = 1
      const { data } = await api.get('/clients/', { params })
      const items: Client[] = data.items ?? data

      const rows = items.map((c, i) => ({
        '#': i + 1,
        'Manzil': clientDisplay(c),
        'Telefon': c.phone,
        'Buyurtmalar': c.orders_count ?? 0,
        'Qarz (so\'m)': c.debt_amount ?? 0,
        'Tara': c.container_balance ?? 0,
        'Holat': c.is_blocked ? 'Bloklangan' : c.is_active ? 'Faol' : 'Nofaol',
        'Ro\'yxat sanasi': formatDate(c.created_at),
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        { wch: 4 }, { wch: 30 }, { wch: 16 }, { wch: 12 },
        { wch: 14 }, { wch: 6 }, { wch: 12 }, { wch: 14 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Mijozlar')
      const today = new Date().toISOString().slice(0, 10)
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mijozlar_${today}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || String(e)
      toast.error('Eksport xatoligi: ' + msg)
    } finally {
      setExporting(false)
    }
  }, [search, filterStatus, selectedGroupId])

  const FILTER_CARDS = [
    { key: 'all',     label: "Jami mijozlar", value: stats.total,   icon: Users,      color: 'text-blue-500'   },
    { key: 'top30',   label: "Top 30",         value: stats.top30,   icon: TrendingUp, color: 'text-green-500'  },
    { key: 'active',  label: "Faol mijozlar",  value: stats.active,  icon: UserCheck,  color: 'text-purple-500' },
    { key: 'blocked', label: "Bloklangan",     value: stats.blocked, icon: UserX,      color: 'text-red-500'    },
  ] as const

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mijozlar</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="btn btn-secondary flex items-center gap-1.5">
            <Upload size={15} /> Import
          </button>
          <button onClick={() => setShowNew(true)} className="btn btn-primary flex items-center gap-1.5">
            <Plus size={15} /> Yangi mijoz
          </button>
        </div>
      </div>

      {/* Group Tabs */}
      <div className="overflow-x-auto pb-2">
      <div className="flex items-center gap-2 flex-nowrap min-w-max">
        {/* All tab */}
        <button
          onClick={() => updateParams({ group: null, page: null })}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedGroupId === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Barchasi <span className="ml-1 opacity-75">{stats.total}</span>
        </button>

        {/* Named groups */}
        {groups.map(g => (
          <div key={g.id} className="relative group flex items-center">
            {editingGroupId === g.id ? (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700">
                <input
                  ref={editInputRef}
                  value={editingGroupName}
                  onChange={e => setEditingGroupName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveGroupRename(g.id)
                    if (e.key === 'Escape') setEditingGroupId(null)
                  }}
                  className="text-sm bg-transparent outline-none w-28 text-gray-900 dark:text-white"
                />
                <button onClick={() => saveGroupRename(g.id)} className="text-green-600 hover:text-green-700">
                  <Check size={14} />
                </button>
                <button onClick={() => setEditingGroupId(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => updateParams({ group: g.id, page: null })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedGroupId === g.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {g.name} <span className="ml-1 opacity-75">{g.client_count}</span>
              </button>
            )}
            {/* Edit / delete on hover (boshliq only) */}
            {isBoshliq && editingGroupId !== g.id && (
              <div className="absolute -top-1 -right-1 hidden group-hover:flex items-center gap-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm p-0.5">
                <button
                  onClick={e => { e.stopPropagation(); setEditingGroupId(g.id); setEditingGroupName(g.name) }}
                  className="p-0.5 rounded text-gray-500 hover:text-blue-600"
                  title="Nomini o'zgartirish"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteGroup(g.id) }}
                  className="p-0.5 rounded text-gray-500 hover:text-red-500"
                  title="Guruhni o'chirish"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Ungrouped tab */}
        {ungroupedCount > 0 && (
          <button
            onClick={() => updateParams({ group: 'ungrouped', page: null })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedGroupId === 'ungrouped'
                ? 'bg-gray-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Guruхsiz <span className="ml-1 opacity-75">{ungroupedCount}</span>
          </button>
        )}

        {/* New group (boshliq only) */}
        {isBoshliq && (showNewGroup ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700">
            <input
              ref={newGroupInputRef}
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="Guruh nomi..."
              onKeyDown={e => {
                if (e.key === 'Enter') createGroup()
                if (e.key === 'Escape') { setShowNewGroup(false); setNewGroupName('') }
              }}
              className="text-sm bg-transparent outline-none w-28 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <button onClick={createGroup} className="text-green-600 hover:text-green-700">
              <Check size={14} />
            </button>
            <button onClick={() => { setShowNewGroup(false); setNewGroupName('') }} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewGroup(true)}
            className="px-2 py-1.5 rounded-lg text-sm text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-1"
          >
            <Plus size={14} /> Guruh
          </button>
        ))}
      </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {FILTER_CARDS.map(({ key, label, value, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => updateParams({ filter: key === 'all' ? null : key, page: null })}
            className={`card text-left transition-all ${
              filterStatus === key ? 'ring-2 ring-blue-500' : 'card-hover'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
              <Icon size={18} className={color} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          </button>
        ))}
        {/* Noaktiv mijozlar — navigates to /inactive-clients */}
        <button
          onClick={() => navigate('/inactive-clients')}
          className="card text-left transition-all card-hover"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">Noaktiv mijozlar</span>
            <Clock size={18} className="text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.inactive}</p>
        </button>
      </div>

      {/* Search + Export */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 w-full"
            placeholder="Ism, telefon qidirish..."
            value={search}
            onChange={e => updateParams({ q: e.target.value || null, page: null })}
          />
        </div>
        <button
          onClick={exportToExcel}
          disabled={exporting}
          className="btn btn-secondary flex items-center gap-1.5 ml-auto disabled:opacity-60"
        >
          {exporting
            ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            : <Download size={15} />}
          {exporting ? 'Yuklanmoqda...' : 'Excel'}
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header hidden sm:table-cell">#</th>
                <th className="table-header">Mijoz / Manzil</th>
                <th className="table-header hidden md:table-cell">Telefon</th>
                <th className="table-header hidden lg:table-cell">Firma nomi</th>
                <th className="table-header hidden md:table-cell">Buyurtmalar</th>
                <th className="table-header">Qarz</th>
                <th className="table-header hidden lg:table-cell">Avans</th>
                <th className="table-header">Tara</th>
                <th className="table-header">Holat</th>
                <th className="table-header hidden lg:table-cell">Ro'yxat sanasi</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="table-cell">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : clients.map((c, idx) => {
                    const displayLabel = clientDisplay(c)
                    const initials = getInitials(displayLabel)
                    const avatarColor = getAvatarColor(displayLabel)
                    return (
                      <tr key={c.id} className="table-row-hover border-t border-gray-100 dark:border-gray-800">
                        <td className="table-cell text-gray-400 hidden sm:table-cell">{(page - 1) * perPage + idx + 1}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${avatarColor}`}>
                              {initials}
                            </span>
                            <div>
                              <button
                                onClick={() => { sessionStorage.setItem('clients_scroll_y', String(window.scrollY)); navigate(c.id) }}
                                className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left"
                              >
                                {displayLabel}
                              </button>
                              <p className="text-xs text-gray-400">{c.phone}</p>
                              {c.company_name && (
                                <p className="text-xs text-blue-500 dark:text-blue-400 font-medium">{c.company_name}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="table-cell text-gray-600 dark:text-gray-400 hidden md:table-cell">{formatPhone(c.phone)}</td>
                        <td className="table-cell hidden lg:table-cell">
                          {c.company_name
                            ? <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{c.company_name}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="table-cell text-gray-600 dark:text-gray-400 hidden md:table-cell">{c.orders_count ?? '—'}</td>
                        <td className="table-cell">
                          {c.debt_amount > 0
                            ? <span className="badge badge-danger">{formatMoney(c.debt_amount)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="table-cell hidden lg:table-cell">
                          {c.advance_amount > 0
                            ? <span className="badge badge-success">{formatMoney(c.advance_amount)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="table-cell">
                          {c.container_balance > 0
                            ? <span className="badge badge-warning">{c.container_balance} ta</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="table-cell">
                          {c.is_blocked
                            ? <span className="badge badge-danger">Bloklangan</span>
                            : c.is_active
                              ? <span className="badge badge-success">Faol</span>
                              : <span className="badge badge-gray">Nofaol</span>}
                        </td>
                        <td className="table-cell text-gray-500 text-xs hidden lg:table-cell">{formatDate(c.created_at)}</td>
                        <td className="table-cell">
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              if (openMenu === c.id) { setOpenMenu(null); setMenuMode('main'); return }
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                              const itemCount = 1 + (isBoshliq && groups.length > 0 ? 1 : 0) + (isBoshliq ? 1 : 0) + (canDelete ? 1 : 0)
                              const menuH = itemCount * 42 + 16
                              const spaceBelow = window.innerHeight - rect.bottom
                              const top = spaceBelow < menuH ? Math.max(8, rect.top - menuH) : rect.bottom + 4
                              setMenuPos({ top, right: window.innerWidth - rect.right })
                              setMenuMode('main')
                              setOpenMenu(c.id)
                            }}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
              }
              {!loading && clients.length === 0 && (
                <tr>
                  <td colSpan={9} className="table-cell text-center text-gray-400 py-8">
                    Mijozlar topilmadi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Jami: {meta.total} ta mijoz</span>
            <select
              value={perPage}
              onChange={e => { const v = Number(e.target.value); localStorage.setItem('clients_per_page', String(v)); updateParams({ per: v !== 25 ? v : null, page: null }) }}
              className="text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              {[25, 50, 100].map(n => <option key={n} value={n}>{n} ta</option>)}
            </select>
          </div>
          {meta.pages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => updateParams({ page: page > 1 ? page - 1 : null })}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm px-2">{page} / {meta.pages}</span>
              <button
                onClick={() => updateParams({ page: page < meta.pages ? page + 1 : null })}
                disabled={page === meta.pages}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {showImport && <ClientImportModal onClose={() => setShowImport(false)} onDone={() => { fetchClients(); fetchStats() }} />}
      {showNew && (
        <NewClientModal
          groups={groups}
          defaultGroupId={selectedGroupIdForNew}
          onClose={() => setShowNew(false)}
          onDone={() => { fetchClients(); fetchStats(); fetchGroups() }}
        />
      )}

      {/* Fixed dropdown menu */}
      {openMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpenMenu(null); setMenuMode('main') }} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-52 overflow-y-auto"
            style={{ top: menuPos.top, right: menuPos.right, maxHeight: `calc(100vh - ${menuPos.top + 8}px)` }}
          >
            {menuMode === 'main' ? (
              <>
                <button
                  onClick={() => { setOpenMenu(null); setMenuMode('main'); sessionStorage.setItem('clients_scroll_y', String(window.scrollY)); navigate(openMenu!) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                >
                  <Eye size={14} /> Ko'rish
                </button>
                {isBoshliq && groups.length > 0 && (
                  <button
                    onClick={() => setMenuMode('move')}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                  >
                    <FolderInput size={14} className="text-blue-500" />
                    <span className="flex-1 text-left">Guruhga ko'chirish</span>
                    <ChevronRightIcon size={13} className="text-gray-400" />
                  </button>
                )}
                {isBoshliq && (
                  <button
                    onClick={() => {
                      const client = clients.find(c => c.id === openMenu)
                      if (client) handleBlock(client)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                  >
                    {clients.find(c => c.id === openMenu)?.is_blocked
                      ? <><CheckCircle size={14} className="text-green-500" /> Blokdan chiqarish</>
                      : <><Ban size={14} className="text-red-500" /> Bloklash</>}
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => {
                      const client = clients.find(c => c.id === openMenu)
                      if (client) handleDelete(client)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                  >
                    <Trash2 size={14} /> O'chirish
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => setMenuMode('main')}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
                >
                  <ChevronLeft size={13} /> Orqaga
                </button>
                <div className="py-0.5 max-h-64 overflow-y-auto">
                  {/* Ungrouped option */}
                  {clients.find(c => c.id === openMenu)?.group_id && (
                    <button
                      onClick={() => handleMoveToGroup(openMenu!, null)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                    >
                      <X size={13} /> Guruхsiz
                    </button>
                  )}
                  {groups.map(g => {
                    const isCurrent = clients.find(c => c.id === openMenu)?.group_id === g.id
                    return (
                      <button
                        key={g.id}
                        disabled={isCurrent}
                        onClick={() => handleMoveToGroup(openMenu!, g.id)}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-sm ${
                          isCurrent
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 cursor-default'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {isCurrent && <Check size={13} />}
                        {!isCurrent && <span className="w-[13px]" />}
                        {g.name}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
