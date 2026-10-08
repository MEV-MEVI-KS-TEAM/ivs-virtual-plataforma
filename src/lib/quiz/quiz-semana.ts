/**
 * Quiz semanal — forma pública de las preguntas y calificación en el servidor.
 * Portado de la plantilla PV (D22d-1, #273, decisión K-d1) al esquema legacy de
 * IVS (ronda 2 de soporte, 8-oct-2026).
 *
 * Antes el GET de IVS mandaba al navegador la `explicacion` de TODAS las
 * preguntas antes de contestar (y la explicación delata la respuesta), y la
 * verificación por pregunta devolvía `respuesta_correcta` para cualquier índice
 * (oráculo). Ahora:
 *   * el navegador recibe la pregunta por LISTA BLANCA (id, texto, opciones,
 *     orden): nunca la clave ni la explicación antes de contestar;
 *   * califica el SERVIDOR, pregunta por pregunta, con candado de PRIMERA
 *     respuesta: la que cuenta es la primera que el alumno dio, y el veredicto
 *     se recalcula siempre contra la clave (nunca se confía en el `correcta`
 *     guardado);
 *   * tras contestar viaja el ✓/✗ y la explicación de ESA pregunta, nunca la
 *     opción correcta (igual que la plantilla);
 *   * no hay letra por defecto: una clave ilegible no se convierte en «a», y un
 *     índice fuera de las opciones se rechaza en vez de recortarse.
 *
 * Esquema IVS: quiz_semana con opcion_a..d (d vacía en las preguntas de 3
 * opciones) y clave en letra; quiz_respuestas legacy (id, alumno_id, quiz_id,
 * respuesta = letra, correcta, fecha). Se tolera también la forma `opciones`
 * JSONB con clave numérica de otros clones.
 *
 * Este archivo no importa nada de servidor ni usa alias `@/`: lo prueba
 * `tests/unit/quiz-semana.test.mjs` con `node --test`.
 */

const LETRAS = ['a', 'b', 'c', 'd'] as const

/** Fila cruda de quiz_semana. Solo el servidor la ve. */
export interface QuizSemanaRow {
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

/** Lo único que ve el alumno antes de contestar. */
export interface PreguntaQuizPublica {
  id: string
  pregunta: string
  opciones: string[]
  orden: number
}

/** El veredicto de UNA pregunta ya contestada (lo calcula el servidor). */
export interface ResultadoQuiz {
  tu_respuesta: number
  es_correcta: boolean
  explicacion?: string
}

/**
 * Opciones NO vacías de la fila con la letra que las identifica; null si la fila
 * no trae opciones legibles. El índice que manda el navegador es la posición en
 * esta lista.
 */
export function opcionesQuizConLetra(row: QuizSemanaRow): { letra: string; texto: string }[] | null {
  if (row.opcion_a != null && row.opcion_b != null && row.opcion_c != null) {
    const crudas: [string, string | null | undefined][] = [
      ['a', row.opcion_a], ['b', row.opcion_b], ['c', row.opcion_c], ['d', row.opcion_d],
    ]
    // opcion_d es opcional (preguntas legacy de 3 opciones)
    return crudas
      .filter(([, t]) => t != null && t !== '')
      .map(([letra, t]) => ({ letra, texto: String(t) }))
  }
  if (Array.isArray(row.opciones)) {
    return row.opciones.slice(0, LETRAS.length).map((t, i) => ({ letra: LETRAS[i], texto: String(t) }))
  }
  return null
}

export function opcionesQuiz(row: QuizSemanaRow): string[] | null {
  const o = opcionesQuizConLetra(row)
  return o ? o.map(x => x.texto) : null
}

/** Lista blanca: la única forma en que una pregunta del quiz sale al navegador. */
export function preguntaPublica(row: QuizSemanaRow): PreguntaQuizPublica | null {
  const opciones = opcionesQuiz(row)
  if (!opciones || opciones.length === 0) return null
  return { id: row.id, pregunta: row.pregunta ?? '', opciones, orden: row.orden ?? 0 }
}

/**
 * Letra de la clave (a-d), desde letra a-d, número 0-3 o texto "0".."3".
 * null si no se entiende: SIN letra por defecto (antes caía en «a»).
 */
export function claveQuiz(row: QuizSemanaRow): string | null {
  const rc = row.respuesta_correcta
  if (typeof rc === 'number') return Number.isInteger(rc) && rc >= 0 && rc <= 3 ? LETRAS[rc] : null
  const s = String(rc ?? '').trim().toLowerCase()
  if ((LETRAS as readonly string[]).includes(s)) return s
  const j = ['0', '1', '2', '3'].indexOf(s)
  return j >= 0 ? LETRAS[j] : null
}

/** Índice de la respuesta si es un entero dentro de las opciones de ESTA pregunta; si no, null. */
export function indiceRespuesta(v: unknown, nOpciones: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < nOpciones ? v : null
}

/** Letra guardada en quiz_respuestas.respuesta para el índice `idx` de ESTA fila. */
export function letraDeIndice(row: QuizSemanaRow, idx: number): string | null {
  const o = opcionesQuizConLetra(row)
  return o && idx >= 0 && idx < o.length ? o[idx].letra : null
}

/** Índice (posición en las opciones de ESTA fila) de una letra guardada; null si no se entiende. */
export function indiceDeLetra(row: QuizSemanaRow, letra: unknown): number | null {
  const o = opcionesQuizConLetra(row)
  if (!o) return null
  const s = String(letra ?? '').trim().toLowerCase()
  const i = o.findIndex(x => x.letra === s)
  return i >= 0 ? i : null
}

/**
 * Veredicto de una respuesta YA contestada: si fue correcta y la explicación de
 * ESA pregunta. Una clave ilegible nunca da por buena una respuesta. No incluye
 * la opción correcta.
 */
export function veredictoQuiz(row: QuizSemanaRow, idx: number): ResultadoQuiz {
  const clave = claveQuiz(row)
  const letra = letraDeIndice(row, idx)
  const exp = typeof row.explicacion === 'string' && row.explicacion.trim() !== '' ? row.explicacion.trim() : undefined
  return {
    tu_respuesta: idx,
    es_correcta: clave !== null && letra !== null && letra === clave,
    ...(exp ? { explicacion: exp } : {}),
  }
}

/**
 * Primera respuesta por pregunta a partir de las filas legacy de quiz_respuestas
 * (ordenadas por fecha ascendente): la primera cuenta (candado).
 */
export function primerasRespuestas(
  filasQuiz: QuizSemanaRow[],
  respuestasGuardadas: { quiz_id: string; respuesta: unknown }[],
): Record<string, number> {
  const porId = new Map(filasQuiz.map(f => [f.id, f]))
  const out: Record<string, number> = {}
  for (const r of respuestasGuardadas) {
    if (out[r.quiz_id] !== undefined) continue
    const fila = porId.get(r.quiz_id)
    if (!fila) continue
    const idx = indiceDeLetra(fila, r.respuesta)
    if (idx !== null) out[r.quiz_id] = idx
  }
  return out
}
