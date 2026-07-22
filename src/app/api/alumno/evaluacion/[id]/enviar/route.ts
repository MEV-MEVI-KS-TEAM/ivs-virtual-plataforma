import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cargarContextoAcceso, dentroDeVentana } from '@/lib/acceso-materias'

const IDX_TO_LETTER = ['a', 'b', 'c', 'd'] as const

export async function POST(
  request: NextRequest,
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

    // FIX #4: usar intentos_permitidos (no intentos_max), sin acceso por numero_mes
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

    // ── Guard canon (Bug 54): mismo criterio que el GET de evaluacion/[id] —
    // bloquear la vista pero no el submit dejaría el hueco vivo. La ventana
    // modality-aware vive en lib/acceso-materias (fuente única con /materias).
    const { data: matAcceso } = await supabase
      .from('materias')
      .select('nivel')
      .eq('id', ev.materia_id)
      .maybeSingle()

    const mat = matAcceso as unknown as { nivel: string | null } | null
    const esMateriaDemo = mat?.nivel === 'demo'

    const { data: califGuard } = await supabase
      .from('calificaciones')
      .select('acreditado')
      .eq('alumno_id', alumno.id)
      .eq('materia_id', ev.materia_id)
      .maybeSingle()
    const estaAcreditada = (califGuard as { acreditado?: boolean } | null)?.acreditado === true

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

    // Verificar intentos disponibles
    const { count: intentosUsados } = await supabase
      .from('intentos_evaluacion')
      .select('id', { count: 'exact', head: true })
      .eq('alumno_id', alumno.id)
      .eq('evaluacion_id', params.id)

    const usados = intentosUsados ?? 0
    if (usados >= ev.intentos_permitidos) {
      return NextResponse.json({ error: 'No tienes más intentos disponibles' }, { status: 400 })
    }

    // Obtener respuestas del alumno (índice numérico por pregunta_id)
    const body = await request.json()
    const respuestasAlumno: Record<string, number> = body.respuestas ?? {}

    // FIX #4: preguntas con schema IVS — opcion_a/b/c/d + respuesta_correcta ('a'/'b'/'c'/'d')
    const { data: rawPreguntas, error: pregError } = await supabase
      .from('preguntas')
      .select('id, orden, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta')
      .eq('evaluacion_id', params.id)
      .order('orden')

    if (pregError || !rawPreguntas) {
      return NextResponse.json({ error: 'Error al obtener preguntas' }, { status: 500 })
    }

    type PregRow = {
      id: string; orden: number | null; pregunta: string
      opcion_a: string; opcion_b: string; opcion_c: string; opcion_d: string | null
      respuesta_correcta: string // 'a' | 'b' | 'c' | 'd'
    }

    const pregs = rawPreguntas as unknown as PregRow[]

    // Calificar en el servidor
    let correctas = 0

    const detalle = pregs.map(p => {
      const selectedIdx    = respuestasAlumno[p.id] ?? -1
      const selectedLetra  = selectedIdx >= 0 ? (IDX_TO_LETTER[selectedIdx] ?? null) : null
      const esCorrecta     = selectedLetra === p.respuesta_correcta

      if (esCorrecta) correctas++

      const opciones = [p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d].filter(Boolean) as string[]
      const correctaIdx = ['a', 'b', 'c', 'd'].indexOf(p.respuesta_correcta)

      return {
        pregunta_id:       p.id,
        numero:            p.orden ?? 0,
        texto:             p.pregunta,
        texto_en:          p.pregunta,
        tipo:              'opcion_multiple',
        opciones,
        opciones_en:       opciones,
        respuesta_alumno:  selectedIdx,
        respuesta_correcta: correctaIdx,
        es_correcta:       esCorrecta,
        retroalimentacion: '',
      }
    })

    const totalPregs  = pregs.length
    const puntaje     = totalPregs > 0 ? Math.round((correctas / totalPregs) * 100) : 0
    const acreditado  = puntaje >= 60
    const numeroIntento = usados + 1

    // FIX #4: insertar con columnas IVS — acreditado + puntaje + numero_intento
    const { error: intentoError } = await supabase
      .from('intentos_evaluacion')
      .insert({
        alumno_id:     alumno.id,
        evaluacion_id: params.id,
        puntaje,
        acreditado,
        numero_intento: numeroIntento,
      })

    if (intentoError) {
      return NextResponse.json({ error: intentoError.message }, { status: 500 })
    }

    if (acreditado && ev.materia_id) {
      const admin = createAdminClient()
      const { error: califErr } = await admin.from('calificaciones').upsert(
        {
          alumno_id:          alumno.id,
          materia_id:         ev.materia_id,
          evaluacion_id:      params.id,
          acreditado:         true,
          fecha_acreditacion: new Date().toISOString(),
        },
        { onConflict: 'alumno_id,materia_id' }
      )
      if (califErr) {
        console.error('[evaluacion/enviar] calificaciones upsert:', califErr.message)
      }
    }

    // Logro: primer examen
    if (usados === 0) {
      await supabase
        .from('logros_alumno')
        .upsert(
          { alumno_id: alumno.id, tipo_logro: 'primer_examen' },
          { onConflict: 'alumno_id,tipo_logro', ignoreDuplicates: true }
        )
    }

    // Logro: examen perfecto
    if (puntaje === 100) {
      await supabase
        .from('logros_alumno')
        .upsert(
          { alumno_id: alumno.id, tipo_logro: 'examen_perfecto' },
          { onConflict: 'alumno_id,tipo_logro', ignoreDuplicates: true }
        )
    }

    // Respuesta backward-compatible con el componente EDVEX
    return NextResponse.json({
      calificacion:    puntaje / 10, // escala 0-10 para compatibilidad
      aprobado:        acreditado,
      total_preguntas: totalPregs,
      correctas,
      intento_numero:  numeroIntento,
      detalle,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
