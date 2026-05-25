'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Search, Plus, X, Loader2, Eye, MessageSquare, CheckCheck, Clock, AlertCircle } from 'lucide-react'
import { useToast, ToastContainer } from '@/components/ui/toast'

interface Alumno {
  id: string
  nombre_completo: string
  email: string
  telefono: string | null
  activo: boolean
  matricula: string
  plan_nombre: string
  duracion_meses: number
  meses_desbloqueados: number
  inscripcion_pagada: boolean
  contactado_whatsapp: boolean
  created_at: string
}


const INPUT_STYLE = {
  background: '#0B0D11',
  border: '1px solid #2A2F3E',
  color: '#F1F5F9',
}

const CARD_STYLE = {
  background: '#181C26',
  border: '1px solid #2A2F3E',
}

const WA_NUMERO = '5256543225636'

function waContactarUrl(telefono: string | null | undefined, nombre: string): string | null {
  const limpio = (telefono || '').replace(/\D/g, '')
  if (!limpio) return null
  const numero = limpio.startsWith('52') ? limpio : `52${limpio}`
  const texto = `Hola ${nombre} 👋, soy de Control Escolar de IVS Virtual. Vi que te registraste y quería darte la bienvenida y resolver cualquier duda que tengas 🎓`
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

function tiempoRelativo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d !== 1 ? 's' : ''}`
}

export default function AlumnosPage() {
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()
  const [alumnos, setAlumnos] = useState<Alumno[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [tab, setTab] = useState<'todos' | 'pendientes'>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [marcandoId, setMarcandoId] = useState<string | null>(null)
  const [form, setForm] = useState({
    nombre_completo: '',
    email: '',
    telefono: '',
    password: '',
    nivel: '',
    modalidad: '',
  })

  const cargarAlumnos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/alumnos')
      if (!res.ok) throw new Error('Error al cargar alumnos')
      setAlumnos(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar alumnos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarAlumnos()
  }, [cargarAlumnos])

  // Refrescar al volver a esta pestaña (ej. después de activar/desactivar desde [id])
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') cargarAlumnos()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [cargarAlumnos])

  // Pendientes = inscrip no pagada. Badge = sin contactar aún
  const pendientes = alumnos.filter(a => !a.inscripcion_pagada)
  const sinContactar = pendientes.filter(a => !a.contactado_whatsapp).length

  const alumnosFiltrados = (tab === 'todos' ? alumnos : pendientes).filter(a =>
    a.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
    a.email.toLowerCase().includes(busqueda.toLowerCase()) ||
    a.matricula.toLowerCase().includes(busqueda.toLowerCase())
  )

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/alumnos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? 'Error al crear alumno')
        return
      }
      const nombre = form.nombre_completo
      const matricula = data.matricula ?? ''
      setModalOpen(false)
      setForm({ nombre_completo: '', email: '', telefono: '', password: '', nivel: '', modalidad: '' })
      await cargarAlumnos()
      showToast(`✓ Alumno ${nombre} creado${matricula ? ` con matrícula ${matricula}` : ''}`, 'success')
    } catch {
      setFormError('Error inesperado. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarcarContactado(alumnoId: string, valor: boolean) {
    setMarcandoId(alumnoId)
    try {
      const res = await fetch(`/api/admin/alumnos/${alumnoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactado_whatsapp: valor }),
      })
      if (res.ok) {
        setAlumnos(prev =>
          prev.map(a => a.id === alumnoId ? { ...a, contactado_whatsapp: valor } : a)
        )
        showToast(valor ? '✓ Marcado como contactado' : '✓ Marcado como pendiente', 'success')
      } else {
        showToast('Error al actualizar', 'error')
      }
    } catch {
      showToast('Error al actualizar', 'error')
    } finally {
      setMarcandoId(null)
    }
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alumnos</h1>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
            Gestiona los alumnos registrados en la plataforma
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
          style={{ background: '#5B6CFF', color: '#fff' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#7B8AFF' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
        >
          <Plus className="w-4 h-4" />
          Nuevo Alumno
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTab('todos')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: tab === 'todos' ? 'rgba(91,108,255,0.15)' : 'transparent',
            color: tab === 'todos' ? '#7B8AFF' : '#94A3B8',
            border: tab === 'todos' ? '1px solid rgba(91,108,255,0.35)' : '1px solid #2A2F3E',
          }}
        >
          <Users className="w-4 h-4" />
          Todos
          <span
            className="px-1.5 py-0.5 rounded-full text-xs font-bold"
            style={{
              background: tab === 'todos' ? 'rgba(91,108,255,0.25)' : 'rgba(255,255,255,0.07)',
              color: tab === 'todos' ? '#7B8AFF' : '#64748B',
            }}
          >
            {alumnos.length}
          </span>
        </button>

        <button
          onClick={() => setTab('pendientes')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: tab === 'pendientes' ? 'rgba(239,68,68,0.12)' : 'transparent',
            color: tab === 'pendientes' ? '#FCA5A5' : '#94A3B8',
            border: tab === 'pendientes' ? '1px solid rgba(239,68,68,0.3)' : '1px solid #2A2F3E',
          }}
        >
          <AlertCircle className="w-4 h-4" />
          Pendientes de contactar
          {sinContactar > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full text-xs font-bold"
              style={{ background: '#EF4444', color: '#fff' }}
            >
              {sinContactar}
            </span>
          )}
        </button>
      </div>

      {/* Info contextual en tab pendientes */}
      {tab === 'pendientes' && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}
        >
          <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
          <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>
            Estos alumnos se registraron pero aún no han pagado su inscripción.
            Contáctalos por WhatsApp para darles la bienvenida y ayudarlos a continuar.
            El número de Control Escolar es <strong style={{ color: '#F59E0B' }}>+{WA_NUMERO}</strong>.
          </p>
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
        <input
          type="text"
          placeholder={tab === 'pendientes' ? 'Buscar pendiente por nombre, email o matrícula...' : 'Buscar por nombre, email o matrícula...'}
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none"
          style={{ ...INPUT_STYLE }}
          onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
          onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
        />
      </div>

      {/* ── TAB: PENDIENTES DE CONTACTAR ── */}
      {tab === 'pendientes' && (
        <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
            </div>
          ) : alumnosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <CheckCheck className="w-10 h-10" style={{ color: '#10B981' }} />
              <p className="text-sm font-medium" style={{ color: '#10B981' }}>
                {busqueda ? 'No se encontraron resultados' : '¡Todo al día! No hay alumnos pendientes de contactar'}
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#2A2F3E' }}>
              {alumnosFiltrados.map(a => (
                <div key={a.id} className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">

                    {/* Info alumno */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-gray-900">
                          {a.nombre_completo}
                        </p>
                        {a.contactado_whatsapp && (
                          <span
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: 'rgba(16,185,129,0.12)', color: '#34D399' }}
                          >
                            <CheckCheck className="w-3 h-3" />
                            Contactado
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{a.email}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#64748B' }}>
                          {a.matricula}
                        </span>
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                          <Clock className="w-3 h-3" />
                          {tiempoRelativo(a.created_at)}
                        </span>
                        <span className="text-xs" style={{ color: '#64748B' }}>
                          {new Date(a.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {/* Botón WhatsApp */}
                      {(() => {
                        const waUrl = waContactarUrl(a.telefono, (a.nombre_completo || '').split(' ')[0] || 'estudiante')
                        return waUrl ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                            style={{ background: 'rgba(37,211,102,0.12)', color: '#25D366', border: '1px solid rgba(37,211,102,0.25)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,211,102,0.22)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,211,102,0.12)' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            Contactar
                          </a>
                        ) : (
                          <span className="text-xs italic px-3 py-2" style={{ color: '#64748B' }}>Sin teléfono</span>
                        )
                      })()}

                      {/* Marcar como contactado / pendiente */}
                      <button
                        onClick={() => handleMarcarContactado(a.id, !a.contactado_whatsapp)}
                        disabled={marcandoId === a.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                        style={a.contactado_whatsapp
                          ? { background: 'rgba(255,255,255,0.05)', color: '#64748B', border: '1px solid #2A2F3E' }
                          : { background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.25)' }
                        }
                        onMouseEnter={e => { if (marcandoId !== a.id) (e.currentTarget as HTMLElement).style.opacity = '0.8' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                      >
                        {marcandoId === a.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <CheckCheck className="w-3.5 h-3.5" />
                        }
                        {a.contactado_whatsapp ? 'Desmarcar' : 'Marcar contactado'}
                      </button>

                      {/* Ver detalle */}
                      <button
                        onClick={() => router.push(`/admin/alumnos/${a.id}`)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                        style={{ background: 'rgba(91,108,255,0.1)', color: '#7B8AFF', border: '1px solid rgba(91,108,255,0.2)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,108,255,0.2)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,108,255,0.1)' }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TODOS LOS ALUMNOS ── */}
      {tab === 'todos' && (
        <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm" style={{ color: '#EF4444' }}>{error}</p>
            </div>
          ) : alumnosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users className="w-10 h-10" style={{ color: '#2A2F3E' }} />
              <p className="text-sm" style={{ color: '#94A3B8' }}>
                {busqueda ? 'No se encontraron resultados' : 'No hay alumnos registrados'}
              </p>
            </div>
          ) : (
            <>
              {/* Cards en móvil */}
              <div className="sm:hidden divide-y" style={{ borderColor: '#2A2F3E' }}>
                {alumnosFiltrados.map(a => (
                  <div key={a.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: '#F1F5F9' }}>{a.nombre_completo}</p>
                        <p className="text-xs truncate mt-0.5" style={{ color: '#94A3B8' }}>{a.email}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={a.activo
                            ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
                            : { background: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                          }
                        >
                          {a.activo ? 'Activo' : 'Inactivo'}
                        </span>
                        {!a.inscripcion_pagada && (
                          <span
                            className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
                          >
                            Sin pagar
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: '#94A3B8' }}>
                      <span className="font-mono">{a.matricula}</span>
                      <span>·</span>
                      <span>{a.plan_nombre || 'Sin plan'}</span>
                      <span>·</span>
                      <span>{a.meses_desbloqueados}/{a.duracion_meses} meses</span>
                    </div>
                    <button
                      onClick={() => router.push(`/admin/alumnos/${a.id}`)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(91,108,255,0.1)', color: '#7B8AFF', border: '1px solid rgba(91,108,255,0.2)' }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ver detalle
                    </button>
                  </div>
                ))}
              </div>

              {/* Tabla en desktop */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                      {['Matrícula', 'Nombre', 'Email', 'Plan', 'Meses', 'Inscripción', 'Estado', 'Acciones'].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: '#94A3B8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alumnosFiltrados.map(a => (
                      <tr
                        key={a.id}
                        style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,108,255,0.04)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94A3B8' }}>{a.matricula}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#F1F5F9' }}>{a.nombre_completo}</td>
                        <td className="px-4 py-3" style={{ color: '#94A3B8' }}>{a.email}</td>
                        <td className="px-4 py-3" style={{ color: '#94A3B8' }}>{a.plan_nombre}</td>
                        <td className="px-4 py-3">
                          <span style={{ color: '#F1F5F9' }}>{a.meses_desbloqueados}</span>
                          <span style={{ color: '#94A3B8' }}>/{a.duracion_meses}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={a.inscripcion_pagada
                              ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
                              : { background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
                            }
                          >
                            {a.inscripcion_pagada ? 'Pagada' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={a.activo
                              ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
                              : { background: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                            }
                          >
                            {a.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => router.push(`/admin/alumnos/${a.id}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                            style={{ background: 'rgba(91,108,255,0.1)', color: '#7B8AFF', border: '1px solid rgba(91,108,255,0.2)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.2)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.1)' }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal Nuevo Alumno */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={CARD_STYLE}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Nuevo Alumno</h3>
              <button
                onClick={() => { setModalOpen(false); setFormError(null) }}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCrear} className="space-y-4">
              {[
                { label: 'Nombre completo', key: 'nombre_completo', type: 'text', placeholder: 'Juan Pérez García' },
                { label: 'Correo electrónico', key: 'email', type: 'email', placeholder: 'alumno@ejemplo.com' },
                { label: 'Contraseña temporal', key: 'password', type: 'password', placeholder: '••••••••' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>{label}</label>
                  <input
                    type={type}
                    required
                    placeholder={placeholder}
                    value={form[key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={INPUT_STYLE}
                    onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                    onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>
                  Teléfono / WhatsApp <span className="text-xs" style={{ color: '#64748B' }}>(opcional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="10 dígitos"
                  value={form.telefono}
                  onChange={e => setForm(prev => ({ ...prev, telefono: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={INPUT_STYLE}
                  onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Nivel</label>
                <select
                  required
                  value={form.nivel}
                  onChange={e => setForm(prev => ({ ...prev, nivel: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={INPUT_STYLE}
                >
                  <option value="">Selecciona nivel...</option>
                  <option value="secundaria">Secundaria</option>
                  <option value="preparatoria">Preparatoria</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Modalidad</label>
                <select
                  required
                  value={form.modalidad}
                  onChange={e => setForm(prev => ({ ...prev, modalidad: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={INPUT_STYLE}
                >
                  <option value="">Selecciona modalidad...</option>
                  <option value="6_meses">6 meses (Estándar)</option>
                  <option value="3_meses">3 meses (Express)</option>
                </select>
              </div>

              {formError && (
                <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setModalOpen(false); setFormError(null) }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
                  style={{ background: '#5B6CFF', color: '#fff' }}
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Creando...</> : 'Crear Alumno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
