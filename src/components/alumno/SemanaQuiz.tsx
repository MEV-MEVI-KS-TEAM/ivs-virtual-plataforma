'use client'

import { useEffect, useState, useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

interface Pregunta {
  id: string
  pregunta: string
  opciones: string[]
  explicacion?: string   // opcional — se muestra cuando la BD lo provee
  orden: number
}

// La respuesta correcta ya no viaja en el GET: el servidor la revela por
// pregunta al verificar (POST { pregunta_id, respuesta }).
interface Correccion {
  es_correcta: boolean
  respuesta_correcta: number
}

interface RespuestaPrevia {
  respuestas: Record<string, number>
  completado_en: string
  correctas?: number   // score calculado server-side (GET con quiz ya contestado)
}

interface SemanaQuizProps {
  semanaId: string
  alumnoId: string
  lang: string
}

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

export default function SemanaQuiz({ semanaId, lang }: SemanaQuizProps) {
  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [respuestaPrevia, setRespuestaPrevia] = useState<RespuestaPrevia | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [seleccionadas, setSeleccionadas] = useState<Record<number, number>>({})
  const [respondidas, setRespondidas] = useState<Record<number, boolean>>({})
  const [correcciones, setCorrecciones] = useState<Record<number, Correccion>>({})
  const [verificando, setVerificando] = useState(false)
  const [correctasFinal, setCorrectasFinal] = useState<number | null>(null)
  const [completado, setCompletado] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cardRef = useRef<HTMLDivElement>(null)
  const preguntaRef = useRef<HTMLDivElement>(null)

  const loc = (es: string, en: string) => lang === 'en' ? en : es

  useEffect(() => {
    fetch(`/api/alumno/quiz/${semanaId}`)
      .then(r => r.json())
      .then(data => {
        setPreguntas(data.preguntas ?? [])
        if (data.respuesta_previa) {
          setRespuestaPrevia(data.respuesta_previa)
          setCompletado(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [semanaId])

  // Animar entrada de cada pregunta
  useGSAP(() => {
    if (preguntaRef.current && !completado) {
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
  const seleccionada = seleccionadas[currentIdx]
  const yaRespondida = respondidas[currentIdx] === true

  const handleOpcion = async (idx: number) => {
    if (yaRespondida || verificando) return
    setVerificando(true)
    setSeleccionadas(prev => ({ ...prev, [currentIdx]: idx }))
    const preguntaIdx = currentIdx
    try {
      const res = await fetch(`/api/alumno/quiz/${semanaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta_id: preguntas[preguntaIdx].id, respuesta: idx }),
      })
      if (res.ok) {
        const data = await res.json()
        setCorrecciones(prev => ({
          ...prev,
          [preguntaIdx]: {
            es_correcta: data.es_correcta === true,
            respuesta_correcta: data.respuesta_correcta,
          },
        }))
      }
    } catch {
      // silencioso — no bloquear al alumno; sin corrección la opción queda neutral
    } finally {
      setRespondidas(prev => ({ ...prev, [preguntaIdx]: true }))
      setVerificando(false)
    }
  }

  const handleNext = async () => {
    if (currentIdx < total - 1) {
      setCurrentIdx(i => i + 1)
    } else {
      await handleSubmit()
    }
  }

  const handlePrev = () => {
    if (currentIdx > 0) setCurrentIdx(i => i - 1)
  }

  const handleSubmit = async () => {
    setGuardando(true)
    const respuestas: Record<string, number> = {}
    preguntas.forEach((p, i) => {
      if (seleccionadas[i] !== undefined) {
        respuestas[p.id] = seleccionadas[i]
      }
    })
    try {
      const res = await fetch(`/api/alumno/quiz/${semanaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas }),
      })
      if (res.ok) {
        const data = await res.json()
        if (typeof data.correctas === 'number') setCorrectasFinal(data.correctas)
      }
      setRespuestaPrevia({ respuestas, completado_en: new Date().toISOString() })
      setCompletado(true)
    } catch {
      // silencioso — no bloquear al alumno
    } finally {
      setGuardando(false)
    }
  }

  // Vista de resultados (quiz completado) — score calificado server-side:
  // del POST recién enviado, del GET (quiz previo) o de las verificaciones por pregunta.
  if (completado) {
    const correct =
      correctasFinal ??
      respuestaPrevia?.correctas ??
      Object.values(correcciones).filter(c => c.es_correcta).length

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

        <div className="space-y-2">
          {(pregunta.opciones as string[]).map((opcion, i) => {
            const esSeleccionada = seleccionada === i
            const esCorrecta = correcciones[currentIdx]?.respuesta_correcta === i

            let bg = 'rgba(255,255,255,0.03)'
            let borderColor = '#2A2F3E'
            let textColor = '#94A3B8'

            // Solo estilizar la opción que eligió el alumno (no “revelar” la correcta sola).
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

        {/* Retroalimentación inmediata (calificada server-side) */}
        {yaRespondida && (
          <div
            className="px-4 py-3 rounded-lg text-sm leading-relaxed"
            style={{
              background: correcciones[currentIdx]?.es_correcta
                ? 'rgba(16,185,129,0.08)'
                : 'rgba(239,68,68,0.08)',
              border: `1px solid ${correcciones[currentIdx]?.es_correcta
                ? 'rgba(16,185,129,0.25)'
                : 'rgba(239,68,68,0.25)'}`,
              color: '#CBD5E1',
            }}
          >
            <span className="font-semibold mr-1">
              {correcciones[currentIdx]?.es_correcta ? '✓' : '✗'}
            </span>
            {pregunta.explicacion
              ? pregunta.explicacion
              : correcciones[currentIdx]?.es_correcta
                ? '¡Correcto!'
                : 'Incorrecto'}
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

        {yaRespondida && (
          <button
            onClick={handleNext}
            disabled={guardando}
            className="px-4 py-1.5 text-xs rounded-lg font-semibold transition-all disabled:opacity-60"
            style={{ background: '#6366F1', color: '#fff', border: 'none' }}
          >
            {guardando
              ? '...'
              : currentIdx === total - 1
                ? loc('Ver resultado →', 'See results →')
                : loc('Siguiente →', 'Next →')}
          </button>
        )}
      </div>
    </div>
  )
}
