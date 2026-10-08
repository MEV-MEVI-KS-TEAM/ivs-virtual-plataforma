'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useToast, ToastContainer } from '@/components/ui/toast'

interface Pregunta {
  id: string
  numero: number
  texto: string
  texto_en: string
  tipo: 'OPCION_MULTIPLE' | 'VERDADERO_FALSO'
  opciones: string[]
  opciones_en: string[]
  puntos: number
}

interface EvaluacionInfo {
  id: string
  titulo: string
  titulo_en: string
  tipo: string
  intentos_max: number
}

// El servidor NUNCA manda cuál era la opción correcta (ronda 2 de seguridad).
// `es_correcta` solo llega cuando el examen se cierra (aprobó o último intento).
interface DetalleRespuesta {
  pregunta_id: string
  numero: number
  texto: string
  texto_en: string
  tipo: string
  opciones: string[]
  opciones_en: string[]
  respuesta_alumno: number
  contestada?: boolean
  es_correcta?: boolean
  retroalimentacion: string
}

interface Resultado {
  calificacion: number
  aprobado: boolean
  total_preguntas: number
  correctas: number
  intento_numero: number
  intentos_restantes?: number
  /** true = el examen se cerró con este envío y el detalle trae el ✓/✗. */
  revision_completa?: boolean
  detalle: DetalleRespuesta[]
}

type Estado = 'loading' | 'quiz' | 'enviando' | 'resultado' | 'cerrado' | 'error'

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

export default function EvaluacionPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const { toasts, showToast, removeToast } = useToast()

  const [estado, setEstado] = useState<Estado>('loading')
  const [evaluacion, setEvaluacion] = useState<EvaluacionInfo | null>(null)
  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [intentosUsados, setIntentosUsados] = useState(0)
  const [preguntaActual, setPreguntaActual] = useState(0)
  const [respuestas, setRespuestas] = useState<Record<string, number>>({})
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmarEnvio, setConfirmarEnvio] = useState(false)
  const [motivoCerrado, setMotivoCerrado] = useState<'aprobada' | 'sin_intentos' | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/alumno/evaluacion/${id}`)
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data.error ?? 'Error al cargar el examen'); setEstado('error'); return }
      setEvaluacion(data.evaluacion)
      setPreguntas(data.preguntas ?? [])
      setIntentosUsados(data.intentos_usados)
      // Aprobar cierra el examen; sin intentos, también. El servidor ya no
      // sirve las preguntas en esos casos.
      if (data.estado === 'aprobada' || data.estado === 'sin_intentos') {
        setMotivoCerrado(data.estado)
        setEstado('cerrado')
        return
      }
      setEstado('quiz')
    } catch {
      setErrorMsg('Error inesperado al cargar el examen')
      setEstado('error')
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  function seleccionarRespuesta(preguntaId: string, indice: number) {
    setRespuestas(prev => ({ ...prev, [preguntaId]: indice }))
  }

  async function enviarExamen() {
    setConfirmarEnvio(false)
    setEstado('enviando')
    try {
      const res = await fetch(`/api/alumno/evaluacion/${id}/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data.error ?? 'Error al enviar'); setEstado('error'); return }
      setResultado(data)
      setEstado('resultado')
      showToast(`Examen enviado. Calificación: ${(data.calificacion as number).toFixed(1)}`, data.aprobado ? 'success' : 'info')
    } catch {
      setErrorMsg('Error inesperado al enviar el examen')
      setEstado('error')
    }
  }

  const pregunta = preguntas[preguntaActual]
  const totalContestadas = preguntas.filter(p => respuestas[p.id] !== undefined).length
  const todasContestadas = totalContestadas === preguntas.length && preguntas.length > 0

  // ── LOADING ──
  if (estado === 'loading' || estado === 'enviando') return (
    <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#5B6CFF' }} />
      <p className="text-sm" style={{ color: '#94A3B8' }}>
        {estado === 'enviando' ? 'Calificando...' : 'Cargando examen...'}
      </p>
    </div>
  )

  // ── ERROR ──
  if (estado === 'error') return (
    <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
      <AlertCircle className="w-10 h-10" style={{ color: '#EF4444' }} />
      <p className="text-sm font-medium" style={{ color: '#EF4444' }}>{errorMsg}</p>
      <button onClick={() => router.back()} className="text-sm" style={{ color: '#5B6CFF' }}>Regresar</button>
    </div>
  )

  // ── CERRADO: ya aprobó o ya no tiene intentos ──
  if (estado === 'cerrado') return (
    <div className="flex flex-col items-center justify-center min-h-[500px] gap-4 text-center px-4">
      {motivoCerrado === 'aprobada'
        ? <CheckCircle className="w-10 h-10" style={{ color: '#10B981' }} />
        : <AlertCircle className="w-10 h-10" style={{ color: '#F59E0B' }} />}
      <p className="text-sm font-medium" style={{ color: '#F1F5F9' }}>
        {motivoCerrado === 'aprobada'
          ? 'Ya aprobaste este examen.'
          : `Ya usaste tus ${evaluacion?.intentos_max ?? ''} intentos de este examen.`}
      </p>
      <button onClick={() => router.back()} className="text-sm" style={{ color: '#5B6CFF' }}>Volver a la materia</button>
    </div>
  )

  // ── RESULTADO ──
  if (estado === 'resultado' && resultado) {
    const pct = Math.round((resultado.correctas / resultado.total_preguntas) * 100)
    const intentosRestantes = resultado.intentos_restantes
      ?? (evaluacion ? evaluacion.intentos_max - resultado.intento_numero : 0)
    const revisionCompleta = resultado.revision_completa === true

    return (
      <div className="space-y-4 max-w-3xl">
        <ToastContainer toasts={toasts} onClose={removeToast} />
        {/* Card calificación */}
        <div className="rounded-2xl p-5 sm:p-8 text-center" style={CARD}>
          <p className="text-sm font-medium mb-3" style={{ color: '#94A3B8' }}>
            {evaluacion ? evaluacion.titulo : ''}
          </p>
          <div
            className="text-6xl sm:text-7xl font-black mb-3"
            style={{ color: resultado.aprobado ? '#10B981' : '#EF4444' }}
          >
            {resultado.calificacion.toFixed(1)}
          </div>
          <span
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold"
            style={resultado.aprobado
              ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
              : { background: 'rgba(239,68,68,0.15)', color: '#EF4444' }
            }
          >
            {resultado.aprobado ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {resultado.aprobado ? 'Aprobado' : 'No aprobado'}
          </span>

          <div className="flex items-center justify-center gap-4 sm:gap-8 mt-5 pt-5" style={{ borderTop: '1px solid #2A2F3E' }}>
            <div>
              <p className="text-xl sm:text-2xl font-bold" style={{ color: '#F1F5F9' }}>
                {resultado.correctas}/{resultado.total_preguntas}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Correctas</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold" style={{ color: '#F1F5F9' }}>{pct}%</p>
              <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Porcentaje</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold" style={{ color: '#F1F5F9' }}>
                {resultado.intento_numero}/{evaluacion?.intentos_max}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Intento</p>
            </div>
          </div>

          {/* Barra progreso */}
          <div className="h-2 rounded-full overflow-hidden mt-5" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: resultado.aprobado ? '#10B981' : '#EF4444' }}
            />
          </div>
        </div>

        {/* Botones */}
        <div className="flex flex-col sm:flex-row gap-3">
          {!resultado.aprobado && intentosRestantes > 0 ? (
            <button
              onClick={() => {
                setRespuestas({})
                setPreguntaActual(0)
                setResultado(null)
                setIntentosUsados(resultado.intento_numero)
                setEstado('quiz')
              }}
              className="w-full sm:flex-1 py-3 rounded-lg text-sm font-semibold transition-all"
              style={{ background: '#5B6CFF', color: '#fff' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#7B8AFF' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
            >
              Reintentar ({intentosRestantes} {intentosRestantes !== 1 ? 'restantes' : 'restante'})
            </button>
          ) : null}
          <button
            onClick={() => router.back()}
            className="w-full sm:flex-1 py-3 rounded-lg text-sm font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
          >
            Volver a la materia
          </button>
        </div>

        {/* Detalle por pregunta */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: '#94A3B8' }}>Revisión de respuestas</h3>
          {revisionCompleta ? (
            <p className="text-xs leading-relaxed px-1" style={{ color: '#94A3B8' }}>
              Te marcamos qué preguntas acertaste y cuáles fallaste. Repasa en el contenido de la
              materia los temas de las que fallaste.
            </p>
          ) : (
            <p className="text-xs leading-relaxed px-1" style={{ color: '#F59E0B' }}>
              Verás qué preguntas acertaste cuando apruebes o uses tu último intento. Por ahora,
              repasa los temas antes de volver a presentar.
            </p>
          )}
          {resultado.detalle.map((d, i) => (
            <div key={d.pregunta_id} className="rounded-xl overflow-hidden" style={CARD}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid #2A2F3E' }}>
                <div className="flex items-start gap-3">
                  {d.es_correcta === undefined
                    ? <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#475569' }} />
                    : d.es_correcta
                      ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#10B981' }} />
                      : <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
                  }
                  <p className="text-sm font-medium" style={{ color: '#F1F5F9' }}>
                    <span style={{ color: '#94A3B8' }}>{i + 1}. </span>{d.texto}
                  </p>
                </div>
              </div>
              <div className="px-5 py-4 space-y-2">
                {d.opciones.map((op, idx) => {
                  // Solo se marca la opción que eligió el alumno: la correcta no
                  // se revela (el servidor ni siquiera la manda).
                  const esAlumno = idx === d.respuesta_alumno
                  let style = { background: 'transparent', border: '1px solid #2A2F3E', color: '#94A3B8' as string }
                  if (esAlumno && d.es_correcta === true) style = { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', color: '#10B981' }
                  if (esAlumno && d.es_correcta === false) style = { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444' }
                  if (esAlumno && d.es_correcta === undefined) style = { background: 'rgba(255,255,255,0.05)', border: '1px solid #475569', color: '#F1F5F9' }

                  return (
                    <div key={idx} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm" style={style}>
                      <span className="font-mono text-xs w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.06)' }}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="flex-1">{op}</span>
                      {esAlumno && <span className="text-xs font-semibold">Tu respuesta</span>}
                    </div>
                  )
                })}

                {!(d.contestada ?? d.respuesta_alumno >= 0) && (
                  <p className="text-xs pt-1" style={{ color: '#F59E0B' }}>
                    No la contestaste: cuenta como incorrecta.
                  </p>
                )}

                {d.retroalimentacion && (
                  <div className="mt-2 px-3 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2A2F3E', color: '#94A3B8' }}>
                    <span className="font-semibold" style={{ color: '#5B6CFF' }}>Retroalimentación: </span>
                    {d.retroalimentacion}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── QUIZ ──
  if (estado !== 'quiz' || !pregunta) return null

  return (
    <div className="max-w-2xl space-y-4">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => router.back()}
            className="p-2.5 rounded-lg transition-all flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: '#F1F5F9' }}>{evaluacion ? evaluacion.titulo : ''}</p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              {preguntaActual + 1} / {preguntas.length}
            </p>
          </div>
        </div>
        <span className="text-xs px-2 py-1 rounded flex-shrink-0" style={{ background: 'rgba(91,108,255,0.15)', color: '#7B8AFF' }}>
          Intento {intentosUsados + 1}/{evaluacion?.intentos_max}
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${((preguntaActual + 1) / preguntas.length) * 100}%`, background: '#5B6CFF' }}
        />
      </div>

      {/* Card pregunta */}
      <div className="rounded-2xl p-4 sm:p-6 space-y-4" style={CARD}>
        <p className="text-sm sm:text-base font-semibold leading-relaxed" style={{ color: '#F1F5F9' }}>
          {pregunta.texto}
        </p>

        <div className="space-y-2.5">
          {pregunta.opciones.map((opcion, idx) => {
            const seleccionada = respuestas[pregunta.id] === idx
            return (
              <button
                key={idx}
                onClick={() => seleccionarRespuesta(pregunta.id, idx)}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-xl text-sm text-left transition-all duration-150"
                style={{
                  minHeight: '52px',
                  background: seleccionada ? 'rgba(91,108,255,0.15)' : 'rgba(255,255,255,0.03)',
                  border: seleccionada ? '2px solid #5B6CFF' : '1px solid #2A2F3E',
                  color: seleccionada ? '#F1F5F9' : '#94A3B8',
                }}
              >
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0"
                  style={{
                    background: seleccionada ? '#5B6CFF' : 'rgba(255,255,255,0.06)',
                    color: seleccionada ? '#fff' : '#94A3B8',
                  }}
                >
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="flex-1 leading-snug">{opcion}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Indicador de preguntas */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1.5 min-w-max px-0.5">
          {preguntas.map((p, idx) => {
            const contestada = respuestas[p.id] !== undefined
            const esActual = idx === preguntaActual
            return (
              <button
                key={p.id}
                onClick={() => setPreguntaActual(idx)}
                className="w-8 h-8 rounded-full text-xs font-bold flex-shrink-0 transition-all"
                style={{
                  background: esActual ? '#5B6CFF' : contestada ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                  color: esActual ? '#fff' : contestada ? '#10B981' : '#475569',
                  border: esActual ? '2px solid #5B6CFF' : contestada ? '1px solid rgba(16,185,129,0.4)' : '1px solid #2A2F3E',
                }}
              >
                {idx + 1}
              </button>
            )
          })}
        </div>
      </div>

      {/* Navegación */}
      <div className="flex gap-3">
        <button
          onClick={() => setPreguntaActual(p => p - 1)}
          disabled={preguntaActual === 0}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Anterior
        </button>

        {preguntaActual < preguntas.length - 1 ? (
          <button
            onClick={() => setPreguntaActual(p => p + 1)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all"
            style={{ background: '#5B6CFF', color: '#fff' }}
          >
            Siguiente
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : todasContestadas ? (
          <button
            onClick={() => setConfirmarEnvio(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all"
            style={{ background: '#10B981', color: '#fff' }}
          >
            Enviar examen
          </button>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs text-center" style={{ color: '#94A3B8' }}>
              {preguntas.length - totalContestadas} sin responder
            </span>
          </div>
        )}
      </div>

      {/* Modal confirmación */}
      {confirmarEnvio && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={CARD}>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 flex-shrink-0" style={{ color: '#F59E0B' }} />
              <h3 className="text-base font-bold" style={{ color: '#F1F5F9' }}>¿Enviar examen?</h3>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#94A3B8' }}>
              ¿Estás seguro de que deseas enviar?{' '}
              <strong style={{ color: '#F1F5F9' }}>Esta acción no se puede deshacer.</strong>
            </p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              Respondidas: <strong style={{ color: '#F1F5F9' }}>{totalContestadas}/{preguntas.length}</strong>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmarEnvio(false)}
                className="flex-1 py-3 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
              >
                Cancelar
              </button>
              <button
                onClick={enviarExamen}
                className="flex-1 py-3 rounded-lg text-sm font-semibold"
                style={{ background: '#10B981', color: '#fff' }}
              >
                Sí, enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
