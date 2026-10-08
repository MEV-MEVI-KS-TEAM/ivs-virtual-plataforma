import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapDocumentoAlumnoRow } from '@/lib/admin/documentos-admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const admin = createAdminClient()

    // Schema nuevo: alumnos.id = user.id (no usuario_id)
    const { data: alumno } = await admin
      .from('alumnos')
      .select('id, nivel')
      .eq('id', user.id)
      .single()

    if (!alumno) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const a = alumno as { id: string; nivel?: string | null }

    const { data: rows, error } = await admin
      .from('documentos_alumno')
      .select('*')
      .eq('alumno_id', a.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const documentos = (rows ?? []).map(row => mapDocumentoAlumnoRow(row as Record<string, unknown>))
    // B7 — `plan_nombre` NO se pinta en esta pantalla: su único uso es decidir
    // qué documentos son obligatorios. Sin la rama de 'diplomado', un alumno de
    // diplomado caía al `else` y la app le exigía CERTIFICADO DE SECUNDARIA,
    // que es justo lo que un instituto de diplomados no acredita.
    // Aditivo: en tradicional ningún camino crea nivel='diplomado'.
    // Licenciatura: cae en la MISMA lista que prepa (los tipos de documento son
    // los mismos slots). OJO IVS: hoy solo hay alumnos 'preparatoria' y
    // 'secundaria', y /alumno/documentos solo distingue «contiene ecundaria»:
    // Diplomado/Licenciatura ven la lista de prepa (no hay etiqueta propia).
    const plan_nombre = a.nivel === 'secundaria'   ? 'Secundaria'
                      : a.nivel === 'diplomado'    ? 'Diplomado'
                      : a.nivel === 'licenciatura' ? 'Licenciatura'
                      : 'Preparatoria'

    return NextResponse.json({
      documentos,
      plan_nombre,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const formData = await req.formData()
    const archivo = formData.get('archivo') as File | null
    const tipo = formData.get('tipo') as string | null

    if (!archivo) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    if (!tipo) return NextResponse.json({ error: 'Falta el tipo de documento' }, { status: 400 })

    const tiposValidos = [
      'acta_nacimiento', 'curp', 'certificado_primaria',
      'certificado_secundaria', 'identificacion_oficial', 'foto_perfil_doc',
    ]
    if (!tiposValidos.includes(tipo)) {
      return NextResponse.json({ error: 'Tipo de documento inválido' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Schema nuevo: alumnos.id = user.id
    const { data: alumnoPost } = await admin
      .from('alumnos')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!alumnoPost) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const alumno = alumnoPost as { id: string }

    const ext = archivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const storagePath = `${alumno.id}/${tipo}.${ext}`
    const arrayBuffer = await archivo.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { error: uploadError } = await admin.storage
      .from('documentos')
      .upload(storagePath, buffer, { contentType: archivo.type, upsert: true })

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: { publicUrl } } = admin.storage.from('documentos').getPublicUrl(storagePath)

    const { error: upsertError } = await admin
      .from('documentos_alumno')
      .upsert({
        alumno_id: alumno.id,
        tipo,
        nombre_archivo: archivo.name,
        url: publicUrl,
        estado: 'pendiente',
        comentario_admin: null,
        subido_en: new Date().toISOString(),
        revisado_en: null,
      }, { onConflict: 'alumno_id,tipo' })

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

    return NextResponse.json({ ok: true, path: storagePath })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
