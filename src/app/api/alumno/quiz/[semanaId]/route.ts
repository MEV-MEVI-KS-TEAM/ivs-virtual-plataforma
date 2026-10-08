import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarContextoAcceso, tieneAccesoMateria } from '@/lib/acceso-materias'
import {
  indiceRespuesta,
  letraDeIndice,
  opcionesQuiz,
  preguntaPublica,
  primerasRespuestas,
  veredictoQuiz,
  type QuizSemanaRow,
  type ResultadoQuiz,
} from '@/lib/quiz/quiz-semana'

/**
 * Quiz por semana. Acceso gateado por pertenencia de la semana a una materia
 * accesible para el alumno (semana → mes_id → meses_contenido → materia, y el
 * criterio canon de lib/acceso-materias).
 *
 * Ronda 2 de seguridad (port de D22d-1 de la plantilla, K-d1):
 *   * GET  → preguntas por LISTA BLANCA (sin clave ni explicación) + el
 *            veredicto de las que el alumno YA contestó (su primera respuesta,
 *            recalculada contra la clave).
 *   * POST { pregunta_id, respuesta } → califica UNA pregunta en el servidor y
 *            PERSISTE la primera respuesta (candado: si ya la contestó, devuelve
 *            ese veredicto y no escribe). Devuelve { tu_respuesta, es_correcta,
 *            explicacion? }: nunca la opción correcta.
 *   * POST { respuestas } → compatibilidad con el bundle anterior (una versión).
 * Banco y respuestas con el service role DESPUÉS del gate: la migración de
 * seguridad deja al alumno sin lectura de la clave/explicación de quiz_semana y
 * sin escritura de quiz_respuestas por /rest/v1.
 */

type AccesoQuiz =
  | { ok: true }
  | { ok: false; status: number; error: string }

/** Gate canon: la semana debe pertenecer a una materia accesible para el alumno. */
async function verificarAccesoQuiz(
  supabase: SupabaseClient,
  userId: string,
  semanaId: string
): Promise<AccesoQuiz> {
  const { data: semanaData } = await supabase
    .from('semanas')
    .select('id, mes_id')
    .eq('id', semanaId)
    .maybeSingle()

  if (!semanaData) return { ok: false, status: 404, error: 'Semana no encontrada' }

  const { data: mesData } = await supabase
    .from('meses_contenido')
    .select('materia_id, materias(id, nombre, nivel)')
    .eq('id', (semanaData as { mes_id: string }).mes_id)
    .maybeSingle()

  const matRel = (mesData as { materias?: unknown } | null)?.materias
  const materia = (Array.isArray(matRel) ? matRel[0] : matRel) as
    | { id: string; nombre: string; nivel: string | null }
    | undefined

  if (!materia) return { ok: false, status: 404, error: 'Materia no encontrada' }

  const { data: alumnoData } = await supabase
    .from('alumnos')
    .select('nivel, meses_desbloqueados, modalidad, duracion_meses, inscripcion_pagada')
    .eq('id', userId)
    .single()

  if (!alumnoData) return { ok: false, status: 404, error: 'Alumno no encontrado' }

  const alumno = alumnoData as {
    nivel: string | null; meses_desbloqueados: number
    modalidad: string | null; duracion_meses: number | null
    inscripcion_pagada: boolean | null
  }

  const { materias, acreditadas } = await cargarContextoAcceso(
    supabase, userId, alumno.nivel ?? materia.nivel
  )
  const acceso = tieneAccesoMateria(alumno, materia, materias, acreditadas)
  if (!acceso.acceso) {
    return { ok: false, status: 403, error: 'No tienes acceso a este contenido' }
  }
  return { ok: true }
}

/**
 * Respuestas ya guardadas del alumno (forma legacy de IVS: una fila por
 * pregunta con la letra), con el service role, ordenadas por fecha: la PRIMERA
 * de cada pregunta es la que cuenta (candado).
 */
async function leerPrimerasRespuestas(
  admin: SupabaseClient,
  alumnoId: string,
  filas: QuizSemanaRow[],
): Promise<Record<string, number>> {
  if (filas.length === 0) return {}
  const { data, error } = await admin
    .from('quiz_respuestas')
    .select('quiz_id, respuesta, fecha')
    .eq('alumno_id', alumnoId)
    .in('quiz_id', filas.map(f => f.id))
    .order('fecha', { ascending: true })
  if (error) throw new Error(error.message)
  return primerasRespuestas(filas, (data ?? []) as { quiz_id: string; respuesta: unknown }[])
}

/** Inserta respuestas NUEVAS (las ya contestadas nunca se reemplazan). */
async function guardarRespuestas(
  admin: SupabaseClient,
  alumnoId: string,
  nuevas: { fila: QuizSemanaRow; idx: number }[],
): Promise<{ error: { code?: string; message: string } | null }> {
  if (nuevas.length === 0) return { error: null }
  const { error } = await admin.from('quiz_respuestas').insert(
    nuevas.map(n => ({
      alumno_id: alumnoId,
      quiz_id: n.fila.id,
      respuesta: letraDeIndice(n.fila, n.idx),
      // Informativo: el veredicto se RECALCULA siempre contra la clave al leer.
      correcta: veredictoQuiz(n.fila, n.idx).es_correcta,
    })),
  )
  return { error: error ? { code: error.code, message: error.message } : null }
}

/** Sesión + gate de la semana. Devuelve la respuesta de error o el alumno. */
async function autorizar(semanaIdCrudo: unknown) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }

  const semanaId = typeof semanaIdCrudo === 'string' ? semanaIdCrudo.trim() : ''
  if (!semanaId) return { error: NextResponse.json({ error: 'semanaId requerido' }, { status: 400 }) }

  const acceso = await verificarAccesoQuiz(supabase, user.id, semanaId)
  if (!acceso.ok) return { error: NextResponse.json({ error: acceso.error }, { status: acceso.status }) }

  // alumnos.id = user.id (existencia verificada en el gate)
  return { alumnoId: user.id, semanaId }
}

async function leerFilasSemana(admin: SupabaseClient, semanaId: string) {
  return admin
    .from('quiz_semana')
    .select('*')
    .eq('semana_id', semanaId)
    .order('orden', { ascending: true })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { semanaId: string } }
) {
  try {
    const a = await autorizar(params?.semanaId)
    if ('error' in a) return a.error
    const { alumnoId, semanaId } = a

    // Banco y respuestas con el service role DESPUÉS del gate: la migración de
    // seguridad le quita al alumno la lectura de quiz_semana.respuesta_correcta
    // y quiz_semana.explicacion por /rest/v1.
    const admin = createAdminClient()
    const { data: rawRows, error: quizErr } = await leerFilasSemana(admin, semanaId)
    if (quizErr) {
      console.error('[quiz GET] quiz_semana', quizErr)
      return NextResponse.json({ error: 'Error al cargar preguntas' }, { status: 500 })
    }

    const filas = ((rawRows ?? []) as QuizSemanaRow[]).filter(f => preguntaPublica(f) !== null)
    const preguntas = filas.map(f => preguntaPublica(f)!)
    const respuestas = await leerPrimerasRespuestas(admin, alumnoId, filas)

    // El veredicto (y la explicación) SOLO de lo ya contestado.
    const resultados: Record<string, ResultadoQuiz> = {}
    for (const f of filas) {
      const idx = respuestas[f.id]
      if (idx !== undefined) resultados[f.id] = veredictoQuiz(f, idx)
    }
    const total = preguntas.length
    const contestadas = Object.keys(resultados).length
    return NextResponse.json({
      preguntas,
      resultados,
      completado: total > 0 && contestadas === total,
      aciertos: Object.values(resultados).filter(r => r.es_correcta).length,
      total,
    })
  } catch (e) {
    console.error('[quiz GET]', e)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { semanaId: string } }
) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { pregunta_id?: unknown; respuesta?: unknown; respuestas?: unknown }
      | null

    // Mismo gate que el GET: guardar respuestas de una semana bloqueada
    // dejaría el hueco vivo por POST directo.
    const a = await autorizar(params?.semanaId)
    if ('error' in a) return a.error
    const { alumnoId, semanaId } = a
    const admin = createAdminClient()

    // ── UNA pregunta: califica, guarda la PRIMERA respuesta y devuelve el
    //    veredicto { es_correcta, explicacion } de ESA pregunta ─────────────
    if (body && typeof body.pregunta_id === 'string' && body.pregunta_id !== '') {
      // Con filtro de semana: un id de otra semana (o de una bloqueada) no pasa.
      const { data: fila, error } = await admin
        .from('quiz_semana')
        .select('*')
        .eq('id', body.pregunta_id)
        .eq('semana_id', semanaId)
        .maybeSingle()
      if (error) return NextResponse.json({ error: 'Error al leer la pregunta' }, { status: 500 })
      if (!fila) return NextResponse.json({ error: 'La pregunta no es de esta semana.' }, { status: 400 })
      const row = fila as QuizSemanaRow
      const opciones = opcionesQuiz(row)
      const idx = opciones ? indiceRespuesta(body.respuesta, opciones.length) : null
      if (idx === null) return NextResponse.json({ error: 'Respuesta inválida.' }, { status: 400 })

      // Candado: la primera respuesta es la que cuenta.
      const previas = await leerPrimerasRespuestas(admin, alumnoId, [row])
      if (previas[row.id] !== undefined) {
        return NextResponse.json({ ...veredictoQuiz(row, previas[row.id]), ya_respondida: true })
      }
      const g = await guardarRespuestas(admin, alumnoId, [{ fila: row, idx }])
      if (g.error) {
        // 23505 = índice único (alumno, quiz_id) de la migración de seguridad:
        // otro toque ganó la carrera; manda el veredicto de la respuesta guardada.
        if (g.error.code === '23505') {
          const ganadora = await leerPrimerasRespuestas(admin, alumnoId, [row])
          if (ganadora[row.id] !== undefined) {
            return NextResponse.json({ ...veredictoQuiz(row, ganadora[row.id]), ya_respondida: true })
          }
        }
        console.error('[quiz POST] guardar', g.error)
        return NextResponse.json({ error: 'Error al guardar tu respuesta' }, { status: 500 })
      }
      return NextResponse.json(veredictoQuiz(row, idx))
    }

    // ── Compatibilidad (una versión): el bundle anterior manda todo junto al
    //    final. Todo o nada, con service role; lo ya contestado no se toca. ──
    if (body && body.respuestas && typeof body.respuestas === 'object' && !Array.isArray(body.respuestas)) {
      const enviadas = body.respuestas as Record<string, unknown>
      const ids = Object.keys(enviadas)
      const { data: rawRows, error } = await leerFilasSemana(admin, semanaId)
      if (error) return NextResponse.json({ error: 'Error al leer las preguntas' }, { status: 500 })
      const filas = ((rawRows ?? []) as QuizSemanaRow[]).filter(f => preguntaPublica(f) !== null)
      const porId = new Map(filas.map(f => [f.id, f]))
      const validas: { fila: QuizSemanaRow; idx: number }[] = []
      for (const id of ids) {
        const fila = porId.get(id)
        const opciones = fila ? opcionesQuiz(fila) : null
        const idx = fila && opciones ? indiceRespuesta(enviadas[id], opciones.length) : null
        // Un id ajeno o un índice inválido rechaza el envío completo.
        if (!fila || idx === null) {
          return NextResponse.json({ error: 'Respuestas inválidas.' }, { status: 400 })
        }
        validas.push({ fila, idx })
      }
      const previas = await leerPrimerasRespuestas(admin, alumnoId, filas)
      const nuevas = validas.filter(v => previas[v.fila.id] === undefined)
      const g = await guardarRespuestas(admin, alumnoId, nuevas)
      if (g.error && g.error.code !== '23505') {
        console.error('[quiz POST] guardar (compat)', g.error)
        return NextResponse.json({ error: 'Error al guardar respuestas' }, { status: 500 })
      }
      const finales = await leerPrimerasRespuestas(admin, alumnoId, filas)
      const correctas = filas.filter(f => finales[f.id] !== undefined && veredictoQuiz(f, finales[f.id]).es_correcta).length
      return NextResponse.json({ ok: true, correctas, total: filas.length })
    }

    return NextResponse.json({ error: 'respuestas requeridas' }, { status: 400 })
  } catch (e) {
    console.error('[quiz POST]', e)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
