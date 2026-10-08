// Pruebas de la calificación del examen mensual (servidor). Corre con:
//   pnpm test:unit        (node --test; Node >= 23.6 quita los tipos del .ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calificarEvaluacion,
  estadoExamen,
  indiceValido,
  letraClave,
  opcionesDe,
  sanitizarPreguntaEvaluacion,
  validarEnvio,
} from '../../src/lib/evaluaciones/examen-mensual.ts'

const P = (id, clave, extra = {}) => ({
  id, orden: 1, pregunta: `¿${id}?`,
  opcion_a: 'A', opcion_b: 'B', opcion_c: 'C', opcion_d: 'D',
  respuesta_correcta: clave, ...extra,
})

test('la pregunta pública no lleva clave', () => {
  const pub = sanitizarPreguntaEvaluacion(P('p1', 'c'), 0)
  assert.equal('respuesta_correcta' in pub, false)
  assert.deepEqual(pub.opciones, ['A', 'B', 'C', 'D'])
  assert.equal(JSON.stringify(pub).includes('"c"'), false)
})

test('califica con umbral 60 y denominador = todas las preguntas', () => {
  const pregs = [P('1', 'a'), P('2', 'b'), P('3', 'c'), P('4', 'd'), P('5', 'a')]
  // 3 de 5 correctas = 60 → aprueba
  const r = calificarEvaluacion(pregs, { 1: 0, 2: 1, 3: 2, 4: 0 }, { revelar: false })
  assert.equal(r.correctas, 3)
  assert.equal(r.contestadas, 4)
  assert.equal(r.total, 5)
  assert.equal(r.puntaje, 60)
  assert.equal(r.acreditado, true)
  // 2 de 5 = 40 → no
  const r2 = calificarEvaluacion(pregs, { 1: 0, 2: 1 }, { revelar: false })
  assert.equal(r2.puntaje, 40)
  assert.equal(r2.acreditado, false)
})

test('sin revelar no viaja ni el ✓/✗; revelando, ✓/✗ pero NUNCA la opción correcta', () => {
  const pregs = [P('1', 'b'), P('2', 'c')]
  const oculto = calificarEvaluacion(pregs, { 1: 0, 2: 2 }, { revelar: false })
  for (const d of oculto.detalle) {
    assert.equal('es_correcta' in d, false)
    assert.equal('respuesta_correcta' in d, false)
  }
  const cerrado = calificarEvaluacion(pregs, { 1: 0, 2: 2 }, { revelar: true })
  assert.deepEqual(cerrado.detalle.map(d => d.es_correcta), [false, true])
  for (const d of cerrado.detalle) assert.equal('respuesta_correcta' in d, false)
})

test('guarda {pregunta_id: letra} solo de lo contestado', () => {
  const pregs = [P('1', 'b'), P('2', 'c'), P('3', 'a')]
  const r = calificarEvaluacion(pregs, { 1: 3, 3: 0 }, { revelar: false })
  assert.deepEqual(r.respuestasLetra, { 1: 'd', 3: 'a' })
})

test('una opción intermedia vacía no corre las letras', () => {
  const p = P('1', 'd', { opcion_c: '' })
  assert.deepEqual(opcionesDe(p), ['A', 'B', 'D'])
  // índice 2 = tercera opción visible = columna d → correcta
  const r = calificarEvaluacion([p], { 1: 2 }, { revelar: true })
  assert.equal(r.correctas, 1)
  assert.deepEqual(r.respuestasLetra, { 1: 'd' })
})

test('clave ilegible nunca da por buena una respuesta', () => {
  assert.equal(letraClave('  B '), 'b')
  assert.equal(letraClave('x'), null)
  assert.equal(letraClave(null), null)
  const r = calificarEvaluacion([P('1', 'z')], { 1: 0 }, { revelar: true })
  assert.equal(r.correctas, 0)
})

test('indiceValido: solo enteros dentro de rango', () => {
  assert.equal(indiceValido(0, 4), 0)
  assert.equal(indiceValido(3, 4), 3)
  assert.equal(indiceValido(4, 4), -1)
  assert.equal(indiceValido(-1, 4), -1)
  assert.equal(indiceValido(1.5, 4), -1)
  assert.equal(indiceValido('1', 4), -1)
})

test('validarEnvio rechaza vacío, ids ajenos e índices inválidos', () => {
  const pregs = [P('1', 'a'), P('2', 'b', { opcion_d: null })]
  assert.equal(validarEnvio(pregs, {}).ok, false)
  assert.equal(validarEnvio(pregs, null).ok, false)
  assert.equal(validarEnvio(pregs, [0]).ok, false)
  assert.equal(validarEnvio(pregs, { otra: 0 }).ok, false)
  assert.equal(validarEnvio(pregs, { 1: 9 }).ok, false)
  assert.equal(validarEnvio(pregs, { 2: 3 }).ok, false) // la 2 tiene 3 opciones
  assert.equal(validarEnvio(pregs, { 1: '0' }).ok, false)
  const ok = validarEnvio(pregs, { 1: 0, 2: 2 })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.respuestas, { 1: 0, 2: 2 })
})

test('estadoExamen: aprobar cierra; sin intentos cierra', () => {
  assert.equal(estadoExamen([], 3), 'abierta')
  assert.equal(estadoExamen([{ acreditado: false }], 3), 'abierta')
  assert.equal(estadoExamen([{ acreditado: false }, { acreditado: true }], 3), 'aprobada')
  assert.equal(estadoExamen([{ acreditado: false }, { acreditado: false }, { acreditado: false }], 3), 'sin_intentos')
})
