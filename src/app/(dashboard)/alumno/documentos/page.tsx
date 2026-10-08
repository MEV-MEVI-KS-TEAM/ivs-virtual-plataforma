'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Upload, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { useToast, ToastContainer } from '@/components/ui/toast'

type DocTipo =
  | 'acta_nacimiento'
  | 'curp'
  | 'certificado_primaria'
  | 'certificado_secundaria'
  | 'identificacion_oficial'
  | 'foto_perfil_doc'

type DocEstado = 'pendiente' | 'aprobado' | 'rechazado'

interface Documento {
  id: string
  tipo: DocTipo
  nombre_archivo: string
  url: string
  estado: DocEstado
  comentario_admin?: string | null
  subido_en: string
}

const TIPOS_PREPA: DocTipo[] = [
  'acta_nacimiento',
  'curp',
  'certificado_secundaria',
  'identificacion_oficial',
  'foto_perfil_doc',
]

const TIPOS_SECUNDARIA: DocTipo[] = [
  'acta_nacimiento',
  'curp',
  'certificado_primaria',
  'identificacion_oficial',
  'foto_perfil_doc',
]

const TIPO_LABEL: Record<DocTipo, string> = {
  acta_nacimiento:        'Acta de Nacimiento',
  curp:                   'CURP',
  certificado_primaria:   'Certificado de Primaria',
  certificado_secundaria: 'Certificado de Secundaria',
  identificacion_oficial: 'Identificación Oficial',
  foto_perfil_doc:        'Foto de Perfil',
}

function DocIcon({ tipo }: { tipo: DocTipo }) {
  const color = '#7B8AFF'
  if (tipo === 'acta_nacimiento') return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  )
  if (tipo === 'curp') return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/>
      <path d="M15 8h2M15 12h2M7 16h10"/>
    </svg>
  )
  if (tipo === 'certificado_primaria' || tipo === 'certificado_secundaria') return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>
  )
  if (tipo === 'identificacion_oficial') return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/>
      <path d="M13 10h5M13 14h3"/>
    </svg>
  )
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

const ESTADO_STYLE: Record<DocEstado, React.CSSProperties> = {
  pendiente:  { background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' },
  aprobado:   { background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' },
  rechazado:  { background: 'rgba(239,68,68,0.12)',  color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' },
}

const ESTADO_ICON: Record<DocEstado, React.ReactNode> = {
  pendiente: <Clock className="w-3.5 h-3.5" />,
  aprobado:  <CheckCircle2 className="w-3.5 h-3.5" />,
  rechazado: <XCircle className="w-3.5 h-3.5" />,
}

const ESTADO_LABEL: Record<DocEstado, string> = {
  pendiente: 'Pendiente',
  aprobado:  'Aprobado',
  rechazado: 'Rechazado',
}

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

export default function DocumentosPage() {
  const { toasts, showToast, removeToast } = useToast()

  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [planNombre, setPlanNombre] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<DocTipo | null>(null)
  const fileInputRefs = useRef<Partial<Record<DocTipo, HTMLInputElement | null>>>({})

  useEffect(() => {
    fetch('/api/alumno/documentos')
      .then(r => r.json())
      .then(data => {
        setDocumentos(Array.isArray(data.documentos) ? data.documentos : [])
        setPlanNombre(data.plan_nombre ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleUpload(tipo: DocTipo, file: File) {
    setUploading(tipo)
    try {
      const form = new FormData()
      form.append('archivo', file)
      form.append('tipo', tipo)
      const res = await fetch('/api/alumno/documentos', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Error al subir documento', 'error'); return }
      showToast('Documento subido correctamente', 'success')
      const fresh = await fetch('/api/alumno/documentos').then(r => r.json())
      setDocumentos(Array.isArray(fresh.documentos) ? fresh.documentos : [])
    } catch {
      showToast('Error al subir documento', 'error')
    } finally {
      setUploading(null)
      const input = fileInputRefs.current[tipo]
      if (input) input.value = ''
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
    </div>
  )

  const esSecundaria = planNombre.toLowerCase().includes('ecundaria')
  const tiposActivos = esSecundaria ? TIPOS_SECUNDARIA : TIPOS_PREPA
  const docMap = new Map(documentos.map(d => [d.tipo, d]))

  return (
    <div className="space-y-6 max-w-3xl">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div>
        <h2 className="text-xl font-bold text-gray-900">Mis Documentos</h2>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Sube y administra tus documentos escolares</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tiposActivos.map(tipo => {
          const doc = docMap.get(tipo)
          const isUploading = uploading === tipo

          return (
            <div key={tipo} className="rounded-xl p-5 flex flex-col gap-4" style={CARD}>
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(91,108,255,0.1)' }}
                >
                  <DocIcon tipo={tipo} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {TIPO_LABEL[tipo]}
                  </p>
                  {doc ? (
                    <div
                      className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={ESTADO_STYLE[doc.estado]}
                    >
                      {ESTADO_ICON[doc.estado]}
                      {ESTADO_LABEL[doc.estado]}
                    </div>
                  ) : (
                    <p className="text-xs mt-1" style={{ color: '#475569' }}>Sin documento</p>
                  )}
                </div>
              </div>

              {doc?.estado === 'rechazado' && doc.comentario_admin && (
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}
                >
                  <span style={{ fontWeight: 600 }}>Comentario: </span>
                  {doc.comentario_admin}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 mt-auto">
                <p className="text-xs" style={{ color: '#475569' }}>JPG, PNG, PDF · máx. 5 MB</p>
                <input
                  ref={el => { fileInputRefs.current[tipo] = el }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(tipo, file)
                  }}
                />
                <button
                  onClick={() => fileInputRefs.current[tipo]?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
                  style={{ background: 'rgba(91,108,255,0.15)', color: '#7B8AFF', border: '1px solid rgba(91,108,255,0.3)' }}
                  onMouseEnter={e => { if (!isUploading) e.currentTarget.style.background = 'rgba(91,108,255,0.25)' }}
                  onMouseLeave={e => { if (!isUploading) e.currentTarget.style.background = 'rgba(91,108,255,0.15)' }}
                >
                  {isUploading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Subiendo...</>
                    : <><Upload className="w-3.5 h-3.5" />{doc ? 'Reemplazar' : 'Subir'}</>
                  }
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
