import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cargarContextoAcceso, tieneAccesoMateria } from '@/lib/acceso-materias'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verificar sesión con el cliente de usuario
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

    // Usar admin client para todas las queries de BD (bypassa RLS)
    const admin = createAdminClient()

    // ── 1. Alumno: nivel + plan + meses desbloqueados ─────────────────────────
    const { data: alumnoData } = await admin
      .from('alumnos')
      .select('nivel, meses_desbloqueados, modalidad, duracion_meses, inscripcion_pagada')
      .eq('id', user.id)
      .single()

    if (!alumnoData) return Response.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const alumno = alumnoData as {
      nivel: string; meses_desbloqueados: number
      modalidad: string | null; duracion_meses: number | null
      inscripcion_pagada: boolean | null
    }

    // ── 2. Materia ────────────────────────────────────────────────────────────
    const { data: materiaData } = await admin
      .from('materias')
      .select('id, nombre, descripcion, nivel, icono, color, activa')
      .eq('id', params.id)
      .single()

    if (!materiaData) return Response.json({ error: 'Materia no encontrada' }, { status: 404 })

    const materia = materiaData as {
      id: string; nombre: string; descripcion: string | null
      nivel: string; icono: string | null; color: string | null; activa: boolean
    }

    // ── 3. Control de acceso (canon Bug 54: mismo criterio que el gate de
    // evaluación — acreditada bypass, demo solo sin pago, nivel, ventana) ─────
    const { materias: materiasNivel, acreditadas } = await cargarContextoAcceso(
      admin, user.id, alumno.nivel ?? materia.nivel
    )
    const acceso = tieneAccesoMateria(alumno, materia, materiasNivel, acreditadas)
    if (!acceso.acceso) {
      const mensaje =
        acceso.motivo === 'nivel_distinto'
          ? 'Esta materia no corresponde a tu nivel'
          : alumno.meses_desbloqueados === 0
            ? 'Aún no tienes meses desbloqueados. Contacta a tu administrador.'
            : 'No tienes acceso a esta materia'
      return Response.json({ error: mensaje }, { status: 403 })
    }

    // ── 4. Meses del contenido → Semanas ──────────────────────────────────────
    const { data: mesesData } = await admin
      .from('meses_contenido')
      .select(`
        id, numero_mes, titulo, descripcion,
        semanas ( id, numero_semana, titulo, descripcion, contenido, video_url, video_url_2, video_url_3, tiempo_estimado_minutos )
      `)
      .eq('materia_id', params.id)
      .order('numero_mes')

    type SemanaRow = {
      id: string; numero_semana: number; titulo: string
      descripcion: string | null; contenido: string | null
      video_url: string | null; video_url_2: string | null; video_url_3: string | null
      tiempo_estimado_minutos: number
    }
    type MesRow = {
      id: string; numero_mes: number; titulo: string; descripcion: string | null
      semanas: SemanaRow[]
    }

    const meses = ((mesesData ?? []) as unknown as MesRow[]).map(mes => ({
      ...mes,
      semanas: (mes.semanas ?? []).sort((a, b) => a.numero_semana - b.numero_semana),
    }))

    // Aplanar: todas las semanas de todos los meses en orden
    const semanas = meses.flatMap(mes =>
      mes.semanas.map(s => ({
        id:          s.id,
        // Compatibilidad con la página (usa .numero y .titulo)
        numero:      s.numero_semana,
        titulo:      s.titulo,
        titulo_en:   s.titulo,
        contenido:   s.contenido ?? s.descripcion ?? '',
        contenido_en: s.contenido ?? s.descripcion ?? '',
        url_en:      '',
        videos:      [s.video_url, s.video_url_2, s.video_url_3]
          .filter(Boolean)
          .map(url => ({
            titulo:    s.titulo,
            titulo_en: s.titulo,
            url:       url as string,
            url_en:    url as string,
            duracion:  s.tiempo_estimado_minutos
              ? `${s.tiempo_estimado_minutos} min`
              : '',
          })),
      }))
    )

    // ── 5. Evaluaciones + intentos del alumno ─────────────────────────────────
    const { data: evalData } = await admin
      .from('evaluaciones')
      .select('id, titulo, descripcion, tiempo_limite_minutos, intentos_permitidos, activa')
      .eq('materia_id', params.id)
      .eq('activa', true)

    type EvalRow = {
      id: string; titulo: string; descripcion: string | null
      tiempo_limite_minutos: number; intentos_permitidos: number; activa: boolean
    }

    const evaluaciones = await Promise.all(
      ((evalData ?? []) as unknown as EvalRow[]).map(async ev => {
        const { count: intentosUsados } = await admin
          .from('intentos_evaluacion')
          .select('id', { count: 'exact', head: true })
          .eq('alumno_id', user.id)
          .eq('evaluacion_id', ev.id)

        const { data: aprobado } = await admin
          .from('intentos_evaluacion')
          .select('puntaje')
          .eq('alumno_id', user.id)
          .eq('evaluacion_id', ev.id)
          .eq('acreditado', true)
          .limit(1)
          .single()

        return {
          id:                       ev.id,
          titulo:                   ev.titulo,
          titulo_en:                ev.titulo,
          tipo:                     'final',
          intentos_max:             ev.intentos_permitidos,
          intentos_usados:          intentosUsados ?? 0,
          aprobada:                 !!aprobado,
          calificacion_aprobatoria: aprobado?.puntaje ?? null,
          activa:                   ev.activa,
        }
      })
    )

    // ── 6. Respuesta con forma compatible con la página ───────────────────────
    return Response.json({
      id:              materia.id,
      nivel:           materia.nivel,
      codigo:          '',
      nombre:          materia.nombre,
      nombre_en:       materia.nombre,
      color_hex:       materia.color ?? '#3AAFA9',
      descripcion:     materia.descripcion ?? '',
      descripcion_en:  materia.descripcion ?? '',
      objetivo:        materia.descripcion ?? '',
      objetivo_en:     materia.descripcion ?? '',
      temario:         [],
      temario_en:      [],
      bibliografia:    [],
      bibliografia_en: [],
      semanas,
      evaluaciones,
    })
  } catch (err) {
    console.error('[api/alumno/materia/[id]]', err)
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
