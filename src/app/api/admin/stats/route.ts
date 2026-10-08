import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'

/**
 * GET /api/admin/stats
 * Retorna estadísticas generales del dashboard admin.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const admin = createAdminClient()

    const [
      { count: totalAlumnos },
      { count: alumnosActivos },
      { count: pendientesPago },
      { count: docsPendientes },
    ] = await Promise.all([
      admin.from('alumnos').select('*', { count: 'exact', head: true }),
      admin
        .from('alumnos')
        .select('*', { count: 'exact', head: true })
        .eq('inscripcion_pagada', true),
      admin
        .from('alumnos')
        .select('*', { count: 'exact', head: true })
        .eq('inscripcion_pagada', false),
      admin
        .from('documentos_alumno')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente'), // por estado, igual que el dashboard (ver admin/page.tsx)
    ])

    return NextResponse.json({
      total_alumnos: totalAlumnos ?? 0,
      alumnos_activos: alumnosActivos ?? 0,
      pendientes_pago: pendientesPago ?? 0,
      documentos_pendientes: docsPendientes ?? 0,
    })
  } catch (err) {
    console.error('[GET /api/admin/stats]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
