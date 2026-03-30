import { NextResponse } from 'next/server'
import { getAdminData } from '@/app/actions/admin'
import { atualizarProdutosBatch, type AtualizacaoLotePayload } from '@/app/actions/produtos-admin'

export async function POST(request: Request) {
  try {
    const admin = await getAdminData()
    const empresaId = admin.empresa_id ?? (Array.isArray(admin.empresas) && admin.empresas[0] ? (admin.empresas[0] as { id: string }).id : null)
    if (!empresaId) {
      return NextResponse.json({ erro: 'Nenhuma empresa vinculada ao admin' }, { status: 400 })
    }

    const body = await request.json()
    const atualizacoes = body?.atualizacoes as AtualizacaoLotePayload[] | undefined
    if (!Array.isArray(atualizacoes) || atualizacoes.length === 0) {
      return NextResponse.json({ erro: 'Envie um array de atualizacoes (id, nome, descricao, preco, valor_custo, estoque)' }, { status: 400 })
    }

    const validados: AtualizacaoLotePayload[] = []
    for (let i = 0; i < atualizacoes.length; i++) {
      const a = atualizacoes[i]
      if (!a || typeof a.id !== 'string' || !a.id.trim()) {
        return NextResponse.json({ erro: `Item na posição ${i + 1}: id obrigatório` }, { status: 400 })
      }
      if (typeof a.preco !== 'number' || a.preco < 0 || typeof a.estoque !== 'number' || a.estoque < 0) {
        return NextResponse.json({ erro: `Item na posição ${i + 1}: preco e estoque devem ser números >= 0` }, { status: 400 })
      }
      const valorCusto = a.valor_custo != null ? (Number(a.valor_custo) >= 0 ? Number(a.valor_custo) : null) : null

      // Compatibilidade: aceitar tanto campos usados no frontend (categoria, grupo, disp_tipo, disp_valores)
      // quanto os nomes internos do payload (categoria_nome, grupo_nome, disponibilidade_tipo, disponibilidade_valores).
      const aAny = a as any

      const categoriaBruta =
        aAny.categoria_nome != null
          ? aAny.categoria_nome
          : aAny.categoria != null
            ? aAny.categoria
            : null
      const grupoBruto =
        aAny.grupo_nome != null
          ? aAny.grupo_nome
          : aAny.grupo != null
            ? aAny.grupo
            : null

      const categoria_nome =
        categoriaBruta != null ? String(categoriaBruta).trim() || null : undefined
      const grupo_nome =
        grupoBruto != null ? String(grupoBruto).trim() || null : undefined

      const visBruta = aAny.visibilidade
      const vis =
        visBruta != null ? String(visBruta).trim().toUpperCase() || null : undefined

      const dispTipoBruto =
        aAny.disponibilidade_tipo != null
          ? aAny.disponibilidade_tipo
          : aAny.disp_tipo != null
            ? aAny.disp_tipo
            : null
      const dispValoresBrutos =
        aAny.disponibilidade_valores != null
          ? aAny.disponibilidade_valores
          : aAny.disp_valores != null
            ? aAny.disp_valores
            : null

      const disp_tipo =
        dispTipoBruto != null ? String(dispTipoBruto).trim().toUpperCase() || null : undefined
      const disp_valores =
        dispValoresBrutos != null ? String(dispValoresBrutos).trim() || null : undefined

      validados.push({
        id: a.id.trim(),
        nome: a.nome != null ? String(a.nome).trim() : '',
        descricao: a.descricao != null ? String(a.descricao).trim() : '',
        preco: a.preco,
        valor_custo: valorCusto,
        estoque: a.estoque,
        categoria_nome,
        grupo_nome,
        visibilidade:
          vis && ['APP', 'CANTINA', 'AMBOS', 'CONSUMO_INTERNO'].includes(vis as any)
            ? (vis as AtualizacaoLotePayload['visibilidade'])
            : undefined,
        disponibilidade_tipo:
          disp_tipo && ['TODOS', 'SEGMENTO', 'TURMA'].includes(disp_tipo as any)
            ? (disp_tipo as AtualizacaoLotePayload['disponibilidade_tipo'])
            : undefined,
        disponibilidade_valores: disp_valores,
      })
    }

    const { atualizados, erro } = await atualizarProdutosBatch(empresaId, validados)
    if (erro) {
      return NextResponse.json({ erro, atualizados }, { status: 500 })
    }
    return NextResponse.json({ atualizados })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao atualizar produtos'
    return NextResponse.json({ erro: msg }, { status: 500 })
  }
}
