import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { toMateriaVentana } from '@/lib/acceso-materias'

/**
 * Quita el último mes desbloqueado del alumno.
 *
 * NO BORRA NADA. Antes hacía cuatro DELETE duros (quiz_respuestas,
 * progreso_semanas, intentos_evaluacion y calificaciones) sin respaldo ni
 * bitácora: en IVS se disparó 6 veces y destruyó 7 calificaciones ganadas,
 * entre ellas el mes 2 completo de IVS-2026-0020, que tuvo que rehacerlo.
 *
 * Borrar nunca fue necesario para revocar el acceso: la ventana de
 * `lib/acceso-materias` ya oculta lo no pagado por posición absoluta, así que
 * bajar `meses_desbloqueados` basta. Y el canon del Bug 54 dice que una
 * materia acreditada se respeta: sigue legible y conserva su constancia.
 *
 * Si alguna vez hace falta un "reiniciar avance", va como acción aparte, con
 * respaldo previo y jamás sobre filas con `acreditado = true`.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ── Verificar sesión ──────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // ── Verificar rol ADMIN (case-insensitive, mismo patrón que desbloquear-mes) ─
    const { data: usuarioAdmin } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    const esAdmin = (usuarioAdmin?.rol as string | undefined)?.toLowerCase() === 'admin'
    if (!esAdmin) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

    // ── Usar service role para saltarse RLS ───────────────────────────────────
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const alumnoId = params.id

    // ── Obtener alumno ────────────────────────────────────────────────────────
    const { data: alumno, error: alumnoErr } = await admin
      .from('alumnos')
      .select('id, meses_desbloqueados, nivel')
      .eq('id', alumnoId)
      .single()

    if (alumnoErr || !alumno) {
      return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })
    }

    const { meses_desbloqueados, nivel } = alumno as {
      meses_desbloqueados: number
      nivel: string
    }

    if (meses_desbloqueados <= 0) {
      return NextResponse.json(
        { error: 'El alumno no tiene meses desbloqueados que quitar' },
        { status: 400 }
      )
    }

    // ── Identificar las materias del mes, SOLO para nombrarlas en la respuesta ─
    // Mes N del alumno = TODAS las materias del nivel cuyo primer numero_mes en
    // meses_contenido es N. (Mapear por posición orden,nombre nombraba la materia
    // equivocada: en secundaria `orden` agrupa por tipo de materia y no sigue
    // los meses — p.ej. la 3.ª por orden es Ciencias Naturales I, que es mes 4.)
    const mesAQuitar = meses_desbloqueados
    const { data: matsNivel } = await admin
      .from('materias')
      .select('id, nombre, nivel, orden, meses_contenido(numero_mes)')
      .eq('nivel', nivel)
      .eq('activa', true)

    const materiasDelMes = ((matsNivel ?? []) as unknown as Parameters<typeof toMateriaVentana>[0][])
      .map(toMateriaVentana)
      .filter(m => m.numero_mes === mesAQuitar)

    // ── Única escritura: bajar el contador de meses pagados ───────────────────
    const { error: updateErr } = await admin
      .from('alumnos')
      .update({ meses_desbloqueados: meses_desbloqueados - 1 })
      .eq('id', alumnoId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      mes_quitado: mesAQuitar,
      mes_cerrado: mesAQuitar, // compat con clientes viejos
      meses_desbloqueados: meses_desbloqueados - 1,
      materias: materiasDelMes.map(m => ({ id: m.id, nombre: m.nombre })),
      materia_nombre: materiasDelMes.map(m => m.nombre).join(', '),
      avance_conservado: true,
    })
  } catch (err) {
    console.error('[POST /api/admin/alumnos/[id]/cerrar-mes]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
