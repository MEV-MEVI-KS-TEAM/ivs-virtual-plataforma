import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularDisponibilidad, toMateriaVentana } from '@/lib/acceso-materias'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // ── Alumno: nivel + meses desbloqueados + modalidad ──────────────────────
    const { data: alumno } = await supabase
      .from('alumnos')
      .select('nivel, meses_desbloqueados, modalidad, duracion_meses')
      .eq('id', user.id)
      .single()

    if (!alumno) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const alumnoRow = alumno as {
      nivel: string
      meses_desbloqueados: number
      modalidad: string | null
      duracion_meses: number | null
    }
    const nivel              = alumnoRow.nivel
    const mesesDesbloqueados = alumnoRow.meses_desbloqueados ?? 0

    // ── Materias del nivel del alumno con meses y semanas ───────────────────
    const { data: materias, error } = await supabase
      .from('materias')
      .select(`
        id,
        nombre,
        descripcion,
        nivel,
        orden,
        icono,
        color,
        activa,
        meses_contenido (
          id,
          numero_mes,
          titulo,
          semanas ( id )
        )
      `)
      .eq('nivel', nivel)
      .eq('activa', true)
      .order('orden')

    if (error) {
      console.error('[api/alumno/materias] query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    type MesRow    = { id: string; numero_mes: number; titulo: string; semanas: { id: string }[] }
    type MateriaRow = {
      id: string; nombre: string; descripcion: string | null
      nivel: string; orden: number | null; icono: string | null; color: string | null
      activa: boolean; meses_contenido: MesRow[]
    }

    const allMaterias = ((materias ?? []) as unknown as MateriaRow[])

    // ── Calificaciones acreditadas del alumno ─────────────────────────────────
    const { data: califs } = await supabase
      .from('calificaciones')
      .select('materia_id')
      .eq('alumno_id', user.id)
      .eq('acreditado', true)
    const acreditadasSet = new Set(
      (califs ?? []).map(c => (c as { materia_id: string }).materia_id)
    )

    // ── Gating por ventana modality-aware (fuente única: lib/acceso-materias) ─
    const disponibilidad = calcularDisponibilidad(
      alumnoRow,
      allMaterias.map(toMateriaVentana),
      acreditadasSet
    )

    const sorted = [...allMaterias].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

    const result = sorted.map(mat => {
      const meses        = mat.meses_contenido ?? []
      const totalSemanas = meses.reduce((acc, mes) => acc + (mes.semanas?.length ?? 0), 0)
      const disponible   = disponibilidad.get(mat.id) === true

      return {
        id:             mat.id,
        nombre:         mat.nombre,
        descripcion:    mat.descripcion ?? null,
        icono:          mat.icono       ?? '📚',
        color:          mat.color       ?? '#3AAFA9',
        orden:          mat.orden       ?? 0,
        total_meses:    meses.length,
        total_semanas:  totalSemanas,
        disponible,
      }
    })

    return NextResponse.json({
      materias:            result,
      meses_desbloqueados: mesesDesbloqueados,
      nivel,
    })
  } catch (err) {
    console.error('[api/alumno/materias]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
