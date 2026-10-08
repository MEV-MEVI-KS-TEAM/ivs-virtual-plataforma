'use client'

import { useEffect, useState, useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

/**
 * Quiz de refuerzo de la semana. Ronda 2 de seguridad (port de D22d-1 de la
 * plantilla): la pregunta llega SIN la respuesta correcta ni la explicación;
 * cada respuesta se manda al servidor, que califica, GUARDA la primera y
 * devuelve el veredicto de ESA pregunta ({ es_correcta, explicacion }). La
 * primera respuesta es la que cuenta (el servidor la bloquea), así que el
 * avance sobrevive a una recarga y no hay envío final.
 */
interface Pregunta {
  id: string
  pregunta: string
  opciones: string[]
  orden: number
}

/** Veredicto del servidor para una pregunta ya contestada. Nunca trae la opción correcta. */
interface Resultado {
  tu_respuesta: number
  es_correcta: boolean
  explicacion?: string
}

interface SemanaQuizProps {
  semanaId: string
  /** Reservado; el API usa la sesión del servidor. */
  alumnoId?: string
  lang: string
}

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

export default function SemanaQuiz({ semanaId, lang }: SemanaQuizProps) {
  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [resultados, setResultados] = useState<Record<string, Resultado>>({})
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  // Opción tocada mientras el servidor responde (solo para resaltarla en neutral).
  const [pendiente, setPendiente] = useState<number | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [errorVerif, setErrorVerif] = useState<string | null>(null)
  const [verResumen, setVerResumen] = useState(false)

  const cardRef = useRef<HTMLDivElement>(null)
  const preguntaRef = useRef<HTMLDivElement>(null)
  // Candado síncrono: dos toques en el mismo tick no alcanzan a ver `verificando`.
  const verificacionEnVuelo = useRef(false)

  const loc = (es: string, en: string) => lang === 'en' ? en : es

  useEffect(() => {
    fetch(`/api/alumno/quiz/${semanaId}`)
      .then(async r => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(data => {
        const lista: Pregunta[] = Array.isArray(data?.preguntas) ? data.preguntas : []
        const res: Record<string, Resultado> =
          data?.resultados && typeof data.resultados === 'object' ? data.resultados : {}
        setPreguntas(lista)
        setResultados(res)
        if (data?.completado) setVerResumen(true)
        else {
          // Arranca en la primera pregunta sin contestar.
          const i = lista.findIndex(p => !res[p.id])
          if (i > 0) setCurrentIdx(i)
        }
      })
      .catch(() => setErrorCarga(true))
      .finally(() => setLoading(false))
  }, [semanaId])

  // Animar entrada de cada pregunta
  useGSAP(() => {
    if (preguntaRef.current && !verResumen) {
      gsap.fromTo(
        preguntaRef.current,
        { opacity: 0, x: 20 },
        { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' }
      )
    }
  }, { dependencies: [currentIdx], scope: cardRef })

  if (loading) {
    return (
      <div className="rounded-xl p-4 mt-2 flex items-center gap-2 text-xs" style={CARD}>
        <span style={{ color: '#94A3B8' }}>{loc('Cargando refuerzo…', 'Loading practice…')}</span>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="rounded-xl p-4 mt-2 text-xs leading-relaxed" style={CARD}>
        <p role="alert" style={{ color: '#94A3B8' }}>
          {loc('No se pudo cargar el quiz de refuerzo. Recarga la página para intentarlo de nuevo.',
            "The practice quiz couldn't load. Reload the page to try again.")}
        </p>
      </div>
    )
  }

  if (preguntas.length === 0) {
    return (
      <div className="rounded-xl p-4 mt-2 text-xs leading-relaxed" style={CARD}>
        <p className="font-semibold mb-1" style={{ color: '#94A3B8' }}>
          {loc('Quiz de refuerzo', 'Practice quiz')}
        </p>
        <p style={{ color: '#64748B' }}>
          {loc(
            'Aún no hay preguntas para esta semana. Tu avance no se ve afectado.',
            'No practice questions for this week yet. Your progress is not affected.',
          )}
        </p>
      </div>
    )
  }

  const pregunta = preguntas[currentIdx]
  const total = preguntas.length
  // Solo hay veredicto si el SERVIDOR lo dio: sin veredicto no hay rojo ni ✗.
  const resultado = resultados[pregunta.id]
  const yaRespondida = resultado !== undefined
  const todasContestadas = preguntas.every(p => resultados[p.id])

  // Reintentar es seguro: el servidor guarda solo la PRIMERA respuesta de cada
  // pregunta y, si ya la tenía, devuelve ese mismo veredicto (candado).
  // 'red' = no llegó respuesta (se reintenta una vez); 'sesion' = 401 o HTML de /login;
  // 'error' = otro 4xx (reintentar no cambia nada).
  type Verificacion = { tipo: 'ok'; resultado: Resultado } | { tipo: 'red' | 'sesion' | 'error' }
  const verificar = async (preguntaId: string, idx: number): Promise<Verificacion> => {
    for (let intento = 0; intento < 2; intento++) {
      const control = new AbortController()
      const corte = setTimeout(() => control.abort(), 10_000)
      try {
        const res = await fetch(`/api/alumno/quiz/${semanaId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pregunta_id: preguntaId, respuesta: idx }),
          signal: control.signal,
        })
        const ct = res.headers.get('content-type') ?? ''
        // Un redirect a /login (sesión vencida) llega como HTML con 200: no es veredicto.
        if (res.status === 401 || (res.ok && !ct.includes('application/json'))) return { tipo: 'sesion' }
        if (res.ok) {
          const data = await res.json()
          if (typeof data?.es_correcta === 'boolean') {
            return {
              tipo: 'ok',
              resultado: {
                // Si ya estaba contestada, cuenta la respuesta GUARDADA, no la tocada ahora.
                tu_respuesta: typeof data.tu_respuesta === 'number' ? data.tu_respuesta : idx,
                es_correcta: data.es_correcta,
                explicacion: typeof data.explicacion === 'string' ? data.explicacion : undefined,
              },
            }
          }
        } else if (res.status >= 400 && res.status < 500) {
          return { tipo: 'error' }
        }
      } catch {
        // red caída, respuesta perdida o más de 10 s sin respuesta: se reintenta una vez
      } finally {
        clearTimeout(corte)
      }
    }
    return { tipo: 'red' }
  }

  const handleOpcion = async (idx: number) => {
    if (yaRespondida || verificando || verificacionEnVuelo.current) return
    verificacionEnVuelo.current = true
    setVerificando(true)
    setErrorVerif(null)
    setPendiente(idx)
    const preguntaId = pregunta.id
    try {
      const r = await verificar(preguntaId, idx)
      if (r.tipo === 'ok') {
        setResultados(prev => ({ ...prev, [preguntaId]: r.resultado }))
      } else {
        // Sin veredicto la opción vuelve a neutral y el alumno puede volver a tocarla.
        setErrorVerif(
          r.tipo === 'sesion'
            ? loc('Tu sesión expiró. Vuelve a iniciar sesión para seguir con el quiz.',
                'Your session expired. Sign in again to continue the quiz.')
            : r.tipo === 'error'
              ? loc('No pudimos revisar tu respuesta. Inténtalo de nuevo en un momento.',
                  "We couldn't check your answer. Try again in a moment.")
              : loc('No pudimos revisar tu respuesta. Revisa tu conexión y vuelve a tocarla.',
                  "We couldn't check your answer. Check your connection and tap it again."),
        )
      }
    } finally {
      verificacionEnVuelo.current = false
      setVerificando(false)
      setPendiente(null)
    }
  }

  const handleNext = () => {
    setErrorVerif(null)
    if (currentIdx < total - 1) setCurrentIdx(i => i + 1)
    else if (todasContestadas) setVerResumen(true)
  }

  const handlePrev = () => {
    setErrorVerif(null)
    if (currentIdx > 0) setCurrentIdx(i => i - 1)
  }

  // Vista de resultados (quiz completado): el conteo sale de los veredictos del servidor.
  if (verResumen) {
    const correct = preguntas.filter(p => resultados[p.id]?.es_correcta).length

    return (
      <div className="rounded-xl p-5 space-y-3 mt-2" style={CARD}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
              {loc('Comprueba lo que aprendiste', 'Check what you learned')}
            </p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              {loc('No afecta tu calificación', "Doesn't affect your grade")}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-4">
          <div className="text-center">
            <div
              className="text-3xl font-bold mb-1"
              style={{ color: correct === total ? '#10B981' : '#F1F5F9' }}
            >
              {correct}/{total}
            </div>
            <p className="text-sm" style={{ color: '#94A3B8' }}>
              {loc(`¡${correct} de ${total} correctas!`, `${correct} out of ${total} correct!`)}
            </p>
          </div>
        </div>
        <div className="flex justify-center">
          <button
            onClick={() => { setVerResumen(false); setCurrentIdx(0) }}
            className="px-3 py-1.5 text-xs rounded-lg"
            style={{ border: '1px solid #2A2F3E', color: '#94A3B8', background: 'transparent' }}
          >
            {loc('Repasar respuestas', 'Review answers')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={cardRef} className="rounded-xl p-5 space-y-4 mt-2" style={CARD}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
            {loc('Comprueba lo que aprendiste', 'Check what you learned')}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            {loc('No afecta tu calificación', "Doesn't affect your grade")}
          </p>
        </div>
        <span
          className="text-xs px-2 py-1 rounded-full flex-shrink-0"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#818CF8' }}
        >
          {loc(`${currentIdx + 1} de ${total}`, `${currentIdx + 1} of ${total}`)}
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#2A2F3E' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${((currentIdx + 1) / total) * 100}%`, background: '#6366F1' }}
        />
      </div>

      {/* Pregunta + opciones */}
      <div ref={preguntaRef} className="space-y-3">
        <p className="text-sm font-medium leading-relaxed" style={{ color: '#E2E8F0' }}>
          {pregunta.pregunta}
        </p>

        <div className="space-y-2" aria-busy={verificando}>
          {pregunta.opciones.map((opcion, i) => {
            // Con veredicto: la opción que cuenta es la GUARDADA por el servidor.
            const esSeleccionada = yaRespondida ? resultado.tu_respuesta === i : pendiente === i
            // El color sale del veredicto del servidor, no de comparar índices.
            const esCorrecta = resultado?.es_correcta === true

            let bg = 'rgba(255,255,255,0.03)'
            let borderColor = '#2A2F3E'
            let textColor = '#94A3B8'

            // Solo estilizar la opción que eligió el alumno (la correcta no se
            // revela: el servidor ni siquiera la manda).
            if (yaRespondida) {
              if (esSeleccionada) {
                if (esCorrecta) {
                  bg = 'rgba(16,185,129,0.1)'
                  borderColor = '#10B981'
                  textColor = '#86EFAC'
                } else {
                  bg = 'rgba(239,68,68,0.1)'
                  borderColor = '#EF4444'
                  textColor = '#FCA5A5'
                }
              }
            } else if (esSeleccionada) {
              bg = 'rgba(99,102,241,0.15)'
              borderColor = '#6366F1'
              textColor = '#E2E8F0'
            }

            return (
              <button
                key={i}
                onClick={() => handleOpcion(i)}
                disabled={yaRespondida}
                className="w-full text-left px-4 py-3 rounded-lg text-sm transition-all"
                style={{
                  background: bg,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                  cursor: yaRespondida ? 'default' : 'pointer',
                }}
              >
                <span
                  className="font-semibold mr-2"
                  style={{
                    color:
                      yaRespondida && esSeleccionada && esCorrecta
                        ? '#10B981'
                        : yaRespondida && esSeleccionada
                          ? '#EF4444'
                          : '#6366F1',
                  }}
                >
                  {String.fromCharCode(65 + i)}.
                </span>
                {opcion}
              </button>
            )
          })}
        </div>

        {errorVerif && !yaRespondida && (
          <p role="alert" className="text-xs" style={{ color: '#FCD34D' }}>{errorVerif}</p>
        )}

        {/* Retroalimentación: el veredicto del servidor, solo de esta pregunta */}
        {yaRespondida && (
          <div
            className="px-4 py-3 rounded-lg text-sm leading-relaxed"
            style={{
              background: resultado.es_correcta ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${resultado.es_correcta ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
              color: '#CBD5E1',
            }}
          >
            <span className="font-semibold mr-1">{resultado.es_correcta ? '✓' : '✗'}</span>
            {resultado.explicacion
              ? resultado.explicacion
              : resultado.es_correcta
                ? loc('¡Correcto!', 'Correct!')
                : loc('Incorrecto', 'Incorrect')}
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={handlePrev}
          disabled={currentIdx === 0}
          className="px-3 py-1.5 text-xs rounded-lg transition-all disabled:opacity-30"
          style={{ border: '1px solid #2A2F3E', color: '#94A3B8', background: 'transparent' }}
        >
          ← {loc('Anterior', 'Previous')}
        </button>

        {yaRespondida && (currentIdx < total - 1 || todasContestadas) && (
          <button
            onClick={handleNext}
            className="px-4 py-1.5 text-xs rounded-lg font-semibold transition-all"
            style={{ background: '#6366F1', color: '#fff', border: 'none' }}
          >
            {currentIdx === total - 1
              ? loc('Ver resultado →', 'See results →')
              : loc('Siguiente →', 'Next →')}
          </button>
        )}
      </div>
    </div>
  )
}
