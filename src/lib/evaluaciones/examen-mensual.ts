/**
 * Examen mensual (evaluaciones + preguntas) — lectura y calificación en el
 * servidor. Portado de la plantilla PV (D22d-1, #273) al esquema legacy de IVS
 * (ronda 2 de soporte, 8-oct-2026).
 *
 * SEGURIDAD — la clave (`preguntas.respuesta_correcta`) la lee SOLO el servidor,
 * con el service role, DESPUÉS del gate de acceso de la ruta:
 *   * Lo que sale al navegador mientras el alumno contesta es la pregunta
 *     sanitizada (lista blanca: sin clave).
 *   * Revisión DIFERIDA: mientras el alumno pueda volver a presentar, solo ve su
 *     puntaje. El ✓/✗ por pregunta llega cuando el examen se CIERRA (aprobó o usó
 *     su último intento).
 *   * Diferencia con la plantilla (decisión de Kevin para IVS): al cerrar NUNCA
 *     viaja cuál era la opción correcta, ni siquiera de lo contestado. Solo ✓/✗.
 *
 * Diferencias de esquema con la plantilla: IVS no tiene `preguntas.activa`
 * (no se filtra), y el intento guarda `respuestas` como {pregunta_id: letra}.
 *
 * Este archivo no importa nada de servidor ni usa alias `@/`: lo prueba
 * `tests/unit/examen-mensual.test.mjs` con `node --test`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Calificación mínima del examen mensual (porcentaje). La misma que antes del port. */
export const MINIMO_APROBATORIO_MENSUAL = 60

const LETRAS = ['a', 'b', 'c', 'd'] as const
type Letra = (typeof LETRAS)[number]

/** Fila de `preguntas` tal como la lee el SERVIDOR: con la clave. Nunca sale tal cual. */
export interface PreguntaEvaluacion {
  id: string
  orden: number | null
  pregunta: string
  opcion_a: string | null
  opcion_b: string | null
  opcion_c: string | null
  opcion_d: string | null
  respuesta_correcta: string | null
}

/** Lo único que ve el alumno mientras contesta (forma que consume la página del examen). */
export interface PreguntaEvaluacionPublica {
  id: string
  numero: number
  texto: string
  texto_en: string
  tipo: 'OPCION_MULTIPLE'
  opciones: string[]
  opciones_en: string[]
  puntos: number
}

/** Una pregunta en la revisión de un envío. NUNCA lleva la opción correcta. */
export interface DetalleEvaluacion {
  pregunta_id: string
  numero: number
  texto: string
  texto_en: string
  tipo: 'opcion_multiple'
  opciones: string[]
  opciones_en: string[]
  /** Índice que mandó el alumno, o -1 si no contestó. */
  respuesta_alumno: number
  contestada: boolean
  retroalimentacion: ''
  /** Solo si el examen se cerró con este envío (revelar). */
  es_correcta?: boolean
}

/**
 * Lee las preguntas de una evaluación con el service role (con la clave).
 * Llamar SOLO después del gate de acceso de la ruta.
 */
export async function leerPreguntasEvaluacion(
  admin: SupabaseClient,
  evaluacionId: string,
): Promise<{ preguntas: PreguntaEvaluacion[]; error: string | null }> {
  const { data, error } = await admin
    .from('preguntas')
    .select('id, orden, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta')
    .eq('evaluacion_id', evaluacionId)
    .order('orden')
  if (error) return { preguntas: [], error: error.message }
  return { preguntas: (data ?? []) as unknown as PreguntaEvaluacion[], error: null }
}

/**
 * Opciones NO vacías de la pregunta, con la letra de su columna. El navegador ve
 * solo los textos en este orden; el índice i que regresa el alumno es la
 * posición en ESTA lista, y su letra es la de la columna real. Así una opción
 * intermedia vacía no corre las letras (defecto latente del código anterior,
 * que convertía el índice filtrado directo a a/b/c/d).
 */
export function opcionesConLetra(
  p: Pick<PreguntaEvaluacion, 'opcion_a' | 'opcion_b' | 'opcion_c' | 'opcion_d'>,
): { letra: Letra; texto: string }[] {
  const crudas: [Letra, string | null][] = [
    ['a', p.opcion_a], ['b', p.opcion_b], ['c', p.opcion_c], ['d', p.opcion_d],
  ]
  return crudas
    .filter(([, t]) => typeof t === 'string' && t !== '')
    .map(([letra, texto]) => ({ letra, texto: texto as string }))
}

export const opcionesDe = (p: Pick<PreguntaEvaluacion, 'opcion_a' | 'opcion_b' | 'opcion_c' | 'opcion_d'>): string[] =>
  opcionesConLetra(p).map(o => o.texto)

/** Lista blanca: la única forma en que una pregunta del examen sale al navegador antes de contestar. */
export function sanitizarPreguntaEvaluacion(p: PreguntaEvaluacion, i: number): PreguntaEvaluacionPublica {
  const opciones = opcionesDe(p)
  return {
    id: p.id,
    numero: p.orden ?? i + 1,
    texto: p.pregunta,
    texto_en: p.pregunta,
    tipo: 'OPCION_MULTIPLE',
    opciones,
    opciones_en: opciones,
    puntos: 1,
  }
}

/** Índice de la respuesta si es un entero dentro de las opciones de ESTA pregunta; si no, -1. */
export function indiceValido(v: unknown, nOpciones: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < nOpciones ? v : -1
}

/** Letra (a-d) normalizada de la clave; null si la fila trae algo que no es a/b/c/d. */
export function letraClave(clave: unknown): Letra | null {
  const s = String(clave ?? '').trim().toLowerCase()
  return (LETRAS as readonly string[]).includes(s) ? (s as Letra) : null
}

/**
 * Valida el cuerpo del envío ANTES de calificar. Rechaza (no recorta):
 *   * que `respuestas` no sea un objeto;
 *   * un id que no es pregunta de ESTE examen;
 *   * un valor que no es un índice entero dentro de las opciones de esa pregunta;
 *   * un envío sin ninguna respuesta (era el oráculo de la clave).
 */
export function validarEnvio(
  preguntas: PreguntaEvaluacion[],
  respuestas: unknown,
): { ok: true; respuestas: Record<string, number> } | { ok: false; error: string } {
  if (!respuestas || typeof respuestas !== 'object' || Array.isArray(respuestas)) {
    return { ok: false, error: 'Contesta al menos una pregunta antes de enviar la evaluación.' }
  }
  const porId = new Map(preguntas.map(p => [p.id, p]))
  const limpias: Record<string, number> = {}
  for (const [id, v] of Object.entries(respuestas as Record<string, unknown>)) {
    const p = porId.get(id)
    if (!p) return { ok: false, error: 'Respuestas inválidas.' }
    const idx = indiceValido(v, opcionesDe(p).length)
    if (idx < 0) return { ok: false, error: 'Respuestas inválidas.' }
    limpias[id] = idx
  }
  if (Object.keys(limpias).length === 0) {
    return { ok: false, error: 'Contesta al menos una pregunta antes de enviar la evaluación.' }
  }
  return { ok: true, respuestas: limpias }
}

/**
 * Califica un envío. Una pregunta sin contestar cuenta como incorrecta y no se
 * omite del total (el denominador son todas las preguntas del examen).
 *
 * `revelar`: la ruta lo pone en `true` SOLO cuando el examen se cierra con este
 * envío. Con `false` no viaja ni el ✓/✗. Con `true` viaja el ✓/✗, NUNCA la
 * opción correcta.
 *
 * `respuestasLetra` es lo que se guarda en `intentos_evaluacion.respuestas`
 * ({pregunta_id: letra a-d}) para poder recalcular el intento si cambia una clave.
 */
export function calificarEvaluacion(
  preguntas: PreguntaEvaluacion[],
  respuestas: Record<string, unknown>,
  { revelar }: { revelar: boolean },
): {
  correctas: number
  contestadas: number
  total: number
  puntaje: number
  acreditado: boolean
  detalle: DetalleEvaluacion[]
  respuestasLetra: Record<string, string>
} {
  let correctas = 0
  let contestadas = 0
  const respuestasLetra: Record<string, string> = {}
  const detalle = preguntas.map(p => {
    const conLetra = opcionesConLetra(p)
    const opciones = conLetra.map(o => o.texto)
    const idx = indiceValido(respuestas?.[p.id], opciones.length)
    const contestada = idx >= 0
    const letraAlumno = contestada ? conLetra[idx].letra : null
    const clave = letraClave(p.respuesta_correcta)
    // Una clave ilegible nunca da por buena una respuesta.
    const esCorrecta = letraAlumno !== null && clave !== null && letraAlumno === clave
    if (esCorrecta) correctas++
    if (contestada) {
      contestadas++
      respuestasLetra[p.id] = letraAlumno as string
    }

    const base: DetalleEvaluacion = {
      pregunta_id: p.id,
      numero: p.orden ?? 0,
      texto: p.pregunta,
      texto_en: p.pregunta,
      tipo: 'opcion_multiple',
      opciones,
      opciones_en: opciones,
      respuesta_alumno: idx,
      contestada,
      retroalimentacion: '',
    }
    return revelar ? { ...base, es_correcta: esCorrecta } : base
  })

  const total = preguntas.length
  const puntaje = total > 0 ? Math.round((correctas / total) * 100) : 0
  return {
    correctas,
    contestadas,
    total,
    puntaje,
    acreditado: puntaje >= MINIMO_APROBATORIO_MENSUAL,
    detalle,
    respuestasLetra,
  }
}

/** Estado del examen para el alumno según sus intentos previos. Aprobar CIERRA. */
export function estadoExamen(
  previos: { acreditado: boolean | null }[],
  intentosPermitidos: number,
): 'abierta' | 'aprobada' | 'sin_intentos' {
  if (previos.some(r => r.acreditado === true)) return 'aprobada'
  if (previos.length >= intentosPermitidos) return 'sin_intentos'
  return 'abierta'
}
