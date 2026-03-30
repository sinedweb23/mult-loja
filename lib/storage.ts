/**
 * Utilitários para upload de arquivos no Supabase Storage
 */

import { createClient } from '@/lib/supabase/client'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Upload de imagem para Supabase Storage
 * @param file Arquivo a ser enviado
 * @param bucket Nome do bucket (default: 'produtos')
 * @param path Caminho dentro do bucket (opcional)
 * @returns URL pública da imagem
 */
export async function uploadImagem(
  file: File,
  bucket: string = 'produtos',
  path?: string
): Promise<string> {
  const supabase = createClient()

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Imagem muito grande. Máximo: 5MB')
  }
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon']
  if (!allowed.includes(file.type.toLowerCase()) && !file.type.startsWith('image/')) {
    throw new Error('Formato inválido. Use JPG, PNG, WebP ou GIF.')
  }
  
  // Gerar nome único para o arquivo
  const fileExt = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
  const filePath = path ? `${path}/${fileName}` : fileName

  // Upload do arquivo
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    console.error('Erro ao fazer upload:', error)
    throw new Error(error.message || 'Erro ao fazer upload')
  }

  const uploadPath = data?.path ?? filePath
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(uploadPath)

  return publicUrl
}

/**
 * Deletar imagem do Supabase Storage
 */
export async function deletarImagem(
  url: string,
  bucket: string = 'produtos'
): Promise<void> {
  try {
    // Extrair o caminho do arquivo da URL
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    const bucketIndex = pathParts.findIndex(part => part === bucket)
    
    if (bucketIndex === -1) {
      console.warn('Não foi possível extrair o caminho do arquivo da URL')
      return
    }

    const filePath = pathParts.slice(bucketIndex + 1).join('/')
    
    const supabase = createClient()
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath])

    if (error) {
      console.error('Erro ao deletar imagem:', error)
      // Não lançar erro, apenas logar
    }
  } catch (err) {
    console.error('Erro ao processar deleção de imagem:', err)
    // Não lançar erro, apenas logar
  }
}

/**
 * Verificar se o bucket existe, se não, criar
 * (Usa admin client para criar bucket)
 */
export async function garantirBucketExiste(bucket: string = 'produtos'): Promise<void> {
  try {
    const adminClient = createAdminClient()
    
    // Listar buckets existentes
    const { data: buckets, error: listError } = await adminClient.storage.listBuckets()
    
    if (listError) {
      console.error('Erro ao listar buckets:', listError)
      return
    }

    // Verificar se o bucket já existe
    const bucketExiste = buckets?.some(b => b.name === bucket)
    
    if (!bucketExiste) {
      // Criar bucket (requer permissões de admin)
      const { error: createError } = await adminClient.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      })

      if (createError) {
        console.error('Erro ao criar bucket:', createError)
        // Não lançar erro, apenas logar (pode ser que o bucket já exista)
      }
    }
  } catch (err) {
    console.error('Erro ao garantir bucket:', err)
    // Não lançar erro, apenas logar
  }
}
