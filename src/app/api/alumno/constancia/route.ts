import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // ── Usuario ───────────────────────────────────────────────────────────────
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('nombre, apellidos, email')
      .eq('id', user.id)
      .single()

    // ── Alumno (schema nuevo: alumnos.id = user.id) ───────────────────────────
    const { data: alumno } = await supabase
      .from('alumnos')
      .select('matricula, nivel, modalidad, meses_desbloqueados, inscripcion_pagada, created_at')
      .eq('id', user.id)
      .single()

    if (!alumno) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const nombre_completo = [usuario?.nombre, usuario?.apellidos]
      .filter(Boolean)
      .join(' ') || 'Alumno'

    const duracionMeses = alumno.modalidad === '3_meses' ? 3 : 6
    const alumnoNivel        = alumno.nivel ?? null
    const inscripcionPagada  = alumno.inscripcion_pagada ?? false
    const mesesDesbloqueados = alumno.meses_desbloqueados ?? 0

    // ── Calificaciones ────────────────────────────────────────────────────────
    const { data: califs } = await supabase
      .from('calificaciones')
      .select('materia_id, acreditado, fecha_acreditacion, folio')
      .eq('alumno_id', user.id)
      .eq('acreditado', true)

    const califMap = new Map<string, { acreditado: boolean; fecha_acreditacion: string | null; folio: string | null }>()
    for (const c of (califs ?? [])) {
      const row = c as { materia_id: string; acreditado: boolean; fecha_acreditacion: string | null; folio: string | null }
      califMap.set(row.materia_id, row)
    }

    // ── Materias del plan via meses_contenido ─────────────────────────────────
    // meses_contenido.materia_id → materias.id (many-to-one → materias es objeto único)
    // Port Bug 46 (f7d3edc): sin .lte — las acreditadas de meses posteriores
    // al desbloqueo deben aparecer; el gating de Pendientes se hace en el loop
    const { data: meses } = await supabase
      .from('meses_contenido')
      .select('numero_mes, materias(id, nombre, nivel)')
      .order('numero_mes')

    type MesRow = {
      numero_mes: number
      materias: { id: string; nombre: string; nivel: string | null } | null
    }

    const materias_cursadas: {
      materia_id: string; codigo: string; nombre_materia: string; mes_numero: number
      nivel: string | null
      estado: 'Acreditada' | 'Pendiente'
      fecha_acreditacion: string | null
      folio: string | null
    }[] = []

    for (const mes of ((meses ?? []) as unknown as MesRow[])) {
      const mat = mes.materias
      if (!mat) continue

      // Port Bug 46 (f7d3edc): pagado → solo materias del nivel del alumno
      // (excluye demo y otros niveles); sin pagar → solo demo
      if (inscripcionPagada) {
        if (alumnoNivel && mat.nivel !== alumnoNivel) continue
      } else {
        if (mat.nivel !== 'demo') continue
      }

      const calif = califMap.get(mat.id)
      // Acreditada siempre visible; Pendiente solo dentro de meses desbloqueados
      if (!calif?.acreditado && mes.numero_mes > mesesDesbloqueados) continue

      materias_cursadas.push({
        materia_id:         mat.id,
        codigo:             '',
        nombre_materia:     mat.nombre,
        mes_numero:         mes.numero_mes,
        nivel:              mat.nivel ?? null,
        estado:             calif?.acreditado ? 'Acreditada' : 'Pendiente',
        fecha_acreditacion: calif?.fecha_acreditacion ?? null,
        folio:              calif?.folio ?? null,
      })
    }

    const porcentaje_avance = duracionMeses > 0
      ? Math.round((mesesDesbloqueados / duracionMeses) * 100)
      : 0

    const admin = createAdminClient()

    const { data: fotoDoc } = await admin
      .from('documentos_alumno')
      .select('url, nombre_archivo')
      .eq('alumno_id', user.id)
      .eq('tipo', 'foto_perfil_doc')
      .order('subido_en', { ascending: false })
      .limit(1)
      .maybeSingle()

    let avatarUrl: string | null = null

    if (fotoDoc?.url) {
      const urlParts = fotoDoc.url.split('/storage/v1/object/public/documentos/')
      const filePath = urlParts[1]
      if (filePath) {
        const { data: signedData } = await admin.storage
          .from('documentos')
          .createSignedUrl(filePath, 60 * 60 * 24)
        avatarUrl = signedData?.signedUrl ?? null
      }
    }

    return NextResponse.json({
      nombre_completo,
      nombre:              usuario?.nombre    ?? '',
      apellidos:           usuario?.apellidos ?? '',
      foto_url:            avatarUrl,
      matricula:           alumno.matricula   ?? 'IVS-0000',
      nivel:               alumno.nivel       ?? null,
      modalidad:           alumno.modalidad   ?? '6_meses',
      meses_desbloqueados: mesesDesbloqueados,
      duracion_meses:      duracionMeses,
      plan_nombre:         duracionMeses === 3 ? '3 Meses' : '6 Meses',
      porcentaje_avance,
      fecha_inscripcion:   alumno.created_at,
      avatar_url:          avatarUrl,
      materias_cursadas,
    })
  } catch (err) {
    console.error('[api/alumno/constancia]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
