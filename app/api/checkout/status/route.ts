import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Consulta status da transação (para polling no Pix). Só retorna se a transação for do usuário logado. */
export async function GET(request: NextRequest) {
  const transacaoId = request.nextUrl.searchParams.get('transacaoId')
  if (!transacaoId) {
    return NextResponse.json({ ok: false, erro: 'transacaoId obrigatório' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, erro: 'Não autenticado' }, { status: 401 })
  }
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) {
    return NextResponse.json({ ok: false, erro: 'Usuário não encontrado' }, { status: 403 })
  }
  const { data: transacao, error } = await supabase
    .from('transacoes')
    .select('id, status, pedido_id, usuario_id')
    .eq('id', transacaoId)
    .single()
  if (error || !transacao) {
    return NextResponse.json({ ok: false, erro: 'Transação não encontrada' }, { status: 404 })
  }
  if (transacao.usuario_id !== usuario.id) {
    return NextResponse.json({ ok: false, erro: 'Transação não encontrada' }, { status: 404 })
  }
  return NextResponse.json({
    ok: true,
    status: transacao.status,
    pedidoId: transacao.pedido_id,
  })
}
