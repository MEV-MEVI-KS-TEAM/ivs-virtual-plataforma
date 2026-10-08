import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import {
  buildDocEstadoUpdates,
  ordenDocEstadoUpdates,
  documentoStoragePath,
  mapDocumentoAlumnoRow,
  type DocEstadoAdmin,
} from '@/lib/admin/documentos-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const admin = createAdminClient()

    const { data: documentos, error } = await admin
      .from('documentos_alumno')
      .select('*')
      .eq('alumno_id', params.id)
      .order('fecha_subida', { ascending: false })

    let list: Record<string, unknown>[] = []
    if (error) {
      const { data: retry, error: e2 } = await admin
        .from('documentos_alumno')
        .select('*')
        .eq('alumno_id', params.id)
        .order('subido_en', { ascending: false })
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
      list = (retry ?? []) as Record<string, unknown>[]
    } else {
      list = (documentos ?? []) as Record<string, unknown>[]
    }

    const mapped = list.map(mapDocumentoAlumnoRow)

    const docs = await Promise.all(
      mapped.map(async doc => {
        const path = documentoStoragePath(params.id, doc.tipo, doc.nombre_archivo)
        let signed: string | null = null
        const tryPath = async (p: string) => {
          const { data } = await admin.storage.from('documentos').createSignedUrl(p, 3600)
          return data?.signedUrl ?? null
        }
        signed = await tryPath(path)
        if (!signed) {
          for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'pdf']) {
            signed = await tryPath(`${params.id}/${doc.tipo}.${ext}`)
            if (signed) break
          }
        }
        return {
          id:               doc.id,
          alumno_id:        doc.alumno_id,
          tipo:             doc.tipo,
          nombre_archivo:   doc.nombre_archivo,
          estado:           doc.estado,
          comentario_admin: doc.comentario_admin,
          subido_en:        doc.subido_en,
          signed_url:       signed ?? doc.url,
        }
      })
    )

    return NextResponse.json(docs)
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const { documentoId, estado, comentario } = await req.json()
    if (!documentoId || !estado) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const estadosValidos: DocEstadoAdmin[] = ['pendiente', 'aprobado', 'rechazado']
    if (!estadosValidos.includes(estado)) {
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
        .eq('id', documentoId)
        .eq('alumno_id', params.id)
      error = r.error
      if (!error) break
      if (error.code !== '42703' && error.code !== 'PGRST204') break
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
