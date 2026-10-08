// Pruebas de la calificación del quiz semanal (servidor). Corre con:
//   pnpm test:unit        (node --test; Node >= 23.6 quita los tipos del .ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claveQuiz,
  indiceDeLetra,
  indiceRespuesta,
  letraDeIndice,
  preguntaPublica,
  primerasRespuestas,
  veredictoQuiz,
} from '../../src/lib/quiz/quiz-semana.ts'

const Q = (id, clave, extra = {}) => ({
  id, semana_id: 's1', pregunta: `¿${id}?`, orden: 1,
  opcion_a: 'A', opcion_b: 'B', opcion_c: 'C', opcion_d: 'D',
  respuesta_correcta: clave, explicacion: `Porque ${clave}.`, ...extra,
})

test('la pregunta pública no lleva clave ni explicación', () => {
  const pub = preguntaPublica(Q('1', 'b'))
  assert.deepEqual(Object.keys(pub).sort(), ['id', 'opciones', 'orden', 'pregunta'])
  assert.deepEqual(pub.opciones, ['A', 'B', 'C', 'D'])
})

test('preguntas de 3 opciones (opcion_d vacía)', () => {
  const q = Q('1', 'c', { opcion_d: '' })
  assert.deepEqual(preguntaPublica(q).opciones, ['A', 'B', 'C'])
  assert.equal(indiceRespuesta(3, 3), null)
  assert.equal(veredictoQuiz(q, 2).es_correcta, true)
})

test('veredicto: ✓/✗ y explicación, sin la opción correcta', () => {
  const q = Q('1', 'b')
  const bien = veredictoQuiz(q, 1)
  assert.deepEqual(bien, { tu_respuesta: 1, es_correcta: true, explicacion: 'Porque b.' })
  const mal = veredictoQuiz(q, 0)
  assert.equal(mal.es_correcta, false)
  assert.equal('respuesta_correcta' in mal, false)
})

test('sin letra por defecto: clave ilegible nunca es correcta', () => {
  assert.equal(claveQuiz(Q('1', 'x')), null)
  assert.equal(claveQuiz(Q('1', null)), null)
  assert.equal(claveQuiz(Q('1', 2)), 'c')
  assert.equal(claveQuiz(Q('1', ' D ')), 'd')
  assert.equal(veredictoQuiz(Q('1', 'x'), 0).es_correcta, false)
})

test('indiceRespuesta rechaza en vez de recortar', () => {
  assert.equal(indiceRespuesta(0, 4), 0)
  assert.equal(indiceRespuesta(4, 4), null)
  assert.equal(indiceRespuesta(-1, 4), null)
  assert.equal(indiceRespuesta('1', 4), null)
  assert.equal(indiceRespuesta(1.2, 4), null)
})

test('letra guardada ↔ índice, por fila', () => {
  const q = Q('1', 'a')
  assert.equal(letraDeIndice(q, 3), 'd')
  assert.equal(indiceDeLetra(q, 'D'), 3)
  assert.equal(indiceDeLetra(q, 'z'), null)
  assert.equal(letraDeIndice(q, 9), null)
})

test('candado: la PRIMERA respuesta guardada es la que cuenta', () => {
  const filas = [Q('1', 'a'), Q('2', 'b')]
  const guardadas = [
    { quiz_id: '1', respuesta: 'c' },
    { quiz_id: '1', respuesta: 'a' },
    { quiz_id: '2', respuesta: 'b' },
    { quiz_id: 'ajena', respuesta: 'a' },
  ]
  assert.deepEqual(primerasRespuestas(filas, guardadas), { 1: 2, 2: 1 })
})
