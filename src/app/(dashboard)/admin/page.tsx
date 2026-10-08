import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CONFIG } from '@/lib/config'

// ─── helpers ──────────────────────────────────────────────────────────────────
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── stat card ────────────────────────────────────────────────────────────────
function StatCard({
  emoji, label, value, sub, color = '#3AAFA9',
}: {
  emoji: string; label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-2"
      style={{ background: '#fff', border: '1px solid #E8F0F7', borderTop: '3px solid #3AAFA9', boxShadow: '0 2px 8px rgba(27,58,87,0.06)' }}
    >
      <div
        className="flex items-center justify-center w-11 h-11 rounded-xl text-xl"
        style={{ background: `${color}14` }}
      >
        {emoji}
      </div>
      <div className="text-3xl font-bold" style={{ color: '#1B3A57', fontFamily: 'Syne, sans-serif' }}>
        {value}
      </div>
      <p className="text-sm font-medium" style={{ color: '#6B8FA8' }}>{label}</p>
      {sub && <p className="text-xs" style={{ color: '#9DB0C0' }}>{sub}</p>}
    </div>
  )
}

// ─── badge ────────────────────────────────────────────────────────────────────
function NivelBadge({ nivel }: { nivel?: string | null }) {
  const isPrepa = nivel === 'preparatoria'
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{
        background: isPrepa ? 'rgba(58,175,169,0.12)' : 'rgba(27,58,87,0.1)',
        color:      isPrepa ? '#3AAFA9' : '#1B3A57',
      }}
    >
      {isPrepa ? 'Preparatoria' : nivel === 'secundaria' ? 'Secundaria' : 'Sin nivel'}
    </span>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────
export default async function AdminDashboardPage() {
  const supabase = getServiceClient()

  // Conteo total de alumnos
  const { count: totalAlumnos } = await supabase
    .from('alumnos')
    .select('*', { count: 'exact', head: true })

  // Por nivel
  const { count: totalPrepa } = await supabase
    .from('alumnos')
    .select('*', { count: 'exact', head: true })
    .eq('nivel', 'preparatoria')

  const { count: totalSecundaria } = await supabase
    .from('alumnos')
    .select('*', { count: 'exact', head: true })
    .eq('nivel', 'secundaria')

  // Registros este mes
  const inicioMes = new Date()
  inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const { count: esteMes } = await supabase
    .from('alumnos')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', inicioMes.toISOString())

  // Documentos pendientes de revisión: cuenta por `estado` (la fuente de verdad
  // que pintan /admin/documentos y el expediente), NO por `verificado`. En IVS
  // `verificado` se desfasó (aprobados con verificado=false; un re-subido
  // vuelve a estado='pendiente' pero el POST no toca verificado) y además
  // contaba los rechazados como pendientes.
  const { count: docsPendientes } = await supabase
    .from('documentos_alumno')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'pendiente')

  // Últimos 5 alumnos
  const { data: recientes } = await supabase
    .from('alumnos')
    .select('id, matricula, nivel, meses_desbloqueados, modalidad, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  // Nombre de usuarios para esos alumnos
  type AlumnoRow = {
    id: string; matricula?: string; nivel?: string
    meses_desbloqueados?: number; modalidad?: string; created_at: string
  }
  type AlumnoConNombre = AlumnoRow & { nombre: string; email: string }

  const alumnosConNombre: AlumnoConNombre[] = []
  for (const a of (recientes ?? []) as AlumnoRow[]) {
    const { data: u } = await supabase
      .from('usuarios')
      .select('nombre, apellidos, email')
      .eq('id', a.id)
      .single()
    const nombre = u ? [u.nombre, u.apellidos].filter(Boolean).join(' ') : '—'
    const email  = (u as { email?: string } | null)?.email ?? '—'
    alumnosConNombre.push({ ...a, nombre, email })
  }

  const duracion = (a: AlumnoRow) => a.modalidad === '3_meses' ? 3 : 6

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#1B3A57', fontFamily: 'Syne, sans-serif' }}>
          Bienvenido, Administrador 👋
        </h2>
        <p className="text-sm mt-1" style={{ color: '#6B8FA8' }}>
          Resumen general de {CONFIG.nombre}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard emoji="👥" label="Total alumnos"       value={totalAlumnos ?? 0} />
        <StatCard emoji="🎓" label="Preparatoria"        value={totalPrepa ?? 0}   sub={`${totalSecundaria ?? 0} en Secundaria`} color="#1B3A57" />
        <StatCard emoji="📅" label="Registros este mes"  value={esteMes ?? 0}      color="#22C55E" />
        <StatCard emoji="📄" label="Docs. pendientes"    value={docsPendientes ?? 0} color="#F59E0B" />
      </div>

      {/* Tabla alumnos recientes */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#fff', border: '1px solid #E8F0F7', boxShadow: '0 2px 8px rgba(27,58,87,0.06)' }}
      >
        {/* Header tabla */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #F0F4F8' }}
        >
          <h3 className="text-sm font-bold" style={{ color: '#1B3A57' }}>
            Alumnos recientes
          </h3>
          <Link
            href="/admin/alumnos"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(58,175,169,0.1)', color: '#3AAFA9' }}
          >
            Ver todos →
          </Link>
        </div>

        {/* Tabla */}
        {alumnosConNombre.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm" style={{ color: '#9DB0C0' }}>No hay alumnos registrados aún.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #F0F4F8' }}>
                  {['Nombre', 'Email', 'Nivel', 'Meses', 'Registro'].map(col => (
                    <th key={col} className="px-5 py-3 text-left text-xs font-semibold"
                      style={{ color: '#9DB0C0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {col}
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {alumnosConNombre.map((a, i) => (
                  <tr
                    key={a.id}
                    style={{ borderBottom: i < alumnosConNombre.length - 1 ? '1px solid #F0F4F8' : 'none' }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold flex-shrink-0"
                          style={{ background: 'rgba(58,175,169,0.15)', color: '#3AAFA9' }}
                        >
                          {a.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium truncate max-w-[140px]" style={{ color: '#1B3A57' }}>
                          {a.nombre}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="truncate max-w-[160px] block" style={{ color: '#6B8FA8' }}>{a.email}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <NivelBadge nivel={a.nivel} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span style={{ color: '#1B3A57', fontVariantNumeric: 'tabular-nums' }}>
                        {a.meses_desbloqueados ?? 0}
                        <span style={{ color: '#9DB0C0' }}>/{duracion(a)}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5" style={{ color: '#9DB0C0' }}>
                      {formatDate(a.created_at)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/alumnos/${a.id}`}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                        style={{ background: '#F0F4F8', color: '#1B3A57' }}
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
