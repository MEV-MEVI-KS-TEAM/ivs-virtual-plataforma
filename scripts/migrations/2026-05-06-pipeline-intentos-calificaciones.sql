-- Pipeline automático: cuando un intento_evaluacion se inserta con
-- acreditado=true, escribir/actualizar la fila correspondiente en
-- calificaciones. Idempotente vía ON CONFLICT.

CREATE OR REPLACE FUNCTION public.fn_intento_a_calificacion()
RETURNS TRIGGER AS $$
DECLARE
  v_materia_id UUID;
BEGIN
  -- Solo procesar si el intento es acreditado
  IF NEW.acreditado IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Obtener materia_id desde la evaluación
  SELECT materia_id INTO v_materia_id
  FROM public.evaluaciones
  WHERE id = NEW.evaluacion_id;

  IF v_materia_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insertar o actualizar calificación
  INSERT INTO public.calificaciones (
    alumno_id, materia_id, evaluacion_id, acreditado,
    fecha_acreditacion, folio
  )
  VALUES (
    NEW.alumno_id, v_materia_id, NEW.evaluacion_id, true,
    NEW.fecha_intento,
    'IVS-' || EXTRACT(YEAR FROM NEW.fecha_intento) || '-' ||
      SUBSTRING(MD5(NEW.alumno_id::text || v_materia_id::text), 1, 8)
  )
  ON CONFLICT (alumno_id, materia_id) DO UPDATE
  SET acreditado = true,
      fecha_acreditacion = NEW.fecha_intento,
      evaluacion_id = NEW.evaluacion_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger viejo si existe
DROP TRIGGER IF EXISTS trg_intento_a_calificacion ON public.intentos_evaluacion;

-- Crear trigger
CREATE TRIGGER trg_intento_a_calificacion
AFTER INSERT OR UPDATE OF acreditado ON public.intentos_evaluacion
FOR EACH ROW
EXECUTE FUNCTION public.fn_intento_a_calificacion();

-- Verificación
SELECT 'Trigger creado' AS status,
       tgname AS trigger_name,
       tgenabled AS habilitado
FROM pg_trigger
WHERE tgname = 'trg_intento_a_calificacion';
