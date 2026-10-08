import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import { mapDocumentoAlumnoRow, documentoStoragePath } from '@/lib/admin/documentos-admin'

export async function GET() {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    // ── Query con service role (bypass RLS) ──────────────────────────────────
    // Bug 32: SELECT '*' (no selectivo) para que mapDocumentoAlumnoRow pueda
    // leer ambos schemas dual (legacy: tipo_documento/verificado/url_archivo/
    // fecha_subida/notas, nuevo: tipo/estado/url/subido_en/comentario_admin).
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('documentos_alumno')
      .select('*')
      .order('fecha_subida', { ascending: false })

    if (error) {
      // Fallback: clientes con schema nuevo no tienen fecha_subida — reintentar con subido_en
      const { data: retry, error: e2 } = await admin
        .from('documentos_alumno')
        .select('*')
        .order('subido_en', { ascending: false })
      if (e2) {
        console.error('[GET /api/admin/documentos] Error:', error.message, '| code:', error.code)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return await buildResponse(admin, (retry ?? []) as Record<string, unknown>[])
    }

    return await buildResponse(admin, (data ?? []) as Record<string, unknown>[])
  } catch (err) {
    console.error('[GET /api/admin/documentos] excepción:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

async function buildResponse(
  admin: ReturnType<typeof createAdminClient>,
  rows: Record<string, unknown>[],
) {
  // Bug 32: aplicar mapDocumentoAlumnoRow para normalizar schema
  // (estado/tipo/url/subido_en/comentario_admin en vez de columnas raw).
  // Sin esto, doc.estado = undefined → ESTADO_CONFIG[undefined] crash → white screen.
  const mapped = rows.map(mapDocumentoAlumnoRow)

  // Enriquecer con nombre del alumno
  const alumnoIds = [...new Set(mapped.map((d) => d.alumno_id))]
  const { data: usuarios } = alumnoIds.length > 0
    ? await admin.from('usuarios').select('id, nombre, apellidos').in('id', alumnoIds)
    : { data: [] }

  const usuarioMap = new Map<string, string>(
    (usuarios ?? []).map((u: { id: string; nombre?: string; apellidos?: string }) => [
      u.id,
      [u.nombre, u.apellidos].filter(Boolean).join(' ') || '—',
    ])
  )

  // Generar signed URLs (bucket 'documentos' es privado).
  // Mismo patrón que api/admin/documentos/[id]/route.ts: storage path canónico
  // {alumnoId}/{tipo}.{ext} con fallback de extensiones si nombre_archivo no matchea.
  const result = await Promise.all(
    mapped.map(async (doc) => {
      const tryPath = async (p: string): Promise<string | null> => {
        const { data: s } = await admin.storage.from('documentos').createSignedUrl(p, 3600)
        return s?.signedUrl ?? null
      }
      let signed = await tryPath(documentoStoragePath(doc.alumno_id, doc.tipo, doc.nombre_archivo))
      if (!signed) {
        for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'pdf']) {
          signed = await tryPath(`${doc.alumno_id}/${doc.tipo}.${ext}`)
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
        alumno_nombre:    usuarioMap.get(doc.alumno_id) ?? '—',
      }
    })
  )

  return NextResponse.json(result)
}
