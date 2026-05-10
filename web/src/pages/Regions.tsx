import { useState, useEffect } from 'react'
import { MapPin, ToggleLeft, ToggleRight } from 'lucide-react'
import api from '@/api/client'
import { useToastStore } from '@/store/toast'

interface Region {
  id: string
  name: string
  name_ru: string | null
  is_active: boolean
  order: number
}

export default function Regions() {
  const toast = useToastStore()
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const fetchRegions = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/regions')
      setRegions(data)
    } catch {
      toast.error('Hududlarni yuklashda xatolik')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRegions() }, [])

  const toggle = async (region: Region) => {
    setToggling(region.id)
    try {
      await api.patch(`/regions/${region.id}`, { is_active: !region.is_active })
      setRegions(rs => rs.map(r => r.id === region.id ? { ...r, is_active: !r.is_active } : r))
    } catch {
      toast.error('Amal bajarilmadi')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hududlar</h1>
        <span className="badge badge-info">{regions.filter(r => r.is_active).length} faol</span>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">#</th>
                <th className="table-header">Hudud nomi</th>
                <th className="table-header">Ruscha</th>
                <th className="table-header">Holat</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 14 }).map((_, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="table-cell">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : regions.map((r, idx) => (
                    <tr key={r.id} className="table-row-hover border-t border-gray-100 dark:border-gray-800">
                      <td className="table-cell text-gray-400">{idx + 1}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <MapPin size={14} className={r.is_active ? 'text-green-500' : 'text-gray-300'} />
                          <span className="font-medium text-gray-900 dark:text-white">{r.name}</span>
                        </div>
                      </td>
                      <td className="table-cell text-gray-500">{r.name_ru ?? '—'}</td>
                      <td className="table-cell">
                        <button
                          onClick={() => toggle(r)}
                          disabled={toggling === r.id}
                          className="flex items-center gap-2 text-sm transition-colors"
                        >
                          {r.is_active
                            ? <ToggleRight size={24} className="text-green-500" />
                            : <ToggleLeft size={24} className="text-gray-300" />}
                          <span className={r.is_active ? 'text-green-600' : 'text-gray-400'}>
                            {r.is_active ? 'Faol' : 'Nofaol'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
