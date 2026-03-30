import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: NextRequest) {
  try {
    if (
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY === 'your_service_role_key'
    ) {
      return NextResponse.json(
        { error: 'Serviço de upload não configurado. Verifique SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      )
    }

    // Obter usuário: prioriza token no header (mais confiável em API), senão cookies
    let userId: string | null = null
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (token) {
      const supabaseAuth = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      )
      const { data: { user } } = await supabaseAuth.auth.getUser(token)
      userId = user?.id ?? null
    }
    if (!userId) {
      const supabase = await createServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id ?? null
    }
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado. Faça login novamente.' }, { status: 401 })
    }

    // Verificar se é admin (via usuario_admin_cache)
    const admin = createAdminClient()
    const { data: cache } = await admin
      .from('usuario_admin_cache')
      .select('is_admin')
      .eq('auth_user_id', userId)
      .maybeSingle()
    if (!cache?.is_admin) {
      return NextResponse.json({ error: 'Sem permissão para fazer upload.' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const bucket = (formData.get('bucket') as string) || 'produtos'
    const path = (formData.get('path') as string) || ''

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    const mime = file.type.toLowerCase()
    const isValidType = ALLOWED_TYPES.includes(mime) || mime.startsWith('image/')
    if (!isValidType) {
      return NextResponse.json(
        { error: 'Formato inválido. Use JPG, PNG, WebP ou GIF.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Imagem muito grande. Máximo: 5MB' },
        { status: 400 }
      )
    }

    // Garantir que o bucket existe
    const { data: buckets } = await admin.storage.listBuckets()
    const bucketExiste = buckets?.some(b => b.name === bucket)
    if (!bucketExiste) {
      const { error: createErr } = await admin.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: '5MB',
        allowedMimeTypes: ['image/*']
      })
      if (createErr) {
        console.error('Erro ao criar bucket:', createErr)
        return NextResponse.json(
          { error: `Erro ao criar bucket: ${createErr.message}` },
          { status: 500 }
        )
      }
    }

    const fileExt = file.name.split('.').pop() || 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = path ? `${path}/${fileName}` : fileName

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { error } = await admin.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Erro no upload:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('Erro no upload:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao fazer upload' },
      { status: 500 }
    )
  }
}
