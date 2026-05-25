import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Verificar rol ADMIN (normaliza mayúsculas) ───────────────────────────────
async function checkAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userId)
    .single()
  return (data?.rol as string | undefined)?.toUpperCase() === 'ADMIN'
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const isAdmin = await checkAdmin(user.id)
    if (!isAdmin) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

    const admin = createAdminClient()

    // ── Intento 1: nuevo schema — alumnos.id = usuarios.id ───────────────────
    const { data, error } = await admin
      .from('alumnos')
      .select(`
        id,
        matricula,
        nivel,
        modalidad,
        sindicalizado,
        activo,
        meses_desbloqueados,
        inscripcion_pagada,
        created_at,
        usuarios!inner(
          nombre,
          apellidos,
          email,
          telefono,
          foto_url
        )
      `)
      .order('created_at', { ascending: false })

    console.log('[GET /api/admin/alumnos] error schema nuevo:', error?.message ?? null)
    console.log('[GET /api/admin/alumnos] data count:', data?.length ?? 0)

    if (!error && data && data.length > 0) {
      type Row = {
        id: string; matricula?: string; nivel?: string; modalidad?: string
        sindicalizado?: boolean; activo?: boolean; meses_desbloqueados?: number
        inscripcion_pagada?: boolean; created_at: string
        usuarios: { nombre?: string; apellidos?: string; email?: string; telefono?: string | null; foto_url?: string | null } | null
      }
      const result = (data as unknown as Row[]).map(a => {
        const u = Array.isArray(a.usuarios) ? a.usuarios[0] : a.usuarios
        return {
          id:                   a.id,
          matricula:            a.matricula ?? 'IVS-0000',
          nivel:                a.nivel ?? null,
          modalidad:            a.modalidad ?? '6_meses',
          sindicalizado:        a.sindicalizado ?? false,
          activo:               a.activo ?? false,
          meses_desbloqueados:  a.meses_desbloqueados ?? 0,
          duracion_meses:       a.modalidad === '3_meses' ? 3 : 6,
          inscripcion_pagada:   a.inscripcion_pagada ?? false,
          created_at:           a.created_at,
          nombre_completo:      [u?.nombre, u?.apellidos].filter(Boolean).join(' ') || '—',
          email:                u?.email ?? '—',
          telefono:             u?.telefono ?? null,
          foto_url:             u?.foto_url ?? null,
        }
      })
      return NextResponse.json(result)
    }

    // ── Intento 2: schema antiguo — alumnos.usuario_id → usuarios.id ─────────
    const { data: data2, error: error2 } = await admin
      .from('alumnos')
      .select(`
        id,
        matricula,
        nivel,
        modalidad,
        sindicalizado,
        activo,
        meses_desbloqueados,
        inscripcion_pagada,
        created_at,
        usuario_id,
        usuarios!alumnos_usuario_id_fkey(
          nombre,
          apellidos,
          email,
          telefono,
          foto_url
        )
      `)
      .order('created_at', { ascending: false })

    console.log('[GET /api/admin/alumnos] error schema antiguo:', error2?.message ?? null)
    console.log('[GET /api/admin/alumnos] data2 count:', data2?.length ?? 0)

    if (!error2 && data2 && data2.length > 0) {
      type Row2 = {
        id: string; matricula?: string; nivel?: string; modalidad?: string
        sindicalizado?: boolean; activo?: boolean; meses_desbloqueados?: number
        inscripcion_pagada?: boolean; created_at: string; usuario_id?: string
        usuarios: { nombre?: string; apellidos?: string; email?: string; telefono?: string | null; foto_url?: string | null } | null
      }
      const result2 = (data2 as unknown as Row2[]).map(a => {
        const u = Array.isArray(a.usuarios) ? a.usuarios[0] : a.usuarios
        return {
          id:                   a.id,
          matricula:            a.matricula ?? 'IVS-0000',
          nivel:                a.nivel ?? null,
          modalidad:            a.modalidad ?? '6_meses',
          sindicalizado:        a.sindicalizado ?? false,
          activo:               a.activo ?? false,
          meses_desbloqueados:  a.meses_desbloqueados ?? 0,
          duracion_meses:       a.modalidad === '3_meses' ? 3 : 6,
          inscripcion_pagada:   a.inscripcion_pagada ?? false,
          created_at:           a.created_at,
          nombre_completo:      [u?.nombre, u?.apellidos].filter(Boolean).join(' ') || '—',
          email:                u?.email ?? '—',
          telefono:             u?.telefono ?? null,
          foto_url:             u?.foto_url ?? null,
        }
      })
      return NextResponse.json(result2)
    }

    // ── Fallback: alumnos sin join + usuarios por separado ────────────────────
    console.log('[GET /api/admin/alumnos] usando fallback sin join')
    const { data: alumnos, error: errorFallback } = await admin
      .from('alumnos')
      .select('*')
      .order('created_at', { ascending: false })

    console.log('[GET /api/admin/alumnos] fallback error:', errorFallback?.message ?? null)
    console.log('[GET /api/admin/alumnos] fallback alumnos count:', alumnos?.length ?? 0)
    if (alumnos?.[0]) console.log('[GET /api/admin/alumnos] sample row keys:', Object.keys(alumnos[0]))

    const resultFallback = []
    for (const a of (alumnos ?? []) as {
      id: string; matricula?: string; nivel?: string; modalidad?: string
      sindicalizado?: boolean; activo?: boolean; meses_desbloqueados?: number
      inscripcion_pagada?: boolean; created_at: string
    }[]) {
      const { data: u } = await admin
        .from('usuarios')
        .select('nombre, apellidos, email, telefono, foto_url')
        .eq('id', a.id)
        .single()
      resultFallback.push({
        id:                   a.id,
        matricula:            a.matricula ?? 'IVS-0000',
        nivel:                a.nivel ?? null,
        modalidad:            a.modalidad ?? '6_meses',
        sindicalizado:        a.sindicalizado ?? false,
        activo:               a.activo ?? false,
        meses_desbloqueados:  a.meses_desbloqueados ?? 0,
        duracion_meses:       a.modalidad === '3_meses' ? 3 : 6,
        inscripcion_pagada:   a.inscripcion_pagada ?? false,
        created_at:           a.created_at,
        nombre_completo:      [(u as {nombre?:string}|null)?.nombre, (u as {apellidos?:string}|null)?.apellidos].filter(Boolean).join(' ') || '—',
        email:                (u as {email?:string}|null)?.email ?? '—',
        telefono:             (u as {telefono?:string|null}|null)?.telefono ?? null,
        foto_url:             (u as {foto_url?:string|null}|null)?.foto_url ?? null,
      })
    }
    return NextResponse.json(resultFallback)

  } catch (err) {
    console.error('[GET /api/admin/alumnos] excepción:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const isAdmin = await checkAdmin(user.id)
    if (!isAdmin) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

    const body = await request.json()
    const { nombre_completo, email, telefono, password, nivel, modalidad } = body

    // Aceptar "nombre_completo" del form y dividirlo en nombre / apellidos
    const partes     = (nombre_completo as string | undefined)?.trim().split(/\s+/) ?? []
    const nombre     = partes[0] ?? ''
    const apellidos  = partes.slice(1).join(' ')
    const telefonoLimpio = ((telefono as string | undefined) ?? '').replace(/\D/g, '') || null

    if (!nombre || !email || !password) {
      return NextResponse.json({ error: 'nombre, email y password son requeridos' }, { status: 400 })
    }
    if (!nivel || !['secundaria', 'preparatoria'].includes(nivel)) {
      return NextResponse.json({ error: 'nivel es requerido (secundaria o preparatoria)' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      if (authError.message.includes('already')) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })
      }
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const newUserId = authData.user.id
    const year      = new Date().getFullYear()
    const rand      = String(Math.floor(1 + Math.random() * 9999)).padStart(4, '0')
    const matricula = `IVS-${year}-${rand}`

    // Insertar en usuarios
    await admin.from('usuarios').insert({ id: newUserId, nombre, apellidos, email, telefono: telefonoLimpio, rol: 'ALUMNO' })

    // Insertar en alumnos (nivel + modalidad obligatorios)
    const { data: alumnoData, error: alumnoError } = await admin
      .from('alumnos')
      .insert({
        id:                  newUserId,
        matricula,
        nivel:               nivel as 'secundaria' | 'preparatoria',
        modalidad:           modalidad ?? '6_meses',
        meses_desbloqueados: 0,
      })
      .select()
      .single()

    if (alumnoError) {
      await admin.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ error: alumnoError.message }, { status: 500 })
    }

    return NextResponse.json(alumnoData, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/alumnos]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
