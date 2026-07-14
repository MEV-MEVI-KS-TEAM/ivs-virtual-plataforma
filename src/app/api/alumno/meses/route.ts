import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEMO_MATERIA_ID = 'e3f004d8-4451-4a65-9c91-bac3f87d2378' // TUT101 — Tutoría de ingreso I

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // ── Resolver datos del alumno (schema antiguo o nuevo) ────────────────────
    let mesesDesbloqueados = 0
    let inscripcionPagada  = false
    let duracionMeses      = 0
    let alumnoNivel: string | null = null
    let alumnoEncontrado   = false

    // Intento 1: schema antiguo (alumnos.usuario_id)
    const { data: a1 } = await supabase
      .from('alumnos')
      .select('meses_desbloqueados, inscripcion_pagada, nivel, planes_estudio(duracion_meses)')
      .eq('usuario_id', user.id)
      .single()

    if (a1) {
      alumnoEncontrado  = true
      const row = a1 as unknown as {
        meses_desbloqueados: number
        inscripcion_pagada: boolean
        nivel?: string
        planes_estudio: { duracion_meses: number } | null
      }
      mesesDesbloqueados = row.meses_desbloqueados ?? 0
      inscripcionPagada  = row.inscripcion_pagada  ?? false
      alumnoNivel        = row.nivel ?? null
      duracionMeses      = row.planes_estudio?.duracion_meses ?? 6
    }

    // Intento 2: schema nuevo (alumnos.id = user.id)
    if (!alumnoEncontrado) {
      const { data: a2 } = await supabase
        .from('alumnos')
        .select('meses_desbloqueados, inscripcion_pagada, modalidad, nivel')
        .eq('id', user.id)
        .single()

      if (a2) {
        alumnoEncontrado = true
        const row = a2 as unknown as {
          meses_desbloqueados: number
          inscripcion_pagada: boolean
          modalidad?: string
          nivel?: string
        }
        mesesDesbloqueados = row.meses_desbloqueados ?? 0
        inscripcionPagada  = row.inscripcion_pagada  ?? false
        alumnoNivel        = row.nivel ?? null
        duracionMeses      = row.modalidad === '3_meses' ? 3 : 6
      }
    }

    // Sin perfil → modo demo
    if (!alumnoEncontrado) {
      return NextResponse.json({ demo: true, materia_demo_id: DEMO_MATERIA_ID })
    }

    // Sin pago y sin meses → modo demo
    if (!inscripcionPagada && mesesDesbloqueados === 0) {
      return NextResponse.json({ demo: true, materia_demo_id: DEMO_MATERIA_ID })
    }

    // ── Obtener meses del contenido ───────────────────────────────────────────
    // Columnas correctas IVS: numero_mes (no 'numero'), color (no 'color_hex')
    // meses_contenido.materia_id → materias.id (many-to-one → materias es objeto único)
    const { data: mesesRaw, error: mesesError } = await supabase
      .from('meses_contenido')
      .select('*, materias(id, nombre, color, nivel)')
      .order('numero_mes')
      .lte('numero_mes', duracionMeses)

    // Port Bug 46 (f7d3edc): filtrar materias de otros niveles y demo si pagada
    const meses = (mesesRaw ?? []).filter((mes: unknown) => {
      const mat = (mes as { materias: { nivel?: string | null } | null }).materias
      if (!mat) return true
      if (alumnoNivel && mat.nivel !== alumnoNivel) return false
      if (inscripcionPagada && mat.nivel === 'demo') return false
      return true
    })

    // Si la tabla no existe o no tiene datos → generar meses ficticios
    if (mesesError || !meses || meses.length === 0) {
      const mesesFicticios = Array.from({ length: duracionMeses || 6 }, (_, i) => ({
        id:          `mes-ficticio-${i + 1}`,
        numero_mes:  i + 1,
        titulo:      `Mes ${i + 1}`,
        materias:    null,
        desbloqueado: (i + 1) <= mesesDesbloqueados,
      }))
      return NextResponse.json(mesesFicticios)
    }

    const result = meses.map((mes: unknown) => {
      const m = mes as {
        id: string
        numero_mes: number
        titulo: string
        materias: { id: string; nombre: string; color: string | null } | null
      }
      return {
        ...m,
        desbloqueado: m.numero_mes <= mesesDesbloqueados,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/alumno/meses] error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
