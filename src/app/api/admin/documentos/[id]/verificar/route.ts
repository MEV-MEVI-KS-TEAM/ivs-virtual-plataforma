import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import { buildDocEstadoUpdates, ordenDocEstadoUpdates, type DocEstadoAdmin } from '@/lib/admin/documentos-admin'

/**
 * PUT /api/admin/documentos/[id]/verificar
 * Actualiza el estado de un documento (aprobado | rechazado | pendiente).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const body = await request.json()
    const { estado, comentario } = body

    const estadosValidos: DocEstadoAdmin[] = ['pendiente', 'aprobado', 'rechazado']
    if (!estado || !estadosValidos.includes(estado)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    }

    const admin = createAdminClient()
    // aprobado ⇒ verificado=true (ver buildDocEstadoUpdates): híbrido → nuevo → legacy
    // Solo se pasa al siguiente payload si la columna no existe en este esquema (42703 / PGRST204);
    // cualquier otro error se devuelve tal cual, sin taparlo con el del payload legacy.
    let error: { message: string; code?: string } | null = null
    for (const payload of ordenDocEstadoUpdates(buildDocEstadoUpdates(estado, comentario ?? null))) {
      const r = await admin
        .from('documentos_alumno')
        .update(payload)
        .eq('id', params.id)
      error = r.error
      if (!error) break
      if (error.code !== '42703' && error.code !== 'PGRST204') break
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PUT /api/admin/documentos/[id]/verificar]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
