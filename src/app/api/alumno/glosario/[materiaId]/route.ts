import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cargarContextoAcceso, tieneAccesoMateria } from '@/lib/acceso-materias'

export async function GET(
  _request: NextRequest,
  { params }: { params: { materiaId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { materiaId } = params

    // ── Gate canon (lib/acceso-materias): solo materias accesibles ────────────
    const { data: materiaData } = await supabase
      .from('materias')
      .select('id, nombre, nivel')
      .eq('id', materiaId)
      .maybeSingle()

    if (!materiaData) {
      return NextResponse.json({ error: 'Materia no encontrada' }, { status: 404 })
    }
    const materia = materiaData as { id: string; nombre: string; nivel: string | null }

    const { data: alumnoData } = await supabase
      .from('alumnos')
      .select('nivel, meses_desbloqueados, modalidad, duracion_meses, inscripcion_pagada')
      .eq('id', user.id)
      .single()

    if (!alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const alumno = alumnoData as {
      nivel: string | null; meses_desbloqueados: number
      modalidad: string | null; duracion_meses: number | null
      inscripcion_pagada: boolean | null
    }

    const { materias, acreditadas } = await cargarContextoAcceso(
      supabase, user.id, alumno.nivel ?? materia.nivel
    )
    const acceso = tieneAccesoMateria(alumno, materia, materias, acreditadas)
    if (!acceso.acceso) {
      return NextResponse.json({ error: 'No tienes acceso a este contenido' }, { status: 403 })
    }

    const { data: terminos } = await supabase
      .from('glosario_materia')
      .select('id, termino, definicion')
      .eq('materia_id', materiaId)
      .order('termino')

    return NextResponse.json({ terminos: terminos ?? [] })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
