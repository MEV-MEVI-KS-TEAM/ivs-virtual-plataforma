/**
 * Normaliza filas de `documentos_alumno` entre schema IVS (legacy) y el modelo del panel admin.
 */

export type DocEstadoAdmin = 'pendiente' | 'aprobado' | 'rechazado'

export type AdminDocumentoListItem = {
  id: string
  alumno_id: string
  tipo: string
  nombre_archivo: string
  estado: DocEstadoAdmin
  comentario_admin: string | null
  subido_en: string
  url: string | null
}

export function mapDocumentoAlumnoRow(row: Record<string, unknown>): AdminDocumentoListItem {
  const id = String(row.id ?? '')
  const alumno_id = String(row.alumno_id ?? '')
  const tipo = String(row.tipo ?? row.tipo_documento ?? 'curp')
  const nombre_archivo = String(row.nombre_archivo ?? 'archivo.pdf')
  const url =
    row.url != null && String(row.url).trim() !== ''
      ? String(row.url)
      : row.url_archivo != null && String(row.url_archivo).trim() !== ''
        ? String(row.url_archivo)
        : null

  let estado: DocEstadoAdmin = 'pendiente'
  if (typeof row.estado === 'string' && ['pendiente', 'aprobado', 'rechazado'].includes(row.estado)) {
    estado = row.estado as DocEstadoAdmin
  } else if (row.verificado === true) {
    estado = 'aprobado'
  }

  const comentario_admin =
    (row.comentario_admin as string | null | undefined) ??
    (row.notas as string | null | undefined) ??
    null

  const subido_en =
    row.subido_en != null
      ? String(row.subido_en)
      : row.fecha_subida != null
        ? String(row.fecha_subida)
        : new Date().toISOString()

  return { id, alumno_id, tipo, nombre_archivo, estado, comentario_admin, subido_en, url }
}

/** Ruta en bucket `documentos`: {alumnoId}/{tipo}.{ext} */
export function documentoStoragePath(alumnoId: string, tipo: string, nombreArchivo: string): string {
  const raw = nombreArchivo?.trim() || 'file.pdf'
  const ext = raw.includes('.') ? (raw.split('.').pop() ?? 'pdf').toLowerCase() : 'pdf'
  return `${alumnoId}/${tipo}.${ext}`
}

/**
 * Payloads para aprobar / rechazar / regresar a pendiente un documento.
 *
 * Regla: aprobado ⇒ verificado = true; rechazado o pendiente ⇒ verificado = false.
 *
 * ⚠️ IVS (soporte 8-oct-2026): su tabla es HÍBRIDA — tiene las columnas del
 * esquema nuevo (estado/comentario_admin/revisado_en) Y `verificado`. Con solo
 * `nuevo`, el update funcionaba y `verificado` se quedaba en false, así que el
 * contador «documentos pendientes» del dashboard (que cuenta verificado=false)
 * seguía contando los aprobados. Por eso se intenta primero `hibrido`; si la
 * tabla no tiene `verificado` (esquema nuevo puro) cae a `nuevo`, y si no
 * tiene `estado` (esquema canónico de la plantilla) cae a `legacy`.
 * Usar `ordenDocEstadoUpdates()` para recorrerlos en ese orden.
 */
export function buildDocEstadoUpdates(estado: DocEstadoAdmin, comentario: string | null) {
  const ts = new Date().toISOString()
  const nuevo: Record<string, unknown> = {
    estado,
    comentario_admin: comentario,
    revisado_en: ts,
  }
  return {
    hibrido: {
      ...nuevo,
      verificado: estado === 'aprobado',
    } as Record<string, unknown>,
    nuevo,
    legacy: {
      verificado: estado === 'aprobado',
      notas: comentario,
      fecha_verificacion: ts,
    } as Record<string, unknown>,
  }
}

/** Orden de intento: híbrido (IVS) → nuevo → legacy (canónico plantilla). */
export function ordenDocEstadoUpdates(
  u: ReturnType<typeof buildDocEstadoUpdates>,
): Record<string, unknown>[] {
  return [u.hibrido, u.nuevo, u.legacy]
}
