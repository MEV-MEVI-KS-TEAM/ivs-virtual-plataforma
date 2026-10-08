import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cargarContextoAcceso, dentroDeVentana } from '@/lib/acceso-materias'
import {
  calificarEvaluacion,
  estadoExamen,
  leerPreguntasEvaluacion,
  validarEnvio,
} from '@/lib/evaluaciones/examen-mensual'

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

    // ── Ronda 2 (port de D22d-1) ──────────────────────────────────────────
    // Intentos, preguntas (con la clave) y el INSERT del intento con el
    // service role, DESPUÉS del gate. La migración de seguridad le quita al
    // alumno la escritura de intentos_evaluacion por /rest/v1: con su sesión
    // se fabricaba un «100» acreditado (y el trigger le daba la calificación).
    const admin = createAdminClient()
    const { data: previos, error: prevErr } = await admin
      .from('intentos_evaluacion')
      .select('acreditado')
      .eq('alumno_id', alumno.id)
      .eq('evaluacion_id', params.id)
    if (prevErr) return NextResponse.json({ error: 'Error al leer tus intentos' }, { status: 500 })

    const estado = estadoExamen((previos ?? []) as { acreditado: boolean | null }[], ev.intentos_permitidos)
    // Aprobar CIERRA el examen: un envío más no se califica ni trae revisión.
    if (estado === 'aprobada') {
      return NextResponse.json(
        { error: 'Ya aprobaste este examen: no se puede volver a presentar.' },
        { status: 409 }
      )
    }
    if (estado === 'sin_intentos') {
      return NextResponse.json({ error: 'No tienes más intentos disponibles' }, { status: 400 })
    }
    const usados = (previos ?? []).length

    const leidas = await leerPreguntasEvaluacion(admin, params.id)
    if (leidas.error) {
      return NextResponse.json({ error: 'Error al obtener preguntas' }, { status: 500 })
    }
    const pregs = leidas.preguntas
    if (pregs.length === 0) {
      return NextResponse.json({ error: 'Esta evaluación no tiene preguntas' }, { status: 409 })
    }

    // Respuestas del alumno: {pregunta_id: índice}. Un envío vacío, un id que
    // no es de este examen o un índice inválido se RECHAZAN (400) sin gastar
    // intento: el envío en blanco era el oráculo de la clave (Bug 69).
    const body = await request.json().catch(() => null)
    const validado = validarEnvio(pregs, (body as { respuestas?: unknown } | null)?.respuestas)
    if (!validado.ok) {
      return NextResponse.json({ error: validado.error }, { status: 400 })
    }

    const numeroIntento = usados + 1
    // Primera pasada SIN revelar, solo para saber si aprobó. Se revela el ✓/✗
    // (nunca la opción correcta) solo si este envío CIERRA el examen: aprobó o
    // era su último intento. Mientras pueda volver a presentar, ve su puntaje.
    const previo = calificarEvaluacion(pregs, validado.respuestas, { revelar: false })
    const revelar = previo.acreditado || numeroIntento >= ev.intentos_permitidos
    const { correctas, total: totalPregs, puntaje, acreditado, detalle, respuestasLetra } =
      revelar ? calificarEvaluacion(pregs, validado.respuestas, { revelar: true }) : previo

    // Se guarda {pregunta_id: letra}: en adelante cada intento se puede recalcular.
    const { error: intentoError } = await admin
      .from('intentos_evaluacion')
      .insert({
        alumno_id:      alumno.id,
        evaluacion_id:  params.id,
        puntaje,
        acreditado,
        numero_intento: numeroIntento,
        respuestas:     respuestasLetra,
      })

    if (intentoError) {
      // 23505 = índice único (alumno, evaluación, numero_intento) de la migración
      // de seguridad: dos envíos simultáneos; el segundo no cuenta.
      if (intentoError.code === '23505') {
        return NextResponse.json({ error: 'Este intento ya se registró. Recarga la página.' }, { status: 409 })
      }
      console.error('[evaluacion/enviar] insert intento:', intentoError.code, intentoError.message)
      return NextResponse.json({ error: 'Error al guardar tu intento' }, { status: 500 })
    }

    // La calificación la crea el trigger fn_intento_a_calificacion (SECURITY
    // DEFINER, con folio). Respaldo por si el trigger no estuviera: solo si aún
    // no hay calificación acreditada, para no pisar fecha_acreditacion ni folio.
    if (acreditado && ev.materia_id) {
      const { data: califPrev, error: califReadErr } = await admin
        .from('calificaciones')
        .select('acreditado')
        .eq('alumno_id', alumno.id)
        .eq('materia_id', ev.materia_id)
        .maybeSingle()
      if (califReadErr) {
        console.error('[evaluacion/enviar] calificaciones read:', califReadErr.message)
      } else if ((califPrev as { acreditado?: boolean } | null)?.acreditado !== true) {
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
    }

    // Logros con el service role: la migración le quita al alumno el INSERT
    // de logros_alumno (se fabricaba insignias por /rest/v1).
    if (usados === 0) {
      await admin
        .from('logros_alumno')
        .upsert(
          { alumno_id: alumno.id, tipo_logro: 'primer_examen' },
          { onConflict: 'alumno_id,tipo_logro', ignoreDuplicates: true }
        )
    }
    if (puntaje === 100) {
      await admin
        .from('logros_alumno')
        .upsert(
          { alumno_id: alumno.id, tipo_logro: 'examen_perfecto' },
          { onConflict: 'alumno_id,tipo_logro', ignoreDuplicates: true }
        )
    }

    // Sin `respuesta_correcta` en ningún caso. `revision_completa` dice si el
    // detalle trae el ✓/✗ (examen cerrado) o solo el puntaje (revisión diferida).
    return NextResponse.json({
      calificacion:       puntaje / 10, // escala 0-10 para compatibilidad
      aprobado:           acreditado,
      total_preguntas:    totalPregs,
      correctas,
      intento_numero:     numeroIntento,
      intentos_restantes: Math.max(0, ev.intentos_permitidos - numeroIntento),
      revision_completa:  revelar,
      detalle,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
