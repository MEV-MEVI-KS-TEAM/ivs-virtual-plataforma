'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  GraduationCap, Bell, CheckCircle2, ChevronRight,
} from 'lucide-react'
import { useToast, ToastContainer } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import BadgesGrid from '@/components/alumno/BadgesGrid'
import { CONFIG } from '@/lib/config'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Perfil {
  id:                  string
  matricula:           string
  meses_desbloqueados: number
  inscripcion_pagada:  boolean
  plan_nombre:         string
  duracion_meses:      number
  nombre_completo:     string
  email:               string
  nivel?:              string
}

interface MateriaResumen {
  id:        string
  codigo:    string
  nombre:    string
  color_hex: string
}

interface Mes {
  id:          string
  /** La API sirve ambos; `numero_mes` queda por compatibilidad con el payload viejo. */
  numero?:     number
  numero_mes?: number
  titulo:      string
  desbloqueado: boolean
  materias:    MateriaResumen[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre']

function getFechaLarga() {
  const d = new Date()
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  return `${dias[d.getDay()]}, ${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  emoji, label, value, sub, extra, accentColor = '#3AAFA9',
}: {
  emoji:       string
  label:       string
  value:       React.ReactNode
  sub?:        string
  extra?:      React.ReactNode
  accentColor?: string
}) {
  return (
    <div className="rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center gap-2"
      style={{ background: '#fff', border: '1px solid #EEF2F7', boxShadow: '0 1px 8px rgba(27,58,87,0.06)' }}>
      {/* Emoji icon */}
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl text-2xl"
        style={{ background: `${accentColor}14` }}>
        {emoji}
      </div>
      {/* Big value */}
      <div className="text-3xl font-bold leading-tight" style={{ color: '#1B3A57' }}>
        {value}
      </div>
      {/* Label */}
      <p className="text-xs font-medium" style={{ color: '#9DB0C0' }}>{label}</p>
      {sub && <p className="text-xs" style={{ color: accentColor }}>{sub}</p>}
      {extra && <div className="w-full mt-1">{extra}</div>}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl ${className ?? ''}`}
      style={{ background: '#EEF2F7' }} />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AlumnoDashboard() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { toasts, showToast, removeToast } = useToast()

  const [perfil,             setPerfil]             = useState<Perfil | null>(null)
  const [meses,              setMeses]               = useState<Mes[]>([])
  const [demo,               setDemo]               = useState(false)
  const [materiasAcreditadas, setMateriasAcreditadas] = useState(0)
  const [logros,             setLogros]             = useState<Array<{ tipo_logro: string; fecha_obtenido: string }>>([])
  const [diasRacha,          setDiasRacha]          = useState(0)
  const [loading,            setLoading]            = useState(true)
  /** Primera materia del plan (orden) con acceso; IVS entra directo a materia, no a /mes/[n] */
  const [primeraMateriaId,    setPrimeraMateriaId]   = useState<string | null>(null)

  // Toast on redirect
  useEffect(() => {
    const pago = searchParams.get('pago')
    if (pago === 'exitoso') {
      showToast('Pago procesado correctamente', 'success')
      router.replace('/alumno', { scroll: false })
    } else if (pago === 'cancelado') {
      showToast('Pago cancelado', 'info')
      router.replace('/alumno', { scroll: false })
    }
  }, [searchParams, router, showToast])

  // Logros + racha. Vive fuera del efecto de carga para que la carga inicial
  // pueda esperarlo: colgado de un segundo useEffect dependiente de `perfil`,
  // la tarjeta se pintaba con `logros = []` y el contador saltaba 0/8 -> 2/8.
  const cargarLogrosYRacha = useCallback(async (alumnoId: string) => {
    const sb = createClient()
    const { data, error: logrosErr } = await sb
      .from('logros_alumno')
      .select('tipo_logro, fecha_obtenido')
      .eq('alumno_id', alumnoId)
    if (logrosErr) console.error('[alumno/dashboard] logros_alumno:', logrosErr)
    if (data) setLogros(data as Array<{ tipo_logro: string; fecha_obtenido: string }>)

    const { data: rachaData, error: rachaErr } = await sb
      .from('racha_actividad')
      .select('racha_actual')
      .eq('alumno_id', alumnoId)
      .maybeSingle()
    if (rachaErr) console.error('[alumno/dashboard] racha_actividad:', rachaErr)
    if (rachaData) setDiasRacha((rachaData as { racha_actual: number }).racha_actual ?? 0)
  }, [])

  // Fetch data
  useEffect(() => {
    Promise.all([
      fetch('/api/alumno/perfil').then(r => r.json()),
      fetch('/api/alumno/meses').then(r => r.json()),
      fetch('/api/alumno/calificaciones').then(r => r.json()),
      fetch('/api/alumno/materias').then(r => r.json()),
    ]).then(async ([p, m, c, mat]) => {
      setPerfil(p)
      if (m?.demo === true) {
        setDemo(true); setMeses([])
      } else {
        setDemo(false); setMeses(Array.isArray(m) ? m : [])
      }
      setMateriasAcreditadas(c?.resumen?.materias_acreditadas ?? 0)

      type MatRow = { id: string; orden?: number; disponible?: boolean }
      const list = Array.isArray(mat?.materias) ? (mat.materias as MatRow[]) : []
      const primera = [...list]
        .filter(x => x.disponible)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))[0]
      setPrimeraMateriaId(primera?.id ?? null)

      // Se espera ANTES de apagar el skeleton: así el contador de logros nunca
      // se pinta con el arreglo vacío.
      if (p?.id) await cargarLogrosYRacha(p.id)
    }).finally(() => setLoading(false))
  }, [cargarLogrosYRacha])

  // Refresco al completar una semana en otra vista (evento propio)
  useEffect(() => {
    if (!perfil) return
    const onLogrosUpdate = () => { void cargarLogrosYRacha(perfil.id) }
    window.addEventListener('ivs-logros-update', onLogrosUpdate)
    return () => window.removeEventListener('ivs-logros-update', onLogrosUpdate)
  }, [perfil, cargarLogrosYRacha])

  // ── Loading skeletons ──────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-6 max-w-5xl">
      {/* Header skeleton */}
      <div className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #EEF2F7' }}>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-40" />
      </div>
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0,1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
      {/* Grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0,1,2,3,4,5].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
    </div>
  )

  if (!perfil) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-sm" style={{ color: '#EF4444' }}>Error al cargar el perfil</p>
    </div>
  )

  // ── Derived values ─────────────────────────────────────────────────────────
  const porcentaje    = perfil.duracion_meses > 0
    ? Math.round((perfil.meses_desbloqueados / perfil.duracion_meses) * 100)
    : 0
  const hora          = new Date().getHours()
  const saludo        = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const primerNombre  = perfil?.nombre_completo?.split(' ')?.[0] ?? 'Alumno'
  const mesActivo     = perfil.meses_desbloqueados
  const logrosCount   = logros.length
  const nivelLabel    = perfil.nivel === 'preparatoria' ? 'Preparatoria'
                      : perfil.nivel === 'secundaria'   ? 'Secundaria'
                      : perfil.plan_nombre?.toLowerCase().includes('prepa') ? 'Preparatoria'
                      : 'Secundaria'

  return (
    <div className="space-y-6 max-w-5xl">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* ── Banner DEMO ────────────────────────────────────────────────────── */}
      {demo && (
        <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{ background: 'linear-gradient(135deg, rgba(58,175,169,0.1) 0%, rgba(27,58,87,0.06) 100%)', border: '1.5px solid rgba(58,175,169,0.3)' }}>
          <div className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(58,175,169,0.15)', border: '1px solid rgba(58,175,169,0.3)' }}>
            <GraduationCap className="w-5 h-5" style={{ color: '#3AAFA9' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm" style={{ color: '#1B3A57' }}>🎓 Estás en modo demo</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: '#6B8FA8' }}>
              Explora la plataforma gratis. Para iniciar tu programa contacta a tu asesor.
            </p>
          </div>
          <a href={`https://wa.me/${CONFIG.whatsapp}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-xl font-semibold transition-colors whitespace-nowrap flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.121 1.532 5.853L0 24l6.338-1.51A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.368l-.36-.213-3.761.896.953-3.658-.234-.374A9.818 9.818 0 012.182 12C2.182 6.573 6.573 2.182 12 2.182S21.818 6.573 21.818 12 17.427 21.818 12 21.818z"/>
            </svg>
            Contactar por WhatsApp
          </a>
        </div>
      )}

      {/* ── Banner inscripción pendiente ───────────────────────────────────── */}
      {!demo && !perfil.inscripcion_pagada && (
        <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1.5px solid rgba(245,158,11,0.3)' }}>
          <div className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.15)' }}>
            <Bell className="w-5 h-5" style={{ color: '#F59E0B' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm" style={{ color: '#B45309' }}>Inscripción pendiente de pago</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: '#92400E' }}>
              Control Escolar te contactará por WhatsApp para darte la bienvenida y solicitarte tus documentos.
            </p>
          </div>
          <a href={`https://wa.me/${CONFIG.whatsapp}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap flex-shrink-0 bg-green-500 hover:bg-green-600 transition-colors"
            style={{ color: '#fff' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.121 1.532 5.853L0 24l6.338-1.51A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.368l-.36-.213-3.761.896.953-3.658-.234-.374A9.818 9.818 0 012.182 12C2.182 6.573 6.573 2.182 12 2.182S21.818 6.573 21.818 12 17.427 21.818 12 21.818z"/>
            </svg>
            {`WhatsApp ${CONFIG.whatsappDisplay}`}
          </a>
        </div>
      )}

      {/* ── Welcome header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{ background: 'linear-gradient(135deg, #1B3A57 0%, #2B6B6B 60%, #3AAFA9 100%)', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circle */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -30, right: 80, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

        <div className="relative z-10">
          <p className="text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {getFechaLarga()}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: '#fff', fontFamily: 'Syne, sans-serif' }}>
            {saludo}, {primerNombre} 👋
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs font-mono px-2 py-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>
              {perfil.matricula}
            </span>
            <span className="text-xs font-semibold px-2 py-1 rounded-lg"
              style={{ background: 'rgba(168,237,234,0.2)', color: '#A8EDEA' }}>
              {nivelLabel}
            </span>
          </div>
        </div>

        {!demo && mesActivo > 0 && (
          <button
            type="button"
            onClick={() => {
              if (primeraMateriaId) router.push(`/alumno/materia/${primeraMateriaId}`)
              else router.push('/alumno/materias')
            }}
            className="relative z-10 flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm flex-shrink-0 transition-all"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
          >
            Continuar estudiando <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Stats 4 cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          emoji="📈"
          label="Progreso general"
          value={`${porcentaje}%`}
          sub={`${mesActivo} de ${perfil.duracion_meses || 6} meses`}
          accentColor="#3AAFA9"
          extra={
            <div className="h-1.5 rounded-full overflow-hidden w-full" style={{ background: '#EEF2F7' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${porcentaje}%`, background: '#3AAFA9' }} />
            </div>
          }
        />
        <StatCard
          emoji="🔥"
          label="Días de racha"
          value={diasRacha}
          sub={diasRacha > 0 ? '¡Sigue así!' : 'Comienza hoy'}
          accentColor="#F59E0B"
        />
        <StatCard
          emoji="📚"
          label="Materias activas"
          value={materiasAcreditadas}
          sub="acreditadas"
          accentColor="#6366F1"
          extra={
            <div className="h-1.5 rounded-full overflow-hidden w-full" style={{ background: '#EEF2F7' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, (materiasAcreditadas / 10) * 100)}%`, background: '#6366F1' }} />
            </div>
          }
        />
        <StatCard
          emoji="⭐"
          label="Logros obtenidos"
          value={`${logrosCount}/8`}
          sub={logrosCount > 0 ? `¡${logrosCount} desbloqueados!` : 'Sigue estudiando'}
          accentColor="#10B981"
          extra={
            <div className="h-1.5 rounded-full overflow-hidden w-full" style={{ background: '#EEF2F7' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(logrosCount / 8) * 100}%`, background: '#10B981' }} />
            </div>
          }
        />
      </div>

      {/* ── Materia DEMO (banner, no oculta los meses) ──────────────────── */}
      {demo && (
        <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{ background: '#fff', border: '1.5px solid rgba(58,175,169,0.25)', boxShadow: '0 1px 8px rgba(27,58,87,0.06)' }}>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs font-mono font-bold" style={{ color: '#3AAFA9' }}>TUT101</p>
            <p className="text-base font-bold" style={{ color: '#1B3A57' }}>Tutoría de ingreso I</p>
            <p className="text-sm" style={{ color: '#7A92A9' }}>
              Familiarízate con la plataforma, tu plan de estudio y la metodología.
            </p>
          </div>
          <Link href="/alumno/materia/f0551b82-1c3e-4286-bfb4-878842bc6eff"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0 transition-all"
            style={{ background: '#3AAFA9', color: '#fff' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#2B7A77' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#3AAFA9' }}>
            Explorar demo →
          </Link>
        </div>
      )}

      {/* ── Meses del programa (siempre visible) ─────────────────────────── */}
      {(() => {
        // Si no hay meses de la API, generar 6 placeholders
        const duracion = perfil.duracion_meses || 6
        const mesesDisplay: Mes[] = meses.length > 0
          ? meses
          : Array.from({ length: duracion }, (_, i) => ({
              id:          `placeholder-${i + 1}`,
              numero:      i + 1,
              titulo:      `Mes ${i + 1}`,
              desbloqueado: !demo && (i + 1) <= mesActivo,
              materias:    [],
            }))

        return (
          <div>
            <SectionTitle>Meses del programa</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
              {mesesDisplay.map(mes => {
                // La API sirve `numero` y `numero_mes`; el fallback deja la vista
                // sana aunque el deploy de la API venga por detrás.
                const numMes     = mes.numero ?? (mes as { numero_mes?: number }).numero_mes ?? 0
                const completado = mes.desbloqueado && numMes < mesActivo
                const activo     = mes.desbloqueado && numMes === mesActivo
                const bloqueado  = !mes.desbloqueado
                const nMat       = mes.materias?.length ?? 0
                const subMaterias = nMat === 1 ? '1 materia' : `${nMat} materias`

                return (
                  <div
                    key={mes.id}
                    onClick={() => mes.desbloqueado && router.push(`/alumno/mes/${numMes}`)}
                    className="rounded-2xl p-4 transition-all duration-200 flex flex-col gap-1.5 min-h-[118px]"
                    style={{
                      background:  bloqueado  ? '#F8FAFB'
                                 : completado ? '#F0FDF4'
                                 : '#fff',
                      border:      bloqueado  ? '1.5px solid #E2E8F0'
                                 : completado ? '1.5px solid #86EFAC'
                                 : '1.5px solid #3AAFA9',
                      opacity:     bloqueado  ? 0.65 : 1,
                      cursor:      bloqueado  ? 'default' : 'pointer',
                      boxShadow:   activo     ? '0 4px 20px rgba(58,175,169,0.2)' : 'none',
                    }}
                    onMouseEnter={e => {
                      if (!bloqueado) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-3xl font-bold leading-none tabular-nums"
                        style={{ color: bloqueado ? '#C8D8E8' : completado ? '#16A34A' : '#3AAFA9' }}>
                        {numMes < 10 ? `0${numMes}` : numMes}
                      </span>
                      <div className="flex-shrink-0">
                        {bloqueado  && <span className="text-lg">🔒</span>}
                        {completado && <CheckCircle2 className="w-5 h-5" style={{ color: '#22C55E' }} />}
                        {activo     && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(58,175,169,0.15)', color: '#3AAFA9' }}>
                            ACTIVO
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs font-semibold mt-1"
                      style={{ color: bloqueado ? '#94A3B8' : '#64748B' }}>
                      {subMaterias}
                    </p>
                    <p className="text-xs font-medium"
                      style={{ color: bloqueado ? '#C8D8E8' : completado ? '#15803D' : '#1B3A57' }}>
                      {bloqueado ? 'Bloqueado' : completado ? 'Completado' : 'En progreso'}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Logros / Badges ───────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 sm:p-6"
        style={{ background: '#fff', border: '1px solid #EEF2F7', boxShadow: '0 1px 8px rgba(27,58,87,0.06)' }}>
        <BadgesGrid logros={logros} lang="es" />
      </div>
    </div>
  )
}

// ─── Section title helper ─────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-sm font-bold uppercase tracking-wider flex-shrink-0" style={{ color: '#1B3A57' }}>
        {children}
      </h2>
      <div className="flex-1 h-px" style={{ background: '#EEF2F7' }} />
    </div>
  )
}
