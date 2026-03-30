'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { getAuthCallbackUrl } from '@/lib/auth-origin'

const emailSchema = z.string().email('Email inválido')

/** URL canônica do callback (usa NEXT_PUBLIC_APP_URL em produção para evitar PKCE em outro domínio). */
export async function getRedirectToAuthCallback(): Promise<string> {
  return getAuthCallbackUrl()
}

/**
 * Primeiro acesso sem link de email.
 * Usuário informa email + CPF + senha.
 * Valida na tabela usuarios e cria o usuário no Auth (com senha) se ainda não existir.
 * NÃO faz login automático; o usuário deve usar a nova senha na tela de login.
 */
export async function solicitarPrimeiroAcesso(
  email: string,
  cpf: string,
  senha: string
) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Configuração do servidor incompleta. Contate o suporte.')
    }

    const schema = z.object({
      email: emailSchema,
      cpf: z
        .string()
        .min(11, 'CPF inválido')
        .max(20, 'CPF inválido'),
      senha: z
        .string()
        .min(6, 'A senha deve ter pelo menos 6 caracteres'),
    })

    const parsed = schema.parse({
      email: email.trim().toLowerCase(),
      cpf: cpf.trim(),
      senha,
    })

    const emailValidado = parsed.email
    const cpfDigits = parsed.cpf.replace(/\D/g, '')

    if (cpfDigits.length !== 11) {
      throw new Error('CPF inválido')
    }

    const admin = createAdminClient()

    const { data: usuario, error: errUsuario } = await admin
      .from('usuarios')
      .select('id, nome, email, ativo, auth_user_id, cpf')
      .eq('email', emailValidado)
      .maybeSingle()

    if (errUsuario) {
      console.error('Erro ao buscar usuario:', errUsuario)
      throw new Error('Erro ao verificar dados. Tente novamente.')
    }

    if (!usuario || !usuario.ativo) {
      // Mensagem genérica para não vazar se existe ou não
      throw new Error(
        'Não foi possível concluir o primeiro acesso. Verifique email e CPF ou entre em contato com a escola.'
      )
    }

    const storedCpfDigits = (usuario.cpf || '').replace(/\D/g, '')
    if (storedCpfDigits.length !== 11 || storedCpfDigits !== cpfDigits) {
      throw new Error(
        'Não foi possível concluir o primeiro acesso. Verifique email e CPF ou entre em contato com a escola.'
      )
    }

    // Se já existe auth_user_id, apenas atualiza a senha no Auth (permite redefinir aqui também)
    if (usuario.auth_user_id) {
      try {
        await admin.auth.admin.updateUserById(usuario.auth_user_id, {
          password: parsed.senha,
        })
      } catch (e) {
        console.error('Erro ao atualizar senha no Auth (primeiro acesso):', e)
        return {
          success: false,
          message:
            'Não foi possível atualizar a senha neste momento. Tente novamente ou use "Esqueci minha senha".',
        }
      }

      return {
        success: true,
        message: 'Senha atualizada com sucesso. Agora faça login com seu email e a nova senha.',
      }
    }

    // Não tem auth_user_id ainda: criar usuário no Auth com senha
    const nome = usuario.nome || 'Usuário'
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email: emailValidado,
      email_confirm: true,
      password: parsed.senha,
      user_metadata: { nome, usuario_id: usuario.id },
    })

    if (createError) {
      console.error('Erro ao criar usuário no Auth (primeiro acesso):', createError)
      const msg = createError.message?.toLowerCase() ?? ''
      const jaRegistrado =
        msg.includes('already registered') ||
        msg.includes('already been registered') ||
        msg.includes('user already registered') ||
        msg.includes('already exists')

      if (jaRegistrado) {
        const { data: list } = await admin.auth.admin.listUsers()
        const existing = list?.users?.find((u) => u.email?.toLowerCase() === emailValidado)
        if (existing) {
          try {
            await admin.auth.admin.updateUserById(existing.id, {
              password: parsed.senha,
            })
          } catch (e) {
            console.error('Erro ao atualizar senha de usuário já existente (primeiro acesso):', e)
            return {
              success: false,
              message:
                'Não foi possível atualizar a senha neste momento. Tente novamente ou use "Esqueci minha senha".',
            }
          }

          await admin.from('usuarios').update({ auth_user_id: existing.id }).eq('id', usuario.id)

          return {
            success: true,
            message: 'Senha atualizada com sucesso. Agora faça login com seu email e a nova senha.',
          }
        }
      }

      return {
        success: false,
        message:
          'Não foi possível criar o acesso neste momento. Tente novamente ou entre em contato com a escola.',
      }
    }

    if (newUser?.user) {
      await admin.from('usuarios').update({ auth_user_id: newUser.user.id }).eq('id', usuario.id)
    }

    return {
      success: true,
      message: 'Senha criada com sucesso. Agora faça login com seu email e a nova senha.',
    }
  } catch (error: unknown) {
    console.error('[Primeiro acesso] Erro na criação de acesso:', error)

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: error.issues?.[0]?.message || 'Dados inválidos. Verifique email, CPF e senha.',
      }
    }

    if (error instanceof Error) {
      return {
        success: false,
        message: error.message || 'Erro ao processar primeiro acesso. Tente novamente.',
      }
    }

    return {
      success: false,
      message: 'Erro ao processar primeiro acesso. Tente novamente.',
    }
  }
}

/**
 * Prepara recuperação de senha (esqueci minha senha): só para quem já tem conta no Auth.
 * NÃO envia o email aqui — o cliente deve chamar resetPasswordForEmail no navegador (PKCE em cookies).
 */
export async function solicitarRecuperarSenha(email: string) {
  try {
    const emailValidado = emailSchema.parse(email.trim().toLowerCase())
    const admin = createAdminClient()

    const { data: usuario, error: errUsuario } = await admin
      .from('usuarios')
      .select('id, ativo, auth_user_id')
      .eq('email', emailValidado)
      .maybeSingle()

    if (errUsuario) {
      console.error('Erro ao buscar usuario:', errUsuario)
      throw new Error('Erro ao verificar email')
    }

    if (!usuario) {
      return {
        success: true,
        redirectTo: await getRedirectToAuthCallback(),
        message:
          'Se o email estiver cadastrado, você receberá um email com o link para redefinir sua senha. Verifique a caixa de entrada e o spam.',
      }
    }

    if (!usuario.ativo) {
      throw new Error('Este email está inativo. Entre em contato com a administração.')
    }

    if (!usuario.auth_user_id) {
      throw new Error(
        'Este email ainda não possui senha cadastrada. Use "Primeiro acesso" na tela de login para criar sua senha.'
      )
    }

    return {
      success: true,
      redirectTo: await getRedirectToAuthCallback(),
      message:
        'Se o email estiver cadastrado, você receberá um email com o link para redefinir sua senha. Verifique a caixa de entrada e o spam.',
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) throw new Error('Email inválido')
    if (error instanceof Error) throw error
    throw new Error('Erro ao processar solicitação')
  }
}

/**
 * Verifica se email está cadastrado (para validação em tempo real)
 */
export async function verificarEmailCadastrado(email: string) {
  try {
    const emailValidado = emailSchema.parse(email.trim().toLowerCase())
    const supabase = await createClient() // server client for RLS

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, ativo')
      .eq('email', emailValidado)
      .maybeSingle()

    return {
      existe: !!usuario,
      ativo: usuario?.ativo ?? false,
    }
  } catch {
    return {
      existe: false,
      ativo: false,
    }
  }
}
