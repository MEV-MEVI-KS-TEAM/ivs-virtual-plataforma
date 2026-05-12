import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // ── Resolver alumno_id, nivel e inscripcion (IVS: preferir alumnos.id = user.id) ─────
    let alumnoId:          string | null = null
    let mesesDesbloqueados               = 0
    let alumnoNivel:       string | null = null
    let inscripcionPagada                = false

    const { data: aNuevo } = await supabase
      .from('alumnos')
      .select('id, meses_desbloqueados, nivel, inscripcion_pagada')
      .eq('id', user.id)
      .maybeSingle()

    if (aNuevo) {
      const row = aNuevo as unknown as {
        id: string
        meses_desbloqueados: number
        nivel?: string
        inscripcion_pagada?: boolean
      }
      alumnoId           = row.id
      mesesDesbloqueados = row.meses_desbloqueados ?? 0
      alumnoNivel        = row.nivel ?? null
      inscripcionPagada  = row.inscripcion_pagada ?? false
    }

    if (!alumnoId) {
      const { data: a1 } = await supabase
        .from('alumnos')
        .select('id, meses_desbloqueados, nivel, inscripcion_pagada')
        .eq('usuario_id', user.id)
        .maybeSingle()

      if (a1) {
        const row = a1 as unknown as {
          id: string
          meses_desbloqueados: number
          nivel?: string
          inscripcion_pagada?: boolean
        }
        alumnoId           = row.id
        mesesDesbloqueados = row.meses_desbloqueados ?? 0
        alumnoNivel        = row.nivel ?? null
        inscripcionPagada  = row.inscripcion_pagada ?? false
      }
    }

    // Sin alumno → respuesta vacía (no 404)
    if (!alumnoId) {
      return NextResponse.json({
        materias: [],
        resumen: {
          total_materias_plan:    0,
          materias_acreditadas:   0,
          materias_no_acreditadas: 0,
          materias_pendientes:    0,
        },
      })
    }

    // ── Calificaciones registradas ────────────────────────────────────────────
    const { data: califs } = await supabase
      .from('calificaciones')
      .select('materia_id, acreditado')
      .eq('alumno_id', alumnoId)

    const califMap = new Map<string, boolean>()
    for (const c of (califs ?? [])) {
      const row = c as { materia_id: string; acreditado: boolean }
      califMap.set(row.materia_id, row.acreditado)
    }

    // ── Materias del plan via meses_contenido ─────────────────────────────────
    // Sub-fix C: sin .lte — incluir todos los meses para no perder materias acreditadas
    // Sub-fix A/B: filtrar por nivel del alumno en el loop
    const { data: meses } = await supabase
      .from('meses_contenido')
      .select('numero_mes, materias(id, nombre, nivel)')
      .order('numero_mes')

    type MesRow = {
      numero_mes: number
      materias: { id: string; nombre: string; nivel: string } | null
    }

    const resultado: {
      materia_id:     string
      codigo:         string
      nombre_materia: string
      mes_numero:     number
      estado:         'Acreditada' | 'No acreditada' | 'Pendiente'
    }[] = []

    for (const mes of ((meses ?? []) as unknown as MesRow[])) {
      const mat = mes.materias
      if (!mat) continue

      // Sub-fix A: solo mostrar materias del nivel del alumno
      if (alumnoNivel && mat.nivel !== alumnoNivel) continue
      // Sub-fix B: si está pagado, nunca mostrar materias demo
      if (inscripcionPagada && mat.nivel === 'demo') continue

      if (califMap.has(mat.id)) {
        resultado.push({
          materia_id:     mat.id,
          codigo:         '',
          nombre_materia: mat.nombre,
          mes_numero:     mes.numero_mes,
          estado:         califMap.get(mat.id) ? 'Acreditada' : 'No acreditada',
        })
      } else if (mes.numero_mes <= mesesDesbloqueados) {
        resultado.push({
          materia_id:     mat.id,
          codigo:         '',
          nombre_materia: mat.nombre,
          mes_numero:     mes.numero_mes,
          estado:         'Pendiente',
        })
      }
    }

    const acreditadas    = resultado.filter(r => r.estado === 'Acreditada').length
    const noAcreditadas  = resultado.filter(r => r.estado === 'No acreditada').length
    const pendientes     = resultado.filter(r => r.estado === 'Pendiente').length

    return NextResponse.json({
      materias: resultado,
      resumen: {
        total_materias_plan:     resultado.length,
        materias_acreditadas:    acreditadas,
        materias_no_acreditadas: noAcreditadas,
        materias_pendientes:     pendientes,
      },
    })
  } catch (err) {
    console.error('[api/alumno/calificaciones] error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
