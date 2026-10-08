import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cargarContextoAcceso, dentroDeVentana } from '@/lib/acceso-materias'
import {
  estadoExamen,
  leerPreguntasEvaluacion,
  sanitizarPreguntaEvaluacion,
} from '@/lib/evaluaciones/examen-mensual'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Obtener alumno (schema nuevo: alumnos.id = user.id)
    const { data: alumnoData } = await supabase
      .from('alumnos')
      .select('id, meses_desbloqueados, nivel, inscripcion_pagada, modalidad, duracion_meses')
      .eq('id', user.id)
      .single()

    if (!alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const alumno = alumnoData as {
      id: string; meses_desbloqueados: number
      nivel: string | null; inscripcion_pagada: boolean | null
      modalidad: string | null; duracion_meses: number | null
    }

    // FIX #4: usar nombres reales del schema IVS (no titulo_en/tipo/intentos_max)
    const { data: evaluacion, error: evalError } = await supabase
      .from('evaluaciones')
      .select('id, titulo, intentos_permitidos, activa, materia_id')
      .eq('id', params.id)
      .single()

    if (evalError || !evaluacion) {
      return NextResponse.json({ error: 'Evaluación no encontrada' }, { status: 404 })
    }

    const ev = evaluacion as {
      id: string; titulo: string; intentos_permitidos: number; activa: boolean; materia_id: string
    }

    if (!ev.activa) {
      return NextResponse.json({ error: 'Esta evaluación no está disponible' }, { status: 403 })
    }

    // ── Guard canon (Bug 54): acreditadas siempre accesibles; demo solo sin
    // pago; nunca materias de otro nivel; pendientes solo dentro de la ventana
    // modality-aware (lib/acceso-materias — el MISMO criterio que decide
    // `disponible` en /api/alumno/materias, para que lista y gate no diverjan).
    const { data: matData } = await supabase
      .from('materias')
      .select('nivel')
      .eq('id', ev.materia_id)
      .maybeSingle()

    const mat = matData as unknown as { nivel: string | null } | null
    const esMateriaDemo = mat?.nivel === 'demo'

    const { data: calif } = await supabase
      .from('calificaciones')
      .select('acreditado')
      .eq('alumno_id', alumno.id)
      .eq('materia_id', ev.materia_id)
      .maybeSingle()
    const estaAcreditada = (calif as { acreditado?: boolean } | null)?.acreditado === true

    if (!estaAcreditada) {
      if (esMateriaDemo) {
        if (alumno.inscripcion_pagada) {
          return NextResponse.json({ error: 'No tienes acceso a esta evaluación' }, { status: 403 })
        }
      } else {
        if (alumno.nivel && mat?.nivel && mat.nivel !== alumno.nivel) {
          return NextResponse.json({ error: 'No tienes acceso a esta evaluación' }, { status: 403 })
        }
        const { materias: materiasNivel, acreditadas } = await cargarContextoAcceso(
          supabase, alumno.id, alumno.nivel ?? mat?.nivel ?? null
        )
        if (!dentroDeVentana(alumno, materiasNivel, acreditadas, ev.materia_id)) {
          return NextResponse.json({ error: 'No tienes acceso a esta evaluación' }, { status: 403 })
        }
      }
    }

    // Ronda 2 (port de D22d-1): intentos y preguntas con el service role,
    // DESPUÉS del gate. La clave nunca sale de aquí (lista blanca de
    // lib/evaluaciones/examen-mensual); la migración de seguridad deja al
    // alumno sin lectura de preguntas.respuesta_correcta por /rest/v1.
    const admin = createAdminClient()
    const { data: previos, error: prevErr } = await admin
      .from('intentos_evaluacion')
      .select('acreditado')
      .eq('alumno_id', alumno.id)
      .eq('evaluacion_id', params.id)
    if (prevErr) return NextResponse.json({ error: 'Error al leer tus intentos' }, { status: 500 })

    const usados = (previos ?? []).length
    // Aprobar CIERRA el examen; sin intentos, también. Cerrado no se sirve el
    // banco: no hay nada que contestar.
    const estado = estadoExamen((previos ?? []) as { acreditado: boolean | null }[], ev.intentos_permitidos)

    let preguntas: ReturnType<typeof sanitizarPreguntaEvaluacion>[] = []
    if (estado === 'abierta') {
      const leidas = await leerPreguntasEvaluacion(admin, params.id)
      if (leidas.error) return NextResponse.json({ error: 'Error al cargar el examen' }, { status: 500 })
      preguntas = leidas.preguntas.map(sanitizarPreguntaEvaluacion)
    }

    return NextResponse.json({
      evaluacion: {
        id:           ev.id,
        titulo:       ev.titulo,
        titulo_en:    ev.titulo,
        tipo:         'opcion_multiple',
        intentos_max: ev.intentos_permitidos,
      },
      intentos_usados: usados,
      estado,
      preguntas,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
