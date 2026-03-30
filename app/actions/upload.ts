'use server'

import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * Upload de imagem para Supabase Storage (Server Action)
 * Usa admin client para garantir que funcione com permissões
 */
export async function uploadImagemAction(
  formData: FormData,
  bucket: 'produtos' | 'loja',
  path?: string
): Promise<{ url: string } | { error: string }> {
  try {
    const file = formData.get('file') as File | null
    if (!file) {
      return { error: 'Nenhum arquivo enviado' }
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { error: 'Formato inválido. Use JPG, PNG, WebP ou GIF.' }
    }

    if (file.size > MAX_SIZE) {
      return { error: 'Imagem muito grande. Máximo: 5MB' }
    }

    const supabase = createAdminClient()

    // Garantir que o bucket existe
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExiste = buckets?.some(b => b.name === bucket)
    if (!bucketExiste) {
      await supabase.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: MAX_SIZE,
        allowedMimeTypes: ALLOWED_TYPES
      })
    }

    const fileExt = file.name.split('.').pop() || 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = path ? `${path}/${fileName}` : fileName

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Erro no upload:', error)
      return { error: error.message }
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return { url: publicUrl }
  } catch (err) {
    console.error('Erro no upload:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao fazer upload' }
  }
}

/**
 * Deletar imagem do Storage (Server Action)
 */
export async function deletarImagemAction(
  url: string,
  bucket: 'produtos' | 'loja' = 'produtos'
): Promise<{ success: boolean; error?: string }> {
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    const bucketIndex = pathParts.findIndex(part => part === bucket)
    if (bucketIndex === -1) return { success: false, error: 'URL inválida' }

    const filePath = pathParts.slice(bucketIndex + 1).join('/')
    const supabase = createAdminClient()
    const { error } = await supabase.storage.from(bucket).remove([filePath])

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao deletar' }
  }
}
