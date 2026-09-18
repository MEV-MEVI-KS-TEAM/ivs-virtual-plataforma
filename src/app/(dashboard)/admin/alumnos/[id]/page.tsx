'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, X, Loader2, Key, Eye, EyeOff, Download, FileText, StickyNote, Save, LockOpen, CheckCircle2, CreditCard, Undo2 } from 'lucide-react'
import { useToast, ToastContainer } from '@/components/ui/toast'
import { config } from '@/lib/config'

interface AlumnoDetalle {
  id: string
  matricula: string
  meses_desbloqueados: number
  inscripcion_pagada: boolean
  created_at: string
  notas_admin: string | null
  usuario: { id: string; nombre_completo: string; email: string; activo: boolean }
  plan: { id: string; nombre: string; duracion_meses: number; precio_mensual: number }
  calificaciones: { id: string; calificacion_final: number; aprobada: boolean; materias: { nombre: string; codigo: string } }[]
  intentos: {
    id: string
    numero_intento: number
    puntaje: number
    acreditado: boolean
    fecha_intento: string
    evaluaciones: { id: string; titulo: string; materias: { nombre: string } | null } | null
  }[]
}

type DocTipo =
  | 'acta_nacimiento' | 'curp' | 'certificado_primaria'
  | 'certificado_secundaria' | 'identificacion_oficial' | 'foto_perfil_doc'

type DocEstado = 'pendiente' | 'aprobado' | 'rechazado'

interface DocumentoAdmin {
  id: string
  tipo: DocTipo
  nombre_archivo: string
  estado: DocEstado
  comentario_admin?: string | null
  signed_url?: string | null
  subido_en: string
}

const DOC_TIPOS: DocTipo[] = [
  'acta_nacimiento', 'curp', 'certificado_primaria',
  'certificado_secundaria', 'identificacion_oficial', 'foto_perfil_doc',
]

const DOC_LABELS: Record<DocTipo, string> = {
  acta_nacimiento:        'Acta de Nacimiento',
  curp:                   'CURP',
  certificado_primaria:   'Certificado de Primaria',
  certificado_secundaria: 'Certificado de Secundaria',
  identificacion_oficial: 'Identificación Oficial',
  foto_perfil_doc:        'Foto (fondo blanco)',
}

const CARD_STYLE = { background: '#181C26', border: '1px solid #2A2F3E' }
const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }

export default function AlumnoDetallePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const { toasts, showToast, removeToast } = useToast()

  const [alumno, setAlumno] = useState<AlumnoDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalPago, setModalPago] = useState(false)
  const [modalReset, setModalReset] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resettingPass, setResettingPass] = useState(false)
  const [togglingActivo, setTogglingActivo] = useState(false)
  const [marcandoInscripcion, setMarcandoInscripcion] = useState(false)
  const [modalInscripcion, setModalInscripcion] = useState(false)
  const [modalCerrarMes, setModalCerrarMes] = useState(false)
  const [cerrandoMes, setCerrandoMes] = useState(false)
  const [cerrarMesError, setCerrarMesError] = useState<string | null>(null)
  const [desbloquearError, setDesbloquearError] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState<string | null>(null)
  const [resetPass, setResetPass] = useState({ password: '', confirm: '' })
  const [showResetPass, setShowResetPass] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  // Documentos
  const [documentos, setDocumentos] = useState<DocumentoAdmin[]>([])
  const [docEdits, setDocEdits] = useState<Record<string, { estado: DocEstado; comentario: string }>>({})
  const [savingDoc, setSavingDoc] = useState<string | null>(null)

  // Notas del admin
  const [notas, setNotas] = useState('')
  const [savingNotas, setSavingNotas] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [alumnoRes, docsRes] = await Promise.all([
        fetch(`/api/admin/alumnos/${id}`),
        fetch(`/api/admin/documentos/${id}`),
      ])
      if (!alumnoRes.ok) throw new Error('Alumno no encontrado')
      const alumnoData = await alumnoRes.json()
      setAlumno(alumnoData)
      if (alumnoData.notas_admin !== undefined) {
        setNotas(alumnoData.notas_admin ?? '')
      }
      const docsData: DocumentoAdmin[] = docsRes.ok ? await docsRes.json() : []
      setDocumentos(docsData)
      // Inicializar edits con valores actuales
      const edits: Record<string, { estado: DocEstado; comentario: string }> = {}
      for (const d of docsData) {
        edits[d.id] = { estado: d.estado, comentario: d.comentario_admin ?? '' }
      }
      setDocEdits(edits)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el alumno')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  async function handleDesbloquear() {
    setDesbloquearError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}/desbloquear-mes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) { setDesbloquearError(data.error ?? 'Error al desbloquear mes'); return }
      setModalPago(false)
      await cargar()
      if (alumno) {
        const mesDesbloqueado = alumno.meses_desbloqueados + 1
        showToast(`🔓 Mes ${mesDesbloqueado} desbloqueado para ${alumno.usuario.nombre_completo}`, 'success')
      }
    } catch {
      setDesbloquearError('Error inesperado. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCerrarMes() {
    setCerrarMesError(null)
    setCerrandoMes(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}/cerrar-mes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) { setCerrarMesError(data.error ?? 'Error al quitar el mes'); return }
      setModalCerrarMes(false)
      const { mes_quitado, materia_nombre } = data
      await cargar()
      showToast(
        `Mes ${mes_quitado} quitado${materia_nombre ? ` (${materia_nombre})` : ''} — el avance del alumno se conserva`,
        'success'
      )
    } catch {
      setCerrarMesError('Error inesperado. Intenta de nuevo.')
    } finally {
      setCerrandoMes(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetError(null)
    setResetSuccess(null)
    if (resetPass.password.length < 6) {
      setResetError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (resetPass.password !== resetPass.confirm) {
      setResetError('Las contraseñas no coinciden.')
      return
    }
    setResettingPass(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPass.password }),
      })
      const data = await res.json()
      if (!res.ok) { setResetError(data.error ?? 'Error al cambiar contraseña'); return }
      setResetSuccess(resetPass.password)
      setResetPass({ password: '', confirm: '' })
      showToast('✓ Contraseña actualizada correctamente', 'success')
    } catch {
      setResetError('Error inesperado. Intenta de nuevo.')
    } finally {
      setResettingPass(false)
    }
  }

  async function handleToggleActivo() {
    if (!alumno) return
    const nuevoEstado = !alumno.usuario.activo
    setTogglingActivo(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}/activar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: nuevoEstado }),
      })
      if (!res.ok) {
        const data = await res.json()
        showToast(data.error ?? 'Error al cambiar estado', 'error')
        return
      }
      await cargar()
      router.refresh()
      showToast(
        nuevoEstado
          ? `✓ Alumno ${alumno.usuario.nombre_completo} activado`
          : `Alumno ${alumno.usuario.nombre_completo} desactivado`,
        nuevoEstado ? 'success' : 'info'
      )
    } catch {
      showToast('Error inesperado', 'error')
    } finally {
      setTogglingActivo(false)
    }
  }

  async function handleMarcarInscripcion() {
    setMarcandoInscripcion(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}/inscripcion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Error al marcar inscripción', 'error'); return }
      setModalInscripcion(false)
      await cargar()
      router.refresh()
      showToast(`✓ Inscripción de ${alumno?.usuario.nombre_completo} marcada como pagada`, 'success')
    } catch {
      showToast('Error inesperado', 'error')
    } finally {
      setMarcandoInscripcion(false)
    }
  }

  async function handleGuardarDoc(docId: string) {
    const edit = docEdits[docId]
    if (!edit) return
    setSavingDoc(docId)
    try {
      const res = await fetch(`/api/admin/documentos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentoId: docId, estado: edit.estado, comentario: edit.comentario }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Error al guardar', 'error'); return }
      showToast('✓ Cambios guardados', 'success')
      await cargar()
    } catch {
      showToast('Error inesperado', 'error')
    } finally {
      setSavingDoc(null)
    }
  }

  async function handleGuardarNotas() {
    setSavingNotas(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}/notas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Error al guardar notas', 'error'); return }
      showToast('✓ Notas guardadas', 'success')
    } catch {
      showToast('Error inesperado al guardar notas', 'error')
    } finally {
      setSavingNotas(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
    </div>
  )

  if (error || !alumno) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <p className="text-sm" style={{ color: '#EF4444' }}>{error ?? 'Error al cargar el alumno'}</p>
      <button onClick={() => router.push('/admin/alumnos')} className="text-sm" style={{ color: '#5B6CFF' }}>
        Regresar
      </button>
    </div>
  )

  const todosBloqueados = alumno.meses_desbloqueados >= alumno.plan.duracion_meses

  return (
    <div className="space-y-6 max-w-4xl">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/admin/alumnos')}
            className="mt-1 p-2 rounded-lg flex-shrink-0 transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-100">{alumno.usuario.nombre_completo}</h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(91,108,255,0.15)', color: '#7B8AFF' }}>
                {alumno.matricula}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={alumno.usuario.activo
                  ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
                  : { background: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                }
              >
                {alumno.usuario.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>{alumno.usuario.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={() => { setModalReset(true); setResetError(null); setResetSuccess(null) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)' }}
          >
            <Key className="w-4 h-4" />
            Resetear contraseña
          </button>
          <button
            onClick={handleToggleActivo}
            disabled={togglingActivo}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-60"
            style={alumno.usuario.activo
              ? { background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }
              : { background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }
            }
          >
            {togglingActivo ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (alumno.usuario.activo ? 'Desactivar alumno' : 'Activar alumno')}
          </button>
        </div>
      </div>

      {/* Info General */}
      <div className="rounded-xl p-5 space-y-3" style={CARD_STYLE}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-gray-100">Información General</h3>
          {/* Badge inscripción pagada / Botón marcar pagada */}
          {alumno.inscripcion_pagada ? (
            <span
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Inscripción pagada
            </span>
          ) : (
            <button
              onClick={() => setModalInscripcion(true)}
              disabled={marcandoInscripcion}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
              style={{ background: 'rgba(91,108,255,0.12)', color: '#7B8AFF', border: '1px solid rgba(91,108,255,0.25)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.22)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.12)' }}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Marcar inscripción pagada
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div><p style={{ color: '#94A3B8' }}>Plan de estudio</p><p className="mt-0.5 font-medium" style={{ color: '#F1F5F9' }}>{alumno.plan.nombre}</p></div>
          <div><p style={{ color: '#94A3B8' }}>Duración total</p><p className="mt-0.5 font-medium" style={{ color: '#F1F5F9' }}>{alumno.plan.duracion_meses} meses</p></div>
          <div><p style={{ color: '#94A3B8' }}>Fecha de registro</p><p className="mt-0.5 font-medium" style={{ color: '#F1F5F9' }}>{new Date(alumno.created_at).toLocaleDateString('es-MX')}</p></div>
        </div>
      </div>

      {/* Progreso de meses */}
      <div className="rounded-xl p-5 space-y-4" style={CARD_STYLE}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-100">Progreso de Meses</h3>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
              {alumno.meses_desbloqueados} de {alumno.plan.duracion_meses} meses desbloqueados
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {todosBloqueados ? (
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22C55E' }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Todos los meses desbloqueados
              </div>
            ) : (
              <button
                onClick={() => { setModalPago(true); setDesbloquearError(null) }}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-bold transition-all shadow-lg"
                style={{ background: '#3AAFA9', color: '#fff', boxShadow: '0 4px 20px rgba(58,175,169,0.4)' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2D8C87'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#3AAFA9'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <LockOpen className="w-5 h-5" />
                Abrir Mes {alumno.meses_desbloqueados + 1}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {Array.from({ length: alumno.plan.duracion_meses }, (_, i) => {
            const mes = i + 1
            const desbloqueado = mes <= alumno.meses_desbloqueados
            return (
              <div
                key={mes}
                className="flex items-center justify-center w-10 h-10 rounded-lg text-xs font-bold transition-all"
                style={desbloqueado
                  ? { background: 'rgba(16,185,129,0.2)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#475569', border: '1px solid #2A2F3E' }
                }
              >
                {mes}
              </div>
            )
          })}
        </div>

        {/* Acción secundaria, deliberadamente separada de "Abrir Mes N+1":
            corrige el mes mal abierto, no "concluye" nada y no borra avance. */}
        {alumno.meses_desbloqueados > 0 && (
          <div className="flex justify-end pt-3" style={{ borderTop: '1px solid #2A2F3E' }}>
            <button
              onClick={() => { setModalCerrarMes(true); setCerrarMesError(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            >
              <Undo2 className="w-3.5 h-3.5" />
              Quitar último mes (Mes {alumno.meses_desbloqueados})
            </button>
          </div>
        )}
      </div>



      {/* Calificaciones */}
      <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <h3 className="text-sm font-semibold text-gray-100">Calificaciones</h3>
        </div>
        {alumno.calificaciones.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>Sin calificaciones registradas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                  {['Código', 'Materia', 'Calificación', 'Estado'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alumno.calificaciones.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94A3B8' }}>{c.materias.codigo}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#F1F5F9' }}>{c.materias.nombre}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: '#F1F5F9' }}>{c.calificacion_final}</td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={c.aprobada
                          ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
                          : { background: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                        }
                      >
                        {c.aprobada ? 'Aprobada' : 'Reprobada'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Intentos de Evaluaciones */}
      <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <h3 className="text-sm font-semibold text-gray-100">Intentos de Evaluaciones</h3>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            {(alumno.intentos?.length ?? 0)} intento{(alumno.intentos?.length ?? 0) !== 1 ? 's' : ''} registrado{(alumno.intentos?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        {(alumno.intentos?.length ?? 0) === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>
            Sin intentos registrados todavía
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(15,20,25,0.6)', borderBottom: '1px solid #2A2F3E' }}>
                  {['Materia', 'Evaluación', 'Intento', 'Calificación', 'Estado', 'Fecha'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alumno.intentos.map(intento => (
                  <tr key={intento.id} style={{ borderBottom: '1px solid rgba(42,47,62,0.6)' }}>
                    <td className="px-4 py-3" style={{ color: '#F1F5F9' }}>
                      {intento.evaluaciones?.materias?.nombre ?? '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: '#F1F5F9' }}>
                      {intento.evaluaciones?.titulo ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs" style={{ color: '#94A3B8' }}>
                      #{intento.numero_intento}
                    </td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: intento.acreditado ? '#10B981' : '#EF4444' }}>
                      {intento.puntaje}/100
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="px-2 py-1 rounded text-xs font-semibold"
                        style={intento.acreditado
                          ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
                          : { background: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                        }
                      >
                        {intento.acreditado ? 'Acreditado' : 'No acreditado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>
                      {new Date(intento.fecha_intento).toLocaleDateString('es-MX', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notas del Admin */}
      <div className="rounded-xl p-5 space-y-3" style={CARD_STYLE}>
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4" style={{ color: '#F59E0B' }} />
          <h3 className="text-sm font-semibold text-gray-100">Notas internas</h3>
          <span className="text-xs" style={{ color: '#475569' }}>(Solo visibles para admins)</span>
        </div>
        <textarea
          rows={4}
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Escribe notas sobre este alumno (motivos de contacto, observaciones, seguimiento, etc.)..."
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-y"
          style={{ ...INPUT_STYLE, minHeight: 100 }}
          onFocus={e => { e.currentTarget.style.border = '1px solid #3AAFA9' }}
          onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
        />
        <div className="flex justify-end">
          <button
            onClick={handleGuardarNotas}
            disabled={savingNotas}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: '#3AAFA9', color: '#fff' }}
            onMouseEnter={e => { if (!savingNotas) e.currentTarget.style.background = '#2D8C87' }}
            onMouseLeave={e => { if (!savingNotas) e.currentTarget.style.background = '#3AAFA9' }}
          >
            {savingNotas ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando...</> : <><Save className="w-4 h-4" />Guardar notas</>}
          </button>
        </div>
      </div>

      {/* Documentos */}
      <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <FileText className="w-4 h-4" style={{ color: '#7B8AFF' }} />
          <h3 className="text-sm font-semibold text-gray-100">Documentos del Alumno</h3>
        </div>
        <div className="divide-y" style={{ borderColor: '#2A2F3E' }}>
          {DOC_TIPOS.map(tipo => {
            const doc = documentos.find(d => d.tipo === tipo)
            const edit = doc ? docEdits[doc.id] : null
            const isSaving = doc ? savingDoc === doc.id : false

            return (
              <div key={tipo} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-4">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#F1F5F9' }}>{DOC_LABELS[tipo]}</p>
                  {doc ? (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs" style={{ color: '#64748B' }}>{doc.nombre_archivo}</span>
                      <span className="text-xs" style={{ color: '#475569' }}>·</span>
                      <span className="text-xs" style={{ color: '#64748B' }}>
                        {new Date(doc.subido_en).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs mt-1" style={{ color: '#475569' }}>Sin documento</p>
                  )}
                </div>

                {/* Controles admin */}
                {doc && edit ? (
                  <div className="flex flex-col gap-2 w-full sm:w-72 flex-shrink-0">
                    <div className="flex gap-2">
                      {/* Descargar */}
                      {doc.signed_url && (
                        <a
                          href={doc.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0"
                          style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Descargar
                        </a>
                      )}
                      {/* Estado dropdown */}
                      <select
                        value={edit.estado}
                        onChange={e => setDocEdits(prev => ({ ...prev, [doc.id]: { ...prev[doc.id], estado: e.target.value as DocEstado } }))}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                        style={INPUT_STYLE}
                      >
                        <option value="pendiente">⏳ Pendiente</option>
                        <option value="aprobado">✅ Aprobado</option>
                        <option value="rechazado">❌ Rechazado</option>
                      </select>
                    </div>
                    {/* Comentario */}
                    <input
                      type="text"
                      placeholder="Comentario (opcional)"
                      value={edit.comentario}
                      onChange={e => setDocEdits(prev => ({ ...prev, [doc.id]: { ...prev[doc.id], comentario: e.target.value } }))}
                      className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                      style={INPUT_STYLE}
                      onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                      onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                    />
                    {/* Guardar */}
                    <button
                      onClick={() => handleGuardarDoc(doc.id)}
                      disabled={isSaving}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                      style={{ background: '#5B6CFF', color: '#fff' }}
                      onMouseEnter={e => { if (!isSaving) e.currentTarget.style.background = '#7B8AFF' }}
                      onMouseLeave={e => { if (!isSaving) e.currentTarget.style.background = '#5B6CFF' }}
                    >
                      {isSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Guardando...</> : 'Guardar cambios'}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs flex-shrink-0" style={{ color: '#475569' }}>—</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal Cerrar Mes */}
      {modalCerrarMes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={CARD_STYLE}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-100">
                ¿Quitar el Mes {alumno.meses_desbloqueados}?
              </h3>
              <button
                onClick={() => { setModalCerrarMes(false); setCerrarMesError(null) }}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className="rounded-xl p-4 mb-4 space-y-2"
              style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid #2A2F3E' }}
            >
              <p className="text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>
                El alumno perderá acceso al <strong>Mes {alumno.meses_desbloqueados}</strong>.
                Su avance y sus materias acreditadas <strong>se conservan</strong>.
              </p>
              <p className="text-xs pt-1" style={{ color: '#94A3B8' }}>
                Al volver a abrir el mes, lo encontrará tal como lo dejó: no repite exámenes
                ni pierde su constancia.
              </p>
            </div>

            {cerrarMesError && (
              <div
                className="rounded-lg px-3 py-2.5 text-sm mb-4"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}
              >
                {cerrarMesError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setModalCerrarMes(false); setCerrarMesError(null) }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCerrarMes}
                disabled={cerrandoMes}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60 transition-all"
                style={{ background: '#64748B', color: '#fff' }}
                onMouseEnter={e => { if (!cerrandoMes) e.currentTarget.style.background = '#475569' }}
                onMouseLeave={e => { if (!cerrandoMes) e.currentTarget.style.background = '#64748B' }}
              >
                {cerrandoMes
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Quitando...</>
                  : <><Undo2 className="w-4 h-4" />Sí, quitar el mes</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Resetear Contraseña */}
      {modalReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={CARD_STYLE}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-100">Resetear Contraseña</h3>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                  Alumno: {alumno.usuario.nombre_completo}
                </p>
              </div>
              <button
                onClick={() => { setModalReset(false); setResetError(null); setResetSuccess(null); setResetPass({ password: '', confirm: '' }) }}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {resetSuccess ? (
              <div className="space-y-4">
                <div
                  className="rounded-xl p-4 space-y-2"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: '#10B981' }}>✓ Contraseña actualizada</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>
                    La nueva contraseña del alumno es:
                  </p>
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg font-mono text-sm"
                    style={{ background: '#0D1017', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981' }}
                  >
                    <span>{resetSuccess}</span>
                  </div>
                  <p className="text-xs" style={{ color: '#64748B' }}>
                    Comunícale esta contraseña al alumno por teléfono o mensaje.
                  </p>
                </div>
                <button
                  onClick={() => { setModalReset(false); setResetSuccess(null) }}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{ background: '#5B6CFF', color: '#fff' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#7B8AFF' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Nueva contraseña</label>
                  <div className="relative">
                    <input
                      type={showResetPass ? 'text' : 'password'}
                      required
                      placeholder="Mínimo 6 caracteres"
                      value={resetPass.password}
                      onChange={e => setResetPass(p => ({ ...p, password: e.target.value }))}
                      className="w-full pl-3 pr-10 py-2.5 rounded-lg text-sm outline-none"
                      style={INPUT_STYLE}
                      onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                      onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: '#64748B' }}
                      tabIndex={-1}
                    >
                      {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Confirmar contraseña</label>
                  <div className="relative">
                    <input
                      type={showResetConfirm ? 'text' : 'password'}
                      required
                      placeholder="Repite la contraseña"
                      value={resetPass.confirm}
                      onChange={e => setResetPass(p => ({ ...p, confirm: e.target.value }))}
                      className="w-full pl-3 pr-10 py-2.5 rounded-lg text-sm outline-none"
                      style={INPUT_STYLE}
                      onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                      onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: '#64748B' }}
                      tabIndex={-1}
                    >
                      {showResetConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {resetPass.confirm.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: resetPass.password === resetPass.confirm ? '#10B981' : '#EF4444' }}>
                      {resetPass.password === resetPass.confirm ? '✓ Coinciden' : '✗ No coinciden'}
                    </p>
                  )}
                </div>

                {resetError && (
                  <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
                    {resetError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setModalReset(false); setResetError(null); setResetPass({ password: '', confirm: '' }) }}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={resettingPass}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                    style={{ background: '#F59E0B', color: '#000' }}
                    onMouseEnter={e => { if (!resettingPass) e.currentTarget.style.background = '#FBB740' }}
                    onMouseLeave={e => { if (!resettingPass) e.currentTarget.style.background = '#F59E0B' }}
                  >
                    {resettingPass ? <><Loader2 className="w-4 h-4 animate-spin" />Cambiando...</> : <><Key className="w-4 h-4" />Cambiar contraseña</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Confirmar Inscripción Pagada */}
      {modalInscripcion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={CARD_STYLE}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-100">Confirmar pago</h3>
              <button
                onClick={() => setModalInscripcion(false)}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              className="rounded-xl p-4 mb-4 text-center"
              style={{ background: 'rgba(91,108,255,0.08)', border: '1px solid rgba(91,108,255,0.2)' }}
            >
              <p className="text-4xl mb-2">💳</p>
              <p className="text-sm font-medium text-gray-100">
                ¿Confirmas que el alumno pagó su inscripción de{' '}
                <span style={{ color: '#7B8AFF' }}>${config.precios.inscripcion}</span>?
              </p>
              <p className="text-sm font-bold mt-0.5 text-gray-100">
                {alumno.usuario.nombre_completo}
              </p>
            </div>
            <p className="text-xs mb-4 text-center" style={{ color: '#64748B' }}>
              Esto solo marca el pago. Los meses se desbloquean manualmente.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setModalInscripcion(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleMarcarInscripcion}
                disabled={marcandoInscripcion}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60 transition-all"
                style={{ background: '#5B6CFF', color: '#fff' }}
                onMouseEnter={e => { if (!marcandoInscripcion) e.currentTarget.style.background = '#4A5AE0' }}
                onMouseLeave={e => { if (!marcandoInscripcion) e.currentTarget.style.background = '#5B6CFF' }}
              >
                {marcandoInscripcion
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                  : <><CheckCircle2 className="w-4 h-4" /> Confirmar pago</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Desbloqueo */}
      {modalPago && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={CARD_STYLE}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-100">Confirmar desbloqueo</h3>
              <button
                onClick={() => { setModalPago(false); setDesbloquearError(null) }}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mensaje */}
            <div
              className="rounded-xl p-4 mb-4 text-center"
              style={{ background: 'rgba(58,175,169,0.08)', border: '1px solid rgba(58,175,169,0.2)' }}
            >
              <p className="text-4xl mb-2">🔓</p>
              <p className="text-sm font-medium text-gray-100">
                ¿Confirmas abrir el{' '}
                <span style={{ color: '#3AAFA9' }}>Mes {alumno.meses_desbloqueados + 1}</span>
                {' '}para
              </p>
              <p className="text-sm font-bold mt-0.5 text-gray-100">
                {alumno.usuario.nombre_completo}?
              </p>
            </div>

            {desbloquearError && (
              <div className="rounded-lg px-3 py-2.5 text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
                {desbloquearError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setModalPago(false); setDesbloquearError(null) }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDesbloquear}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60 transition-all"
                style={{ background: '#3AAFA9', color: '#fff' }}
                onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = '#2D8C87' }}
                onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = '#3AAFA9' }}
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Desbloqueando...</> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
