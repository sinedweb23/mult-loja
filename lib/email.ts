import nodemailer from 'nodemailer'
import { obterConfiguracaoSMTP } from '@/app/actions/configuracoes'

/**
 * Criar transporter SMTP baseado nas configurações.
 */
async function criarTransporter() {
  try {
    const smtpConfig = await obterConfiguracaoSMTP()

    console.log('📧 Configuração SMTP obtida:', {
      enabled: smtpConfig.enabled,
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.user ? '***' : null,
    })

    // Se SMTP não está habilitado, retornar null
    if (!smtpConfig.enabled) {
      console.log('⚠️ SMTP não está habilitado nas configurações')
      return null
    }

    // Validar configurações
    if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.password) {
      console.error('❌ Configurações SMTP incompletas:', {
        temHost: !!smtpConfig.host,
        temUser: !!smtpConfig.user,
        temPassword: !!smtpConfig.password,
      })
      return null
    }

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port || 587,
      secure: smtpConfig.secure || smtpConfig.port === 465, // true para 465, false para outras portas
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.password,
      },
      tls: {
        rejectUnauthorized: false // Necessário para alguns servidores SMTP
      }
    })

    // Verificar conexão
    try {
      await transporter.verify()
      console.log('✅ Conexão SMTP verificada com sucesso')
    } catch (error) {
      console.error('❌ Erro ao verificar conexão SMTP:', error)
      // Não retornar null aqui, pode funcionar mesmo sem verificação
      console.log('⚠️ Continuando mesmo com erro na verificação...')
    }

    return transporter
  } catch (error) {
    console.error('❌ Erro ao criar transporter SMTP:', error)
    return null
  }
}

/**
 * Enviar email de primeiro acesso/recuperação de senha
 */
export async function enviarEmailPrimeiroAcesso(
  email: string,
  linkRecuperacao: string,
  nomeResponsavel?: string
) {
  try {
    const transporter = await criarTransporter()
    
    if (!transporter) {
      console.error('❌ Não foi possível criar transporter SMTP')
      return { success: false, error: 'SMTP não configurado' }
    }

    const smtpConfig = await obterConfiguracaoSMTP()
    const nomeRemetente = smtpConfig.sender_name || 'Portal Morumbi Sul'
    const emailRemetente = smtpConfig.sender_email || smtpConfig.user

    const nome = nomeResponsavel || 'Responsável'

    const mailOptions = {
      from: `"${nomeRemetente}" <${emailRemetente}>`,
      to: email,
      subject: 'Criação de Senha - Portal Morumbi Sul',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2563eb; margin-top: 0;">Bem-vindo ao Portal Morumbi Sul</h1>
          </div>
          
          <p>Olá, <strong>${nome}</strong>!</p>
          
          <p>Você solicitou a criação de sua senha de acesso ao portal. Clique no botão abaixo para definir sua senha:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${linkRecuperacao}" 
               style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Criar Minha Senha
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            Ou copie e cole este link no seu navegador:<br>
            <a href="${linkRecuperacao}" style="color: #2563eb; word-break: break-all;">${linkRecuperacao}</a>
          </p>
          
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px;">
              <strong>⚠️ Importante:</strong> Este link expira em 24 horas. Se você não solicitou este email, ignore esta mensagem.
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #666; font-size: 12px; text-align: center;">
            Este é um email automático, por favor não responda.<br>
            Portal Morumbi Sul - Sistema de E-commerce
          </p>
        </body>
        </html>
      `,
      text: `
Bem-vindo ao Portal Morumbi Sul

Olá, ${nome}!

Você solicitou a criação de sua senha de acesso ao portal. Clique no link abaixo para definir sua senha:

${linkRecuperacao}

Importante: Este link expira em 24 horas. Se você não solicitou este email, ignore esta mensagem.

Este é um email automático, por favor não responda.
Portal Morumbi Sul - Sistema de E-commerce
      `,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('✅ Email enviado com sucesso:', info.messageId)
    
    return { success: true, messageId: info.messageId }
  } catch (error: any) {
    console.error('❌ Erro ao enviar email:', error)
    return { 
      success: false, 
      error: error.message || 'Erro ao enviar email' 
    }
  }
}

/**
 * Enviar email de recuperação de senha
 */
export async function enviarEmailRecuperacaoSenha(
  email: string,
  linkRecuperacao: string,
  nomeResponsavel?: string
) {
  try {
    const transporter = await criarTransporter()
    
    if (!transporter) {
      console.error('❌ Não foi possível criar transporter SMTP')
      return { success: false, error: 'SMTP não configurado' }
    }

    const smtpConfig = await obterConfiguracaoSMTP()
    const nomeRemetente = smtpConfig.sender_name || 'Portal Morumbi Sul'
    const emailRemetente = smtpConfig.sender_email || smtpConfig.user

    const nome = nomeResponsavel || 'Responsável'

    const mailOptions = {
      from: `"${nomeRemetente}" <${emailRemetente}>`,
      to: email,
      subject: 'Recuperação de Senha - Portal Morumbi Sul',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2563eb; margin-top: 0;">Recuperação de Senha</h1>
          </div>
          
          <p>Olá, <strong>${nome}</strong>!</p>
          
          <p>Você solicitou a recuperação de sua senha. Clique no botão abaixo para redefinir sua senha:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${linkRecuperacao}" 
               style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Redefinir Senha
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            Ou copie e cole este link no seu navegador:<br>
            <a href="${linkRecuperacao}" style="color: #2563eb; word-break: break-all;">${linkRecuperacao}</a>
          </p>
          
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px;">
              <strong>⚠️ Importante:</strong> Este link expira em 24 horas. Se você não solicitou este email, ignore esta mensagem.
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #666; font-size: 12px; text-align: center;">
            Este é um email automático, por favor não responda.<br>
            Portal Morumbi Sul - Sistema de E-commerce
          </p>
        </body>
        </html>
      `,
      text: `
Recuperação de Senha - Portal Morumbi Sul

Olá, ${nome}!

Você solicitou a recuperação de sua senha. Clique no link abaixo para redefinir sua senha:

${linkRecuperacao}

Importante: Este link expira em 24 horas. Se você não solicitou este email, ignore esta mensagem.

Este é um email automático, por favor não responda.
Portal Morumbi Sul - Sistema de E-commerce
      `,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('✅ Email de recuperação enviado com sucesso:', info.messageId)
    
    return { success: true, messageId: info.messageId }
  } catch (error: any) {
    console.error('❌ Erro ao enviar email de recuperação:', error)
    return { 
      success: false, 
      error: error.message || 'Erro ao enviar email' 
    }
  }
}
