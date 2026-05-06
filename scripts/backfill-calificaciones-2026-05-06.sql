-- Backfill: poblar tabla calificaciones desde intentos_evaluacion
-- Ejecutado: 2026-05-06
-- Contexto: calificaciones estaba vacía aunque alumnos habían aprobado evaluaciones.
--           La tabla calificaciones es la fuente de verdad para la constancia.

-- PASO 1: Agregar constraint UNIQUE si no existe (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calificaciones_alumno_materia_unique'
  ) THEN
    ALTER TABLE public.calificaciones
      ADD CONSTRAINT calificaciones_alumno_materia_unique
      UNIQUE (alumno_id, materia_id);
  END IF;
END $$;

-- PASO 2: Insertar calificaciones desde intentos aprobados (idempotente via ON CONFLICT)
INSERT INTO public.calificaciones (
  alumno_id, materia_id, evaluacion_id, acreditado,
  fecha_acreditacion, folio
)
SELECT DISTINCT ON (ie.alumno_id, e.materia_id)
  ie.alumno_id,
  e.materia_id,
  ie.evaluacion_id,
  true,
  ie.fecha_intento,
  'IVS-' || EXTRACT(YEAR FROM ie.fecha_intento) || '-' ||
    SUBSTRING(MD5(ie.alumno_id::text || e.materia_id::text), 1, 8)
FROM public.intentos_evaluacion ie
JOIN public.evaluaciones e ON e.id = ie.evaluacion_id
WHERE ie.acreditado = true
ORDER BY ie.alumno_id, e.materia_id, ie.fecha_intento DESC
ON CONFLICT (alumno_id, materia_id) DO NOTHING;

-- VERIFICACIÓN post-backfill:
-- SELECT COUNT(*) FROM public.calificaciones;
-- Resultado esperado: 24 filas (5 alumnos, 24 materias aprobadas totales)
