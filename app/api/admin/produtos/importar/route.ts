import { NextResponse } from 'next/server'
import { getAdminData } from '@/app/actions/admin'
import { inserirProdutosBatch, type ProdutoImportacaoPayload } from '@/app/actions/produtos-admin'

export async function POST(request: Request) {
  try {
    const admin = await getAdminData()
    const empresaId = admin.empresa_id ?? (Array.isArray(admin.empresas) && admin.empresas[0] ? (admin.empresas[0] as { id: string }).id : null)
    if (!empresaId) {
      return NextResponse.json({ erro: 'Nenhuma empresa vinculada ao admin' }, { status: 400 })
    }

    const body = await request.json()
    const produtos = body?.produtos as ProdutoImportacaoPayload[] | undefined
    if (!Array.isArray(produtos) || produtos.length === 0) {
      return NextResponse.json({ erro: 'Envie um array de produtos' }, { status: 400 })
    }

    const validados: ProdutoImportacaoPayload[] = []
    for (let i = 0; i < produtos.length; i++) {
      const p = produtos[i] as Record<string, unknown>
      if (
        !p ||
        typeof p.tipo !== 'string' ||
        typeof p.nome !== 'string' ||
        typeof p.preco !== 'number' ||
        typeof p.estoque !== 'number'
      ) {
        return NextResponse.json(
          { erro: `Produto na posição ${i + 1} inválido (tipo, nome, preco, estoque obrigatórios)` },
          { status: 400 },
        )
      }
      const tipo = p.tipo as ProdutoImportacaoPayload['tipo']
      if (!['PRODUTO', 'SERVICO', 'KIT', 'KIT_FESTA', 'KIT_LANCHE'].includes(tipo)) {
        return NextResponse.json({ erro: `Produto na posição ${i + 1}: tipo inválido` }, { status: 400 })
      }
      if (p.preco < 0 || p.estoque < 0) {
        return NextResponse.json(
          { erro: `Produto na posição ${i + 1}: preco e estoque devem ser >= 0` },
          { status: 400 },
        )
      }

      const visibilidade =
        typeof p.visibilidade === 'string' && p.visibilidade.trim()
          ? p.visibilidade.trim().toUpperCase()
          : undefined
      const dispTipoBruto = p.disponibilidade_tipo ?? p.disp_tipo
      const disp_tipo =
        typeof dispTipoBruto === 'string' && String(dispTipoBruto).trim()
          ? String(dispTipoBruto).trim().toUpperCase()
          : undefined
      const dispValoresBruto = p.disponibilidade_valores ?? p.disp_valores
      const disp_valores =
        typeof dispValoresBruto === 'string' && dispValoresBruto.trim() ? dispValoresBruto.trim() : undefined
      const categoriaBruto = p.categoria_nome ?? p.categoria
      const categoria_nome =
        typeof categoriaBruto === 'string' && categoriaBruto.trim() ? categoriaBruto.trim() : undefined
      const grupoBruto = p.grupo_nome ?? p.grupo
      const grupo_nome =
        typeof grupoBruto === 'string' && grupoBruto.trim() ? grupoBruto.trim() : undefined

      const payload: ProdutoImportacaoPayload = {
        tipo,
        nome: String(p.nome).trim(),
        descricao: p.descricao != null ? String(p.descricao) : '',
        preco: p.preco,
        valor_custo: p.valor_custo != null && Number(p.valor_custo) >= 0 ? Number(p.valor_custo) : null,
        estoque: p.estoque,
        visibilidade:
          visibilidade && ['APP', 'CANTINA', 'AMBOS', 'CONSUMO_INTERNO'].includes(visibilidade)
            ? (visibilidade as ProdutoImportacaoPayload['visibilidade'])
            : undefined,
        disponibilidade_tipo:
          disp_tipo && ['TODOS', 'SEGMENTO', 'TURMA'].includes(disp_tipo)
            ? (disp_tipo as ProdutoImportacaoPayload['disponibilidade_tipo'])
            : undefined,
        disponibilidade_valores: disp_valores,
        categoria_nome,
        grupo_nome,
      }

      validados.push(payload)
    }

    const { inseridos, erro } = await inserirProdutosBatch(empresaId, validados)
    if (erro) {
      return NextResponse.json({ erro, inseridos }, { status: 500 })
    }
    return NextResponse.json({ inseridos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao importar produtos'
    return NextResponse.json({ erro: msg }, { status: 500 })
  }
}
