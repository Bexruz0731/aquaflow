import { useState, useRef } from 'react'
import { X, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react'
import api from '@/api/client'
import { useToastStore } from '@/store/toast'
import { formatPhone } from '@/utils/format'

interface Props { onClose: () => void; onDone: () => void }

interface PreviewRow {
  first_name: string
  last_name: string
  phone: string
  valid: boolean
  error?: string
}

export default function ClientImportModal({ onClose, onDone }: Props) {
  const toast = useToastStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [imported, setImported] = useState(0)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Simple CSV parse (name, phone per line)
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    const rows: PreviewRow[] = lines.slice(1).map(line => {
      const [first_name = '', last_name = '', phone = ''] = line.split(',').map(s => s.trim())
      const phoneClean = phone.replace(/\D/g, '')
      const valid = !!first_name && phoneClean.length >= 9
      return {
        first_name,
        last_name,
        phone: phoneClean,
        valid,
        error: !first_name ? 'Ism yo\'q' : phoneClean.length < 9 ? 'Telefon noto\'g\'ri' : undefined,
      }
    })
    setPreview(rows)
    setStep('preview')
  }

  const handleImport = async () => {
    if (!preview) return
    const valid = preview.filter(r => r.valid)
    setUploading(true)
    try {
      const { data } = await api.post('/clients/bulk-import', { clients: valid })
      setImported(data.imported ?? valid.length)
      setStep('done')
      onDone()
      toast.success(`${data.imported ?? valid.length} ta mijoz import qilindi`)
    } catch {
      toast.error('Import amalga oshmadi')
    } finally {
      setUploading(false)
    }
  }

  const downloadTemplate = () => {
    const csv = 'first_name,last_name,phone\nAzamat,Karimov,998901234567\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'mijozlar_shablon.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mijozlarni import qilish</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                CSV fayl yuklang: birinchi qator sarlavha (first_name, last_name, phone).
              </p>
              <button onClick={downloadTemplate} className="btn btn-secondary flex items-center gap-2 text-sm">
                <Download size={14} /> Shablonni yuklab olish
              </button>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 transition-colors"
              >
                <Upload size={32} className="mx-auto text-gray-400 mb-3" />
                <p className="text-sm text-gray-500">CSV faylni tanlash uchun bosing</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Jami: <b>{preview.length}</b> qator •{' '}
                  <span className="text-green-600">{preview.filter(r => r.valid).length} to'g'ri</span>{' '}
                  {preview.filter(r => !r.valid).length > 0 && (
                    <span className="text-red-500">• {preview.filter(r => !r.valid).length} xato</span>
                  )}
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900">
                      <th className="table-header">Ism</th>
                      <th className="table-header">Familiya</th>
                      <th className="table-header">Telefon</th>
                      <th className="table-header">Holat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="table-cell">{r.first_name}</td>
                        <td className="table-cell">{r.last_name}</td>
                        <td className="table-cell">{r.phone ? formatPhone(r.phone) : '—'}</td>
                        <td className="table-cell">
                          {r.valid
                            ? <CheckCircle size={14} className="text-green-500" />
                            : <span className="flex items-center gap-1 text-red-500"><AlertCircle size={14} />{r.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 50 && (
                <p className="text-xs text-gray-400">Ko'rsatilmoqda: 50 / {preview.length}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('upload')} className="btn btn-secondary flex-1">Orqaga</button>
                <button
                  onClick={handleImport}
                  disabled={uploading || preview.filter(r => r.valid).length === 0}
                  className="btn btn-primary flex-1"
                >
                  {uploading ? 'Import...' : `${preview.filter(r => r.valid).length} ta mijozni import qilish`}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{imported} ta mijoz qo'shildi!</p>
              <button onClick={onClose} className="btn btn-primary mt-6">Yopish</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
