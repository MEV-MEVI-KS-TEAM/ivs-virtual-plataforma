'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle, XCircle, Clock, Loader2, Lock } from 'lucide-react'
import FadeIn from '@/components/ui/FadeIn'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

type Estado = 'Acreditada' | 'No acreditada' | 'Pendiente' | 'Bloqueada'

interface MateriaCalif {
  materia_id: string
  codigo: string
  nombre_materia: string
  mes_numero: number
  estado: Estado
}

interface Resumen {
  total_materias_plan: number
  materias_acreditadas: number
  materias_no_acreditadas: number
  materias_pendientes: number
}

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

const BADGE: Record<Estado, React.CSSProperties> = {
  'Acreditada':    { background: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' },
  'No acreditada': { background: 'rgba(239,68,68,0.15)',  color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' },
  'Pendiente':     { background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' },
  'Bloqueada':     { background: 'rgba(148,163,184,0.12)', color: '#94A3B8', border: '1px solid #2A2F3E' },
}

const BORDER_COLOR: Record<Estado, string> = {
  'Acreditada':    '#10B981',
  'No acreditada': '#EF4444',
  'Pendiente':     '#F59E0B',
  'Bloqueada':     '#475569',
}

const ICON_BG: Record<Estado, string> = {
  'Acreditada':    'rgba(16,185,129,0.15)',
  'No acreditada': 'rgba(239,68,68,0.15)',
  'Pendiente':     'rgba(245,158,11,0.15)',
  'Bloqueada':     'rgba(148,163,184,0.12)',
}

const ESTADO_LABEL: Record<Estado, string> = {
  'Acreditada':    'Acreditada',
  'No acreditada': 'No acreditada',
  'Pendiente':     'Pendiente',
  'Bloqueada':     'Bloqueada',
}

function EstadoIcon({ estado }: { estado: Estado }) {
  if (estado === 'Acreditada')    return <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />
  if (estado === 'No acreditada') return <XCircle    className="w-4 h-4" style={{ color: '#EF4444' }} />
  if (estado === 'Bloqueada')     return <Lock       className="w-4 h-4" style={{ color: '#94A3B8' }} />
  return <Clock className="w-4 h-4" style={{ color: '#F59E0B' }} />
}

export default function CalificacionesPage() {
  const [materias, setMaterias] = useState<MateriaCalif[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refAcreditadas    = useRef<HTMLParagraphElement>(null)
  const refNoAcreditadas  = useRef<HTMLParagraphElement>(null)
  const refPendientes     = useRef<HTMLParagraphElement>(null)

  useGSAP(() => {
    if (!resumen) return
    const animate = (ref: React.RefObject<HTMLParagraphElement>, target: number) => {
      const obj = { val: 0 }
      gsap.to(obj, {
        val: target,
        duration: 1,
        ease: 'power2.out',
        onUpdate: () => {
          if (ref.current) ref.current.textContent = Math.round(obj.val).toString()
        },
      })
    }
    animate(refAcreditadas,   resumen.materias_acreditadas)
    animate(refNoAcreditadas, resumen.materias_no_acreditadas)
    animate(refPendientes,    resumen.materias_pendientes)
  }, { dependencies: [resumen] })

  useEffect(() => {
    fetch('/api/alumno/calificaciones')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setMaterias(data.materias ?? [])
        setResumen(data.resumen)
      })
      .catch(() => setError('Error al cargar calificaciones'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
    </div>
  )

  const porMes = materias
    .slice()
    .sort((a, b) => a.mes_numero - b.mes_numero)
    .reduce<Record<number, MateriaCalif[]>>((acc, m) => {
      if (!acc[m.mes_numero]) acc[m.mes_numero] = []
      acc[m.mes_numero].push(m)
      return acc
    }, {})

  return (
    <div className="space-y-6 max-w-4xl">

      <FadeIn delay={0}>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Mis Calificaciones</h2>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Estado de acreditación por materia</p>
        </div>
      </FadeIn>

      {error ? (
        <div className="rounded-xl p-6 text-center" style={CARD}>
          <p className="text-sm" style={{ color: '#EF4444' }}>{error}</p>
        </div>
      ) : (
        <>
          {resumen && (
            <FadeIn delay={100}>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl p-3 sm:p-5 flex items-center gap-4" style={CARD}>
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                    style={{ background: 'rgba(16,185,129,0.15)' }}>
                    <CheckCircle className="w-5 h-5" style={{ color: '#10B981' }} />
                  </div>
                  <div>
                    <p ref={refAcreditadas} className="text-xl sm:text-2xl font-bold" style={{ color: '#10B981' }}>0</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>Acreditadas</p>
                  </div>
                </div>

                <div className="rounded-xl p-3 sm:p-5 flex items-center gap-4" style={CARD}>
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                    style={{ background: 'rgba(239,68,68,0.15)' }}>
                    <XCircle className="w-5 h-5" style={{ color: '#EF4444' }} />
                  </div>
                  <div>
                    <p ref={refNoAcreditadas} className="text-xl sm:text-2xl font-bold" style={{ color: '#EF4444' }}>0</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>No acreditadas</p>
                  </div>
                </div>

                <div className="rounded-xl p-3 sm:p-5 flex items-center gap-4" style={CARD}>
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                    style={{ background: 'rgba(245,158,11,0.15)' }}>
                    <Clock className="w-5 h-5" style={{ color: '#F59E0B' }} />
                  </div>
                  <div>
                    <p ref={refPendientes} className="text-xl sm:text-2xl font-bold" style={{ color: '#F59E0B' }}>0</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>Pendientes</p>
                  </div>
                </div>
              </div>
            </FadeIn>
          )}

          <FadeIn delay={200}>
            {materias.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl" style={CARD}>
                <Clock className="w-10 h-10" style={{ color: '#2A2F3E' }} />
                <p className="text-sm" style={{ color: '#94A3B8' }}>No hay materias disponibles aún</p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(porMes).map(([mes, items]) => (
                  <div key={mes} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-semibold tracking-widest uppercase whitespace-nowrap"
                        style={{ color: '#475569' }}>
                        Mes {mes}
                      </p>
                      <div className="flex-1 h-px" style={{ background: '#2A2F3E' }} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {items.map(m => (
                        <div
                          key={m.materia_id}
                          className="flex items-center flex-wrap gap-4 rounded-xl p-4 transition-transform duration-200 hover:scale-[1.01]"
                          style={{
                            background: '#181C26',
                            border: '1px solid #2A2F3E',
                            borderLeft: `3px solid ${BORDER_COLOR[m.estado]}`,
                          }}
                        >
                          <div
                            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                            style={{ background: ICON_BG[m.estado] }}
                          >
                            <EstadoIcon estado={m.estado} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-xs mb-0.5" style={{ color: '#64748B' }}>{m.codigo}</p>
                            <p className="text-sm font-medium leading-snug" style={{ color: '#F1F5F9' }}>
                              {m.nombre_materia}
                            </p>
                          </div>

                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 mt-1"
                            style={BADGE[m.estado]}
                          >
                            {ESTADO_LABEL[m.estado]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FadeIn>
        </>
      )}
    </div>
  )
}
