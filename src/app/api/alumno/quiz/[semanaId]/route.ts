import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Quiz por semana — sin filtro por nivel (secundaria/preparatoria/demo).
 *
 * PostgREST:
 *   GET .../quiz_semana?select=*&semana_id=eq.{semanaId}&order=orden.asc
 * SQL equivalente:
 *   SELECT * FROM public.quiz_semana
 *   WHERE semana_id = $semanaId::uuid
 *   ORDER BY orden ASC;
 *
 * Se usa select('*') para incluir filas con solo `opciones` (JSONB) o solo opcion_a/b/c;
 * un select fijo sin `opciones` dejaba preguntas vacías en sec/prepa.
 */

/** Fila cruda de quiz_semana (schema usa columnas opcion_a/b/c/d en lugar de array — compatibilidad histórica) */
type QuizSemanaRow = {
  id: string
  semana_id?: string
  pregunta: string
  orden: number | null
  opciones?: unknown
  respuesta_correcta?: unknown
  explicacion?: string | null
  opcion_a?: string | null
  opcion_b?: string | null
  opcion_c?: string | null
  opcion_d?: string | null
}

function letterToIndex(letter: string): number {
  const c = letter.trim().toLowerCase()
  if (c === 'a') return 0
  if (c === 'b') return 1
  if (c === 'c') return 2
  if (c === 'd') return 3
  return 0
}

/** Índice 0..3: acepta letra a/b/c/d, número 0–3 o string "0".."3". */
function respuestaCorrectaToIndex(rc: unknown): number {
  if (typeof rc === 'number' && Number.isFinite(rc)) {
    const n = Math.trunc(rc)
    if (n >= 0 && n <= 3) return n
  }
  const s = String(rc ?? 'a').trim().toLowerCase()
  if (s === '0' || s === 'a') return 0
  if (s === '1' || s === 'b') return 1
  if (s === '2' || s === 'c') return 2
  if (s === '3' || s === 'd') return 3
  return letterToIndex(s)
}

/** Normaliza a la forma que consume `SemanaQuiz` */
function mapQuizSemanaRow(row: QuizSemanaRow) {
  const id = row.id
  const pregunta = row.pregunta ?? ''
  const orden = row.orden ?? 0
  const explicacionRaw = row.explicacion
  const explicacion =
    typeof explicacionRaw === 'string' && explicacionRaw.trim() !== ''
      ? explicacionRaw.trim()
      : undefined

  if (row.opcion_a != null && row.opcion_b != null && row.opcion_c != null) {
    // opcion_d es opcional (preguntas legacy de 3 opciones); filter(Boolean) elimina null/undefined
    const opciones = [row.opcion_a, row.opcion_b, row.opcion_c, row.opcion_d]
      .filter((o): o is string => o != null && o !== '')
      .map(String)
    return {
      id,
      pregunta,
      opciones,
      respuesta_correcta: respuestaCorrectaToIndex(row.respuesta_correcta),
      explicacion,
      orden,
    }
  }

  if (Array.isArray(row.opciones)) {
    const opciones = row.opciones.map(String)
    const rc = row.respuesta_correcta
    const respuesta_correcta =
      typeof rc === 'number' && rc >= 0 && rc <= 3 ? rc : respuestaCorrectaToIndex(rc)
    return {
      id,
      pregunta,
      opciones,
      respuesta_correcta,
      explicacion,
      orden,
    }
  }

  return null
}

async function fetchRespuestaPreviaJsonb(
  supabase: SupabaseClient,
  alumnoId: string,
  semanaId: string
): Promise<{ respuestas: Record<string, number>; completado_en: string } | null> {
  const { data, error } = await supabase
    .from('quiz_respuestas')
    .select('respuestas, completado_en')
    .eq('alumno_id', alumnoId)
    .eq('semana_id', semanaId)
    .maybeSingle()

  // Tabla legacy sin semana_id/respuestas → PostgREST devuelve error; seguir con filas por quiz_id
  if (error) return null
  if (!data?.respuestas || typeof data.respuestas !== 'object') return null
  return {
    respuestas: data.respuestas as Record<string, number>,
    completado_en: (data.completado_en as string) ?? new Date().toISOString(),
  }
}

async function fetchRespuestaPreviaLegacy(
  supabase: SupabaseClient,
  alumnoId: string,
  preguntaIds: string[]
): Promise<{ respuestas: Record<string, number>; completado_en: string } | null> {
  if (preguntaIds.length === 0) return null

  const { data: answers, error } = await supabase
    .from('quiz_respuestas')
    .select('quiz_id, respuesta, fecha')
    .eq('alumno_id', alumnoId)
    .in('quiz_id', preguntaIds)
    .order('fecha', { ascending: false })

  if (error || !answers?.length) return null

  const latest = new Map<string, { respuesta: string; fecha: string }>()
  for (const a of answers) {
    const qid = a.quiz_id as string
    if (!latest.has(qid)) {
      latest.set(qid, {
        respuesta: String((a as { respuesta?: string }).respuesta ?? 'a'),
        fecha: String((a as { fecha?: string }).fecha ?? ''),
      })
    }
  }

  if (latest.size !== preguntaIds.length) return null

  const respuestas: Record<string, number> = {}
  let completado_en = ''
  for (const id of preguntaIds) {
    const row = latest.get(id)
    if (!row) return null
    respuestas[id] = letterToIndex(row.respuesta)
    if (row.fecha > completado_en) completado_en = row.fecha
  }

  return { respuestas, completado_en }
}

async function saveRespuestasJsonb(
  supabase: SupabaseClient,
  alumnoId: string,
  semanaId: string,
  respuestas: Record<string, number>
) {
  return supabase.from('quiz_respuestas').upsert(
    {
      alumno_id: alumnoId,
      semana_id: semanaId,
      respuestas,
      completado_en: new Date().toISOString(),
    },
    { onConflict: 'alumno_id,semana_id', ignoreDuplicates: false }
  )
}


async function saveRespuestasLegacy(
  supabase: SupabaseClient,
  alumnoId: string,
  respuestas: Record<string, number>
) {
  const ids = Object.keys(respuestas)
  if (ids.length === 0) return { error: null as null }

  const { data: rows, error: qErr } = await supabase
    .from('quiz_semana')
    .select('id, respuesta_correcta')
    .in('id', ids)

  if (qErr || !rows?.length) return { error: qErr ?? new Error('Sin preguntas') }

  const expected = new Map(
    rows.map(r => {
      const rc = (r as { respuesta_correcta?: unknown }).respuesta_correcta
      const letter =
        typeof rc === 'number'
          ? String.fromCharCode(97 + (rc as number))
          : String(rc ?? 'a').toLowerCase().slice(0, 1)
      return [r.id as string, letter]
    })
  )

  const inserts = ids.map(quizId => {
    const idx = respuestas[quizId] ?? 0
    const letter = String.fromCharCode(97 + Math.min(3, Math.max(0, idx)))
    const exp = expected.get(quizId) ?? 'a'
    return {
      alumno_id: alumnoId,
      quiz_id: quizId,
      respuesta: letter,
      correcta: letter === exp,
    }
  })

  return supabase.from('quiz_respuestas').insert(inserts)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { semanaId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const semanaId = typeof params?.semanaId === 'string' ? params.semanaId.trim() : ''
    if (!semanaId) {
      return NextResponse.json({ error: 'semanaId requerido' }, { status: 400 })
    }

    const { data: rawRows, error: quizErr } = await supabase
      .from('quiz_semana')
      .select('*')
      .eq('semana_id', semanaId)
      .order('orden', { ascending: true })

    if (quizErr) {
      console.error('[quiz GET] quiz_semana', quizErr)
      return NextResponse.json({ error: 'Error al cargar preguntas' }, { status: 500 })
    }

    const preguntas = (rawRows as QuizSemanaRow[] | null)
      ?.map(mapQuizSemanaRow)
      .filter((p): p is NonNullable<typeof p> => p != null) ?? []

    const { data: alumnoData } = await supabase
      .from('alumnos')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const { id: alumnoId } = alumnoData as { id: string }

    let respuestaPrevia =
      (await fetchRespuestaPreviaJsonb(supabase, alumnoId, semanaId)) ??
      (await fetchRespuestaPreviaLegacy(
        supabase,
        alumnoId,
        preguntas.map(p => p.id)
      ))

    return NextResponse.json({
      preguntas,
      respuesta_previa: respuestaPrevia,
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const semanaId = typeof params?.semanaId === 'string' ? params.semanaId.trim() : ''
    if (!semanaId) {
      return NextResponse.json({ error: 'semanaId requerido' }, { status: 400 })
    }

    const body = await request.json()
    const { respuestas } = body as { respuestas: Record<string, number> }

    if (!respuestas || typeof respuestas !== 'object') {
      return NextResponse.json({ error: 'respuestas requeridas' }, { status: 400 })
    }

    const { data: alumnoData } = await supabase
      .from('alumnos')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const { id: alumnoId } = alumnoData as { id: string }

    const jsonb = await saveRespuestasJsonb(supabase, alumnoId, semanaId, respuestas)
    if (!jsonb.error) {
      return NextResponse.json({ ok: true })
    }

    const msg = (jsonb.error.message ?? '').toLowerCase()
    const isSchemaMismatch =
      msg.includes('semana_id') ||
      msg.includes('respuestas') ||
      msg.includes('column') ||
      jsonb.error.code === 'PGRST204' ||
      jsonb.error.code === '42703'

    if (!isSchemaMismatch) {
      console.error('[quiz POST] upsert jsonb', jsonb.error)
      return NextResponse.json({ error: 'Error al guardar respuestas' }, { status: 500 })
    }

    const legacy = await saveRespuestasLegacy(supabase, alumnoId, respuestas)
    if (legacy.error) {
      console.error('[quiz POST] insert legacy', legacy.error)
      return NextResponse.json({ error: 'Error al guardar respuestas' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[quiz POST]', e)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
