import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cargarContextoAcceso, tieneAccesoMateria } from '@/lib/acceso-materias'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const { semana_id } = body as { semana_id: string }
    if (!semana_id) return NextResponse.json({ error: 'semana_id requerido' }, { status: 400 })

    // Obtener alumno (schema nuevo: alumnos.id = user.id)
    const { data: alumnoData } = await supabase
      .from('alumnos')
      .select('id, nivel, meses_desbloqueados, modalidad, duracion_meses, inscripcion_pagada')
      .eq('id', user.id)
      .single()

    if (!alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const alumno = alumnoData as {
      id: string; nivel: string | null; meses_desbloqueados: number
      modalidad: string | null; duracion_meses: number | null
      inscripcion_pagada: boolean | null
    }

    // ── Gate canon (lib/acceso-materias): la semana debe pertenecer a una
    // materia accesible para el alumno (semana → mes_id → materia) ───────────
    const { data: semanaGate } = await supabase
      .from('semanas')
      .select('id, mes_id')
      .eq('id', semana_id)
      .maybeSingle()

    if (!semanaGate) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 })

    const { data: mesGate } = await supabase
      .from('meses_contenido')
      .select('materia_id, materias(id, nombre, nivel)')
      .eq('id', (semanaGate as { mes_id: string }).mes_id)
      .maybeSingle()

    const matRel = (mesGate as { materias?: unknown } | null)?.materias
    const materiaGate = (Array.isArray(matRel) ? matRel[0] : matRel) as
      | { id: string; nombre: string; nivel: string | null }
      | undefined

    if (!materiaGate) return NextResponse.json({ error: 'Materia no encontrada' }, { status: 404 })

    const { materias, acreditadas } = await cargarContextoAcceso(
      supabase, user.id, alumno.nivel ?? materiaGate.nivel
    )
    const accesoMateria = tieneAccesoMateria(alumno, materiaGate, materias, acreditadas)
    if (!accesoMateria.acceso) {
      return NextResponse.json({ error: 'No tienes acceso a este contenido' }, { status: 403 })
    }

    // ── Ronda 2 de seguridad: progreso y logros los escribe SOLO el servidor,
    // con el service role y DESPUÉS del gate de arriba. La migración de
    // seguridad le quita al alumno el INSERT/UPDATE de progreso_semanas,
    // logros_alumno y racha_actividad por /rest/v1 (el avance se forjaba con la
    // sesión, y la racha la mantiene el trigger trg_actualizar_racha sobre
    // progreso_semanas, que con el service role sigue corriendo).
    const admin = createAdminClient()

    // Verificar si ya existía el progreso
    const { data: existente } = await admin
      .from('progreso_semanas')
      .select('id')
      .eq('alumno_id', alumno.id)
      .eq('semana_id', semana_id)
      .maybeSingle()

    const ya_existia = !!existente

    // Upsert progreso (ignora si ya existe)
    const { error: upsertError } = await admin
      .from('progreso_semanas')
      .upsert(
        // completada = true: el trigger trg_actualizar_racha (actualizar_racha)
        // solo suma racha cuando NEW.completada pasa a true. Sin esto la fila
        // nacía con el default false y la racha no se movía nunca (ya pasaba en
        // main). ignoreDuplicates: una semana ya marcada no se reescribe.
        {
          alumno_id: alumno.id,
          semana_id,
          completada: true,
          fecha_completada: new Date().toISOString(),
        },
        { onConflict: 'alumno_id,semana_id', ignoreDuplicates: true }
      )

    if (upsertError) return NextResponse.json({ error: 'Error al guardar progreso' }, { status: 500 })

    // Si ya existía, no re-evaluar logros
    if (ya_existia) return NextResponse.json({ ok: true, ya_existia: true })

    // ── Logro: primera semana completada ─────────────────────────────────────
    // Antes escribía la columna `tipo`, que en IVS no existe (es `tipo_logro`):
    // el upsert fallaba en silencio. Los bloques de «materia_completada» y de
    // racha dentro de logros_alumno (`metadata`, `semanas.materia_id`) tampoco
    // podían funcionar con el esquema de IVS y se quitaron; la racha visible
    // sale de racha_actividad (trigger). Ver dudas en el reporte de la ronda 2.
    const { count: totalCompletadas } = await admin
      .from('progreso_semanas')
      .select('id', { count: 'exact', head: true })
      .eq('alumno_id', alumno.id)

    if ((totalCompletadas ?? 0) === 1) {
      const { error: logroErr } = await admin
        .from('logros_alumno')
        .upsert(
          { alumno_id: alumno.id, tipo_logro: 'primera_semana' },
          { onConflict: 'alumno_id,tipo_logro', ignoreDuplicates: true }
        )
      if (logroErr) console.error('[progreso/semana] logro primera_semana:', logroErr.message)
    }

    return NextResponse.json({ ok: true, ya_existia: false })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
