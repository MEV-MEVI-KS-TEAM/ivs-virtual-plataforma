import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    // IVS no tiene lib/modalidades — derivar duración directamente de la columna o modalidad
    const duracionMeses = alumnoRow.duracion_meses
      ?? (alumnoRow.modalidad === '3_meses' ? 3 : 6)

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

    // ── Gating modality-aware (fallback dinámico sin lib/modalidades) ─────────
    // Excluir tutoriales del conteo; materiasPorMes = ceil(regulares / duracionMeses)
    const totalRegulares = allMaterias.filter(
      m => m.nivel !== 'demo' && !m.nombre.toLowerCase().includes('tutor')
    ).length
    const materiasPorMes = duracionMeses > 0
      ? Math.ceil(totalRegulares / duracionMeses)
      : 2
    const limiteMaterias = Math.max(0, mesesDesbloqueados * materiasPorMes)

    // ── Calificaciones acreditadas del alumno ─────────────────────────────────
    const { data: califs } = await supabase
      .from('calificaciones')
      .select('materia_id')
      .eq('alumno_id', user.id)
      .eq('acreditado', true)
    const acreditadasSet = new Set(
      (califs ?? []).map(c => (c as { materia_id: string }).materia_id)
    )

    const sorted = [...allMaterias].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

    // ── Gating "abrir mes = desbloquear siguientes pendientes" ────────────────
    // Las acreditadas NO consumen lugares de la ventana: el límite
    // (meses_desbloqueados × materiasPorMes) aplica SOLO a materias pendientes.
    // Así, abrir un mes nuevo siempre revela las SIGUIENTES materias pendientes,
    // incluso a alumnos que avanzaron durante la época "todo abierto".
    let idxPendiente = 0
    const result = sorted.map(mat => {
      const meses          = mat.meses_contenido ?? []
      const totalSemanas   = meses.reduce((acc, mes) => acc + (mes.semanas?.length ?? 0), 0)
      const esTutorial     = mat.nivel === 'demo' || mat.nombre.toLowerCase().includes('tutor')
      const estaAcreditada = acreditadasSet.has(mat.id)

      let disponible: boolean
      if (esTutorial || estaAcreditada) {
        // Tutoriales y acreditadas: siempre visibles y NO consumen lugar de la ventana
        disponible = true
      } else {
        // Materia pendiente: gating por ventana, contando solo pendientes
        disponible = mesesDesbloqueados > 0 && idxPendiente < limiteMaterias
        idxPendiente++
      }

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
