import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PayloadPedidoLoja } from '@/app/actions/transacoes'
import { abaterEstoquePedido } from '@/app/actions/transacoes'

export const dynamic = 'force-dynamic'

type Body = {
  payload?: PayloadPedidoLoja
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autenticado' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: usuario, error: usuarioError } = await admin
      .from('usuarios')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (usuarioError) {
      console.error('[checkout/saldo] Erro ao buscar usuario:', usuarioError)
      return NextResponse.json({ ok: false, erro: 'Erro ao verificar usuário. Tente novamente.' }, { status: 500 })
    }
    if (!usuario) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            'Usuário não encontrado. Sua conta não está vinculada a um responsável no sistema. Entre em contato com o suporte.',
        },
        { status: 403 }
      )
    }

    const body = (await request.json()) as Body
    const payload = body.payload
    const pedidos = payload?.pedidos
    if (!payload || !Array.isArray(pedidos) || pedidos.length === 0) {
      return NextResponse.json({ ok: false, erro: 'Payload do pedido inválido' }, { status: 400 })
    }

    // Totais por aluno
    const totaisPorAluno = new Map<string, number>()
    for (const p of pedidos) {
      const subtotal = p.itens.reduce((s, i) => s + i.subtotal, 0)
      totaisPorAluno.set(p.alunoId, (totaisPorAluno.get(p.alunoId) ?? 0) + subtotal)
    }

    const alunoIds = Array.from(totaisPorAluno.keys())

    // Buscar saldos atuais
    const { data: saldosRows, error: saldosErr } = await admin
      .from('aluno_saldos')
      .select('aluno_id, saldo')
      .in('aluno_id', alunoIds)

    if (saldosErr) {
      console.error('[checkout/saldo] Erro ao buscar saldos:', saldosErr)
      return NextResponse.json({ ok: false, erro: 'Erro ao verificar saldo dos alunos' }, { status: 500 })
    }

    const mapaSaldo = new Map<string, number>()
    for (const row of saldosRows || []) {
      mapaSaldo.set(row.aluno_id as string, Number(row.saldo))
    }

    // Buscar nomes dos alunos (para mensagem de erro e pedidos)
    const { data: alunosRows, error: alunosErr } = await admin
      .from('alunos')
      .select('id, nome, empresa_id, unidade_id')
      .in('id', alunoIds)

    if (alunosErr) {
      console.error('[checkout/saldo] Erro ao buscar alunos:', alunosErr)
      return NextResponse.json({ ok: false, erro: 'Erro ao carregar dados dos alunos' }, { status: 500 })
    }

    const mapaAlunoInfo = new Map<
      string,
      { nome: string | null; empresa_id: string; unidade_id: string }
    >()
    for (const a of alunosRows || []) {
      mapaAlunoInfo.set(a.id as string, {
        nome: (a.nome as string | null) ?? null,
        empresa_id: a.empresa_id as string,
        unidade_id: a.unidade_id as string,
      })
    }

    // Validar saldos suficientes para TODOS os alunos
    const errosSaldo: string[] = []
    for (const alunoId of alunoIds) {
      const totalAluno = totaisPorAluno.get(alunoId) ?? 0
      const saldoAtual = mapaSaldo.get(alunoId) ?? 0
      if (saldoAtual < totalAluno) {
        const info = mapaAlunoInfo.get(alunoId)
        const nome = info?.nome ?? 'Aluno'
        errosSaldo.push(
          `${nome}: saldo insuficiente (saldo: R$ ${saldoAtual.toFixed(2).replace('.', ',')}, necessário: R$ ${totalAluno
            .toFixed(2)
            .replace('.', ',')})`
        )
      }
    }

    if (errosSaldo.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            'Não foi possível concluir a compra com saldo dos alunos:\n' +
            errosSaldo.join('\n'),
        },
        { status: 400 }
      )
    }

    const pedidoIds: string[] = []
    type DebitoRealizado = { alunoId: string; valor: number; pedidoId: string }
    const debitosFeitos: DebitoRealizado[] = []

    // Criar pedidos, debitar saldo de forma atômica (RPC) e lançar estoque
    for (const p of pedidos) {
      const info = mapaAlunoInfo.get(p.alunoId)
      if (!info) {
        return NextResponse.json(
          { ok: false, erro: `Aluno não encontrado para o pedido (${p.alunoId})` },
          { status: 400 }
        )
      }

      const total = p.itens.reduce((s, i) => s + i.subtotal, 0)

      const { data: pedido, error: errPedido } = await admin
        .from('pedidos')
        .insert({
          empresa_id: info.empresa_id,
          unidade_id: info.unidade_id,
          usuario_id: usuario.id,
          aluno_id: p.alunoId,
          status: 'PAGO',
          total,
          data_retirada: p.dataRetirada,
          origem: 'ONLINE',
          tipo_beneficiario: 'ALUNO',
        })
        .select('id')
        .single()

      if (errPedido || !pedido) {
        return NextResponse.json(
          { ok: false, erro: errPedido?.message ?? 'Erro ao criar pedido' },
          { status: 500 }
        )
      }

      pedidoIds.push(pedido.id)

      const itensInsert = p.itens.map((i) => ({
        pedido_id: pedido.id,
        produto_id: i.produto_id,
        kit_produto_id: i.kit_produto_id ?? null,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        subtotal: i.subtotal,
        data_retirada: i.data_retirada || p.dataRetirada,
        variacoes_selecionadas: i.variacoes_selecionadas ?? {},
        produto_nome: i.produto_nome ?? null,
        tema_festa: i.tema_festa ?? null,
        idade_festa: i.idade_festa ?? null,
        kit_festa_data: i.kit_festa_data ?? null,
        kit_festa_horario_inicio: i.kit_festa_horario_inicio ?? null,
        kit_festa_horario_fim: i.kit_festa_horario_fim ?? null,
        opcionais_selecionados: Array.isArray(i.opcionais_selecionados) ? i.opcionais_selecionados : [],
      }))

      const { error: errItens } = await admin.from('pedido_itens').insert(itensInsert)
      if (errItens) {
        return NextResponse.json({ ok: false, erro: errItens.message }, { status: 500 })
      }

      // Debitar saldo do aluno de forma atômica (RPC) + movimentação em uma única transação no banco
      const { data: debitoRows, error: saldoRpcErr } = await admin.rpc(
        'creditar_debitar_aluno_saldo',
        {
          p_aluno_id: p.alunoId,
          p_valor: total,
          p_tipo: 'COMPRA',
          p_pedido_id: pedido.id,
          p_transacao_id: null,
          p_caixa_id: null,
          p_usuario_id: usuario.id,
          p_observacao: 'Compra na loja - pago com saldo',
        }
      )

      if (saldoRpcErr) {
        console.error('[checkout/saldo] Erro RPC saldo:', saldoRpcErr)
        // rollback local mínimo: remover itens/pedido criado
        await admin.from('pedido_itens').delete().eq('pedido_id', pedido.id)
        await admin.from('pedidos').delete().eq('id', pedido.id)
        // Estornar débitos já feitos para outros alunos desta requisição
        for (const d of debitosFeitos) {
          await admin.rpc('creditar_debitar_aluno_saldo', {
            p_aluno_id: d.alunoId,
            p_valor: d.valor,
            p_tipo: 'ESTORNO',
            p_pedido_id: d.pedidoId,
            p_transacao_id: null,
            p_caixa_id: null,
            p_usuario_id: usuario.id,
            p_observacao: 'Estorno automático - falha em compra com saldo conjunta',
          })
        }
        return NextResponse.json(
          { ok: false, erro: 'Erro ao debitar saldo: ' + saldoRpcErr.message },
          { status: 500 }
        )
      }

      const linhaDebito = Array.isArray(debitoRows) ? debitoRows[0] : debitoRows
      if (!linhaDebito || linhaDebito.erro) {
        // rollback do pedido atual
        await admin.from('pedido_itens').delete().eq('pedido_id', pedido.id)
        await admin.from('pedidos').delete().eq('id', pedido.id)
        // Estornar débitos anteriores
        for (const d of debitosFeitos) {
          await admin.rpc('creditar_debitar_aluno_saldo', {
            p_aluno_id: d.alunoId,
            p_valor: d.valor,
            p_tipo: 'ESTORNO',
            p_pedido_id: d.pedidoId,
            p_transacao_id: null,
            p_caixa_id: null,
            p_usuario_id: usuario.id,
            p_observacao: 'Estorno automático - falha em compra com saldo conjunta',
          })
        }
        const msg =
          linhaDebito?.erro === 'Saldo insuficiente'
            ? 'Saldo insuficiente para concluir a compra com saldo. Tente novamente.'
            : linhaDebito?.erro ?? 'Não foi possível debitar o saldo do aluno.'
        return NextResponse.json({ ok: false, erro: msg }, { status: 400 })
      }

      debitosFeitos.push({ alunoId: p.alunoId, valor: total, pedidoId: pedido.id })

      // Abater estoque (mesma regra dos pedidos online)
      const abate = await abaterEstoquePedido(admin, p.itens)
      if (!abate.ok) {
        return NextResponse.json(
          { ok: false, erro: abate.erro ?? 'Estoque insuficiente' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({ ok: true, pedidoIds })
  } catch (e) {
    console.error('[checkout/saldo]', e)
    return NextResponse.json(
      { ok: false, erro: e instanceof Error ? e.message : 'Erro interno' },
      { status: 500 }
    )
  }
}

