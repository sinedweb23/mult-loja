'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProdutoCompleto, Categoria, GrupoProduto, ProdutoVisibilidade } from '@/lib/types/database'
import { criarVariacao, atualizarVariacao, criarVariacaoValor, atualizarVariacaoValor, criarGrupoOpcional, atualizarGrupoOpcional, criarOpcional, atualizarOpcional, criarKitItem, listarKitItens, deletarKitItem, listarProdutos } from '@/app/actions/produtos-admin'
import { DisponibilidadeManager } from './disponibilidade-manager'
import { uploadImagem, deletarImagem } from '@/lib/storage'
import type { ProdutoTipo } from '@/lib/types/database'

const PRODUTO_TIPOS: { value: ProdutoTipo; label: string }[] = [
  { value: 'PRODUTO', label: 'Produto' },
  { value: 'SERVICO', label: 'Serviço' },
  { value: 'KIT', label: 'Kit' },
  { value: 'KIT_FESTA', label: 'Kit Festa' },
  { value: 'KIT_LANCHE', label: 'Kit Lanche' },
]

interface ProdutoFormModalProps {
  produto: ProdutoCompleto | null
  empresaId: string
  categorias: Categoria[]
  grupos: GrupoProduto[]
  onSave: (dados: any) => Promise<ProdutoCompleto>
  onClose: () => void
}

export function ProdutoFormModal({ produto, empresaId, categorias, grupos, onSave, onClose }: ProdutoFormModalProps) {
  const [loading, setLoading] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    tipo: produto?.tipo || 'PRODUTO',
    tipo_kit: (produto as any)?.tipo_kit || 'AVULSO',
    desconto_kit_mensal_pct: (produto as any)?.desconto_kit_mensal_pct != null ? String((produto as any).desconto_kit_mensal_pct) : '',
    unidade: (produto as any)?.unidade || 'UN',
    nome: produto?.nome || '',
    descricao: produto?.descricao || '',
    preco: produto?.preco ? String(produto.preco) : '0',
    valor_custo: (produto as any)?.valor_custo != null ? String((produto as any).valor_custo) : '',
    estoque: produto?.estoque || 0,
    compra_unica: produto?.compra_unica || false,
    limite_max_compra_unica: produto?.limite_max_compra_unica || 1,
    permitir_pix: produto?.permitir_pix ?? true,
    permitir_cartao: produto?.permitir_cartao ?? true,
    ativo: produto?.ativo ?? true,
    favorito: (produto as any)?.favorito ?? false,
    visibilidade: (produto as any)?.visibilidade || 'AMBOS',
    categoria_id: produto?.categoria_id || 'none',
    grupo_id: produto?.grupo_id || 'none',
    sku: produto?.sku || '',
    imagem_url: produto?.imagem_url || '',
    ordem: produto?.ordem || 0,
    // Campos fiscais
    ncm: produto?.ncm || '',
    cfop: produto?.cfop || '5102',
    unidade_comercial: produto?.unidade_comercial || 'UN',
    cst_icms: produto?.cst_icms || '',
    csosn: produto?.csosn || '',
    icms_origem: produto?.icms_origem || '0',
    aliq_icms: produto?.aliq_icms ? String(produto.aliq_icms) : '0.00',
    cst_pis: produto?.cst_pis || '',
    aliq_pis: produto?.aliq_pis ? String(produto.aliq_pis) : '0.00',
    cst_cofins: produto?.cst_cofins || '',
    aliq_cofins: produto?.aliq_cofins ? String(produto.aliq_cofins) : '0.00',
    cbenef: produto?.cbenef || '',
    exigir_termo_aceite: (produto as any)?.exigir_termo_aceite ?? false,
    texto_termo_aceite: (produto as any)?.texto_termo_aceite ?? '',
  })

  // Kit Festa: configurações (só quando tipo = KIT_FESTA)
  const [kitFestaDiasMin, setKitFestaDiasMin] = useState<string>('')
  const [kitFestaDiasMax, setKitFestaDiasMax] = useState<string>('')
  const [kitFestaHorariosManha, setKitFestaHorariosManha] = useState<{ inicio: string; fim: string }[]>([])
  const [kitFestaHorariosTarde, setKitFestaHorariosTarde] = useState<{ inicio: string; fim: string }[]>([])

  // Variações
  const [variacoes, setVariacoes] = useState<any[]>([])
  const [novaVariacao, setNovaVariacao] = useState({ nome: '', tipo: 'TEXTO' as 'TEXTO' | 'NUMERO' | 'COR', obrigatorio: false })
  const [valoresVariacao, setValoresVariacao] = useState<Record<string, any[]>>({})

  // Opcionais
  const [gruposOpcionais, setGruposOpcionais] = useState<any[]>([])
  const [novoGrupoOpcional, setNovoGrupoOpcional] = useState({ nome: '', obrigatorio: false, min_selecoes: 0, max_selecoes: null as number | null })
  const [opcionais, setOpcionais] = useState<Record<string, any[]>>({})

  // Itens do Kit
  const [kitsItens, setKitsItens] = useState<any[]>([])
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<any[]>([])
  const [novoKitItem, setNovoKitItem] = useState({ produto_id: '', quantidade: 1 })
  // Dias úteis (Kit Lanche): seleção por calendário (mês a mês)

  const VISIBILIDADES: { value: ProdutoVisibilidade; label: string; descricao: string }[] = [
    { value: 'APP', label: 'APP', descricao: 'Aparece apenas na loja online para os pais.' },
    { value: 'CANTINA', label: 'Cantina', descricao: 'Aparece apenas no PDV da cantina.' },
    { value: 'AMBOS', label: 'Ambos', descricao: 'Aparece tanto na loja online quanto no PDV.' },
    { value: 'CONSUMO_INTERNO', label: 'Consumo Interno', descricao: 'Aparece apenas na página de consumo interno (não no PDV nem na loja). Se combinar com outras opções, segue a regra normal.' },
  ]

  /** Quando há variações, estoque é a soma dos estoques dos valores de variação */
  const temVariacoes = variacoes.length > 0
  const estoqueVariacoes = useMemo(() => {
    if (!temVariacoes) return 0
    let soma = 0
    for (const key of Object.keys(valoresVariacao)) {
      const arr = valoresVariacao[key] || []
      for (const v of arr) {
        soma += v.estoque != null ? Number(v.estoque) : 0
      }
    }
    return soma
  }, [temVariacoes, valoresVariacao])

  /** Assim que o estoque das variações mudar, atualizar o estoque do produto (aba Básico e payload de save). */
  useEffect(() => {
    if (temVariacoes) {
      setFormData((prev) => ({ ...prev, estoque: estoqueVariacoes }))
    }
  }, [temVariacoes, estoqueVariacoes])

  // Atualizar preview quando imagem_url mudar
  useEffect(() => {
    if (formData.imagem_url) {
      setImagePreview(formData.imagem_url)
    } else {
      setImagePreview(null)
    }
  }, [formData.imagem_url])

  // Sincronizar todo o formulário quando produto mudar (ex.: abrir para edição após fetch)
  useEffect(() => {
    if (produto) {
      setFormData({
        tipo: produto.tipo || 'PRODUTO',
        tipo_kit: (produto as any)?.tipo_kit || 'AVULSO',
        desconto_kit_mensal_pct: (produto as any)?.desconto_kit_mensal_pct != null ? String((produto as any).desconto_kit_mensal_pct) : '',
        unidade: (produto as any)?.unidade || 'UN',
        nome: produto.nome || '',
        descricao: produto.descricao || '',
        preco: produto.preco != null ? String(produto.preco) : '0',
        valor_custo: (produto as any)?.valor_custo != null ? String((produto as any).valor_custo) : '',
        estoque: produto.estoque ?? 0,
        compra_unica: produto.compra_unica || false,
        limite_max_compra_unica: produto.limite_max_compra_unica || 1,
        permitir_pix: produto.permitir_pix ?? true,
        permitir_cartao: produto.permitir_cartao ?? true,
        ativo: produto.ativo ?? true,
        favorito: (produto as any)?.favorito ?? false,
        visibilidade: (produto as any)?.visibilidade || 'AMBOS',
        categoria_id: produto.categoria_id || 'none',
        grupo_id: produto.grupo_id || 'none',
        sku: produto.sku || '',
        imagem_url: produto.imagem_url || '',
        ordem: produto.ordem ?? 0,
        ncm: produto.ncm || '',
        cfop: produto.cfop || '5102',
        unidade_comercial: produto.unidade_comercial || 'UN',
        cst_icms: produto.cst_icms || '',
        csosn: produto.csosn || '',
        icms_origem: produto.icms_origem || '0',
        aliq_icms: produto.aliq_icms != null ? String(produto.aliq_icms) : '0.00',
        cst_pis: produto.cst_pis || '',
        aliq_pis: produto.aliq_pis != null ? String(produto.aliq_pis) : '0.00',
        cst_cofins: produto.cst_cofins || '',
        aliq_cofins: produto.aliq_cofins != null ? String(produto.aliq_cofins) : '0.00',
        cbenef: produto.cbenef || '',
        exigir_termo_aceite: (produto as any)?.exigir_termo_aceite ?? false,
        texto_termo_aceite: (produto as any)?.texto_termo_aceite ?? '',
      })
      setVariacoes(produto.variacoes || [])
      setGruposOpcionais(produto.grupos_opcionais || [])
      setKitsItens(produto.kits_itens || [])

      const p = produto as any
      if (p.tipo === 'KIT_FESTA') {
        setKitFestaDiasMin(p.kit_festa_dias_antecedencia_min != null ? String(p.kit_festa_dias_antecedencia_min) : '')
        setKitFestaDiasMax(p.kit_festa_dias_antecedencia_max != null ? String(p.kit_festa_dias_antecedencia_max) : '')
        const horarios = Array.isArray(p.kit_festa_horarios) ? p.kit_festa_horarios : []
        setKitFestaHorariosManha(horarios.filter((h: any) => h.periodo === 'MANHA').map((h: any) => ({ inicio: h.inicio || '09:00', fim: h.fim || '09:59' })))
        setKitFestaHorariosTarde(horarios.filter((h: any) => h.periodo === 'TARDE').map((h: any) => ({ inicio: h.inicio || '15:00', fim: h.fim || '15:59' })))
      } else {
        setKitFestaDiasMin('')
        setKitFestaDiasMax('')
        setKitFestaHorariosManha([])
        setKitFestaHorariosTarde([])
      }

      const valores: Record<string, any[]> = {}
      produto.variacoes?.forEach(v => {
        valores[v.id] = v.valores || []
      })
      setValoresVariacao(valores)

      const opcs: Record<string, any[]> = {}
      produto.grupos_opcionais?.forEach(g => {
        opcs[g.id] = g.opcionais || []
      })
      setOpcionais(opcs)
    }
  }, [produto])

  // Carregar dias úteis (datas selecionadas) do mês quando ano/mes mudam
  // Carregar produtos disponíveis quando tipo for kit (KIT, KIT_FESTA, KIT_LANCHE)
  const ehTipoKit = ['KIT', 'KIT_FESTA', 'KIT_LANCHE'].includes(formData.tipo)
  useEffect(() => {
    if (['KIT', 'KIT_FESTA', 'KIT_LANCHE'].includes(formData.tipo) && produto?.id) {
      carregarProdutosDisponiveis()
      carregarKitItens()
    }
  }, [formData.tipo, produto?.id])

  async function carregarProdutosDisponiveis() {
    try {
      const produtos = await listarProdutos(empresaId)
      // Filtrar produtos que não são kits e não são o próprio produto
      const tiposKit = ['KIT', 'KIT_FESTA', 'KIT_LANCHE']
      const produtosFiltrados = produtos.filter(p => 
        !tiposKit.includes(p.tipo) && p.id !== produto?.id && p.ativo
      )
      setProdutosDisponiveis(produtosFiltrados)
    } catch (error) {
      console.error('Erro ao carregar produtos:', error)
    }
  }

  async function carregarKitItens() {
    if (!produto?.id) return
    try {
      const itens = await listarKitItens(produto.id)
      setKitsItens(itens)
    } catch (error) {
      console.error('Erro ao carregar itens do kit:', error)
    }
  }

  async function adicionarKitItem() {
    if (!produto?.id) {
      alert('Erro: Produto não encontrado. Salve o produto primeiro.')
      return
    }
    
    if (!novoKitItem.produto_id) {
      alert('Por favor, selecione um produto')
      return
    }
    
    try {
      console.log('[adicionarKitItem] Adicionando item ao kit:', {
        kitProdutoId: produto.id,
        produtoId: novoKitItem.produto_id,
        quantidade: novoKitItem.quantidade
      })
      
      const item = await criarKitItem(produto.id, novoKitItem.produto_id, novoKitItem.quantidade, kitsItens.length)
      console.log('[adicionarKitItem] Item adicionado com sucesso:', item)
      
      setKitsItens([...kitsItens, item])
      setNovoKitItem({ produto_id: '', quantidade: 1 })
    } catch (error: any) {
      console.error('[adicionarKitItem] Erro completo:', error)
      console.error('[adicionarKitItem] Tipo do erro:', typeof error)
      console.error('[adicionarKitItem] Erro stringificado:', JSON.stringify(error, null, 2))
      
      let errorMessage = 'Erro desconhecido ao adicionar item ao kit'
      if (error?.message) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error?.toString) {
        errorMessage = error.toString()
      } else if (error) {
        try {
          errorMessage = JSON.stringify(error)
        } catch {
          errorMessage = String(error)
        }
      }
      
      alert(errorMessage)
    }
  }

  async function removerKitItem(itemId: string) {
    try {
      await deletarKitItem(itemId)
      setKitsItens(kitsItens.filter(item => item.id !== itemId))
    } catch (error) {
      console.error('Erro ao remover item do kit:', error)
      alert(error instanceof Error ? error.message : 'Erro ao remover item do kit')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (formData.exigir_termo_aceite && !(formData.texto_termo_aceite ?? '').trim()) {
      setErrorForm('Preencha o texto do termo de aceite quando o checkbox estiver ativo.')
      return
    }
    setErrorForm(null)
    setLoading(true)

    try {
      const dados = {
        ...formData,
        preco: parseFloat(formData.preco),
        valor_custo: formData.valor_custo !== '' ? (parseFloat(formData.valor_custo) || null) : null,
        // Com variações, enviar a soma dos estoques das variações para atualizar produto.estoque também
        ...(temVariacoes ? { estoque: estoqueVariacoes } : { estoque: formData.estoque }),
        visibilidade: (formData.visibilidade || 'AMBOS') as ProdutoVisibilidade,
        favorito: formData.favorito ?? false,
        categoria_id: formData.categoria_id === 'none' ? null : (formData.categoria_id || null),
        grupo_id: formData.grupo_id === 'none' ? null : (formData.grupo_id || null),
        sku: formData.sku || null,
        imagem_url: formData.imagem_url || null,
        tipo_kit: formData.tipo === 'KIT_LANCHE' ? (formData.tipo_kit || 'AVULSO') : null,
        desconto_kit_mensal_pct:
          formData.tipo === 'KIT_LANCHE' && formData.tipo_kit === 'MENSAL'
            ? (parseFloat(formData.desconto_kit_mensal_pct || '0') || 0)
            : null,
        unidade: (formData.unidade === 'KG' ? 'KG' : 'UN') as 'UN' | 'KG',
        // Campos fiscais
        ncm: formData.ncm || null,
        cfop: formData.cfop || null,
        unidade_comercial: formData.unidade_comercial || null,
        cst_icms: formData.cst_icms || null,
        csosn: formData.csosn || null,
        icms_origem: formData.icms_origem || null,
        aliq_icms: formData.aliq_icms ? parseFloat(formData.aliq_icms) : null,
        cst_pis: formData.cst_pis || null,
        aliq_pis: formData.aliq_pis ? parseFloat(formData.aliq_pis) : null,
        cst_cofins: formData.cst_cofins || null,
        aliq_cofins: formData.aliq_cofins ? parseFloat(formData.aliq_cofins) : null,
        cbenef: formData.cbenef || null,
        exigir_termo_aceite: formData.exigir_termo_aceite ?? false,
        texto_termo_aceite: formData.exigir_termo_aceite ? (formData.texto_termo_aceite ?? '').trim() || null : null,
        // Kit Festa
        ...(formData.tipo === 'KIT_FESTA'
          ? {
              kit_festa_dias_antecedencia_min: kitFestaDiasMin ? parseInt(kitFestaDiasMin, 10) : null,
              kit_festa_dias_antecedencia_max: kitFestaDiasMax ? parseInt(kitFestaDiasMax, 10) : null,
              kit_festa_horarios: (() => {
                const arr = [
                  ...kitFestaHorariosManha.map((h) => ({ periodo: 'MANHA' as const, inicio: h.inicio, fim: h.fim })),
                  ...kitFestaHorariosTarde.map((h) => ({ periodo: 'TARDE' as const, inicio: h.inicio, fim: h.fim })),
                ]
                return arr.length > 0 ? arr : null
              })(),
            }
          : {
              kit_festa_dias_antecedencia_min: null,
              kit_festa_dias_antecedencia_max: null,
              kit_festa_horarios: null,
            }),
      }

      let produtoId = produto?.id

      // Criar ou atualizar produto
      const produtoSalvo = await onSave(dados)
      produtoId = produtoSalvo.id

      // Helper: valor único e não vazio (evita erro 23505 UNIQUE(variacao_id, valor))
      function valorUnicoParaInsert(valores: any[]) {
        const usados = new Set<string>()
        return valores.map((valor, idx) => {
          let v = (valor.valor ?? '').trim()
          if (!v) v = `Valor ${idx + 1}`
          while (usados.has(v)) {
            v = `${v} (${idx + 1})`
          }
          usados.add(v)
          return { ...valor, valorNormalizado: v }
        })
      }

      // Criar/atualizar variações e valores
      for (const variacao of variacoes) {
        if (!variacao.id && produtoId) {
          // Criar nova variação
          const novaVar = await criarVariacao(produtoId, {
            nome: variacao.nome,
            tipo: variacao.tipo,
            obrigatorio: variacao.obrigatorio,
            ordem: variacao.ordem || 0,
          })
          const valores = valoresVariacao[variacao.tempId || ''] || []
          const valoresUnicos = valorUnicoParaInsert(valores)
          for (let valIdx = 0; valIdx < valoresUnicos.length; valIdx++) {
            const valor = valoresUnicos[valIdx]
            if (!valor.id) {
              await criarVariacaoValor(novaVar.id, {
                valor: valor.valorNormalizado,
                label: (valor.label != null && String(valor.label).trim()) ? String(valor.label).trim() : undefined,
                preco_adicional: valor.preco_adicional ?? 0,
                estoque: valor.estoque,
                ordem: valor.ordem ?? valIdx,
              })
            }
          }
        } else if (variacao.id && produtoId) {
          // Atualizar ordem (e demais campos) da variação
          await atualizarVariacao(variacao.id, { ordem: variacao.ordem ?? 0 })
          // Atualizar valores existentes da variação
          const valores = valoresVariacao[variacao.id] || []
          const valoresUnicos = valorUnicoParaInsert(valores)
          for (let valIdx = 0; valIdx < valoresUnicos.length; valIdx++) {
            const valor = valoresUnicos[valIdx]
            if (valor.id) {
              await atualizarVariacaoValor(valor.id, {
                valor: (valor.valor ?? '').trim() || valor.valorNormalizado,
                label: (valor.label != null && String(valor.label).trim()) ? String(valor.label).trim() : undefined,
                preco_adicional: valor.preco_adicional ?? 0,
                estoque: valor.estoque,
                ordem: valor.ordem ?? valIdx,
              })
            } else {
              await criarVariacaoValor(variacao.id, {
                valor: valor.valorNormalizado,
                label: (valor.label != null && String(valor.label).trim()) ? String(valor.label).trim() : undefined,
                preco_adicional: valor.preco_adicional ?? 0,
                estoque: valor.estoque,
                ordem: valor.ordem ?? valIdx,
              })
            }
          }
        }
      }

      // Criar/atualizar grupos de opcionais e opcionais
      const grupoKey = (g: any) => g.id || g.tempId || ''
      for (const grupo of gruposOpcionais) {
        if (grupo.id && produtoId) {
          await atualizarGrupoOpcional(grupo.id, { ordem: Number(grupo.ordem) ?? 0 })
          const opcs = opcionais[grupoKey(grupo)] || []
          for (const opc of opcs) {
            const nome = String(opc.nome ?? '').trim()
            const preco = Number(opc.preco) || 0
            const ordem = Number(opc.ordem) || 0
            if (opc.id) {
              await atualizarOpcional(opc.id, {
                nome: nome || 'Opcional',
                descricao: opc.descricao ?? null,
                preco,
                estoque: opc.estoque != null && opc.estoque !== '' ? Number(opc.estoque) : null,
                ordem,
              })
            } else {
              await criarOpcional(produtoId, {
                nome: nome || 'Opcional',
                descricao: opc.descricao,
                preco,
                estoque: opc.estoque != null ? Number(opc.estoque) : undefined,
                grupo_id: grupo.id,
                obrigatorio: opc.obrigatorio,
                max_selecoes: opc.max_selecoes,
                ordem,
              })
            }
          }
        }
        if (!grupo.id && produtoId) {
          const novoGrupo = await criarGrupoOpcional(produtoId, {
            nome: grupo.nome,
            descricao: grupo.descricao,
            obrigatorio: grupo.obrigatorio,
            min_selecoes: grupo.min_selecoes || 0,
            max_selecoes: grupo.max_selecoes,
            ordem: Number(grupo.ordem) || 0,
          })
          const opcs = opcionais[grupoKey(grupo)] || []
          for (const opc of opcs) {
            if (!opc.id) {
              await criarOpcional(produtoId, {
                nome: String(opc.nome ?? '').trim() || 'Opcional',
                descricao: opc.descricao,
                preco: Number(opc.preco) || 0,
                estoque: opc.estoque != null && opc.estoque !== '' ? Number(opc.estoque) : undefined,
                grupo_id: novoGrupo.id,
                obrigatorio: opc.obrigatorio,
                max_selecoes: opc.max_selecoes,
                ordem: Number(opc.ordem) || 0,
              })
            }
          }
        }
      }

      onClose()
    } catch (err) {
      console.error('Erro ao salvar:', err)
      alert(err instanceof Error ? err.message : 'Erro ao salvar produto')
    } finally {
      setLoading(false)
    }
  }

  function adicionarVariacao() {
    const tempId = `temp-${Date.now()}`
    const maxOrdem = variacoes.length === 0 ? 0 : Math.max(...variacoes.map((v: any) => v.ordem ?? 0))
    setVariacoes([...variacoes, { ...novaVariacao, ordem: maxOrdem + 1, tempId }])
    setValoresVariacao({ ...valoresVariacao, [tempId]: [] })
    setNovaVariacao({ nome: '', tipo: 'TEXTO', obrigatorio: false })
  }

  function adicionarValorVariacao(variacaoId: string) {
    const valores = valoresVariacao[variacaoId] || []
    const maxOrdem = valores.length === 0 ? 0 : Math.max(...valores.map((v: any) => v.ordem ?? 0))
    setValoresVariacao({
      ...valoresVariacao,
      [variacaoId]: [...valores, { valor: '', preco_adicional: 0, estoque: null, ordem: maxOrdem + 1, tempId: `temp-val-${Date.now()}` }]
    })
  }

  function adicionarGrupoOpcional() {
    const tempId = `temp-grupo-${Date.now()}`
    const maxOrdem = gruposOpcionais.length === 0 ? 0 : Math.max(...gruposOpcionais.map((g: any) => g.ordem ?? 0))
    setGruposOpcionais([...gruposOpcionais, { ...novoGrupoOpcional, ordem: maxOrdem + 1, tempId }])
    setOpcionais({ ...opcionais, [tempId]: [] })
    setNovoGrupoOpcional({ nome: '', obrigatorio: false, min_selecoes: 0, max_selecoes: null })
  }

  function adicionarOpcional(grupoId: string) {
    const opcs = opcionais[grupoId] || []
    const maxOrdem = opcs.length === 0 ? 0 : Math.max(...opcs.map((o: any) => o.ordem ?? 0))
    setOpcionais({
      ...opcionais,
      [grupoId]: [...opcs, { nome: '', preco: 0, estoque: null, ordem: maxOrdem + 1, tempId: `temp-opc-${Date.now()}` }]
    })
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{produto ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          <DialogDescription>
            Preencha os dados do produto. Você pode adicionar variações e opcionais depois.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basico" className="w-full">
            <TabsList className="flex flex-wrap gap-1 h-auto">
              <TabsTrigger value="basico">Básico</TabsTrigger>
              <TabsTrigger value="tributacao">Tributação</TabsTrigger>
              <TabsTrigger value="variacoes">Variações</TabsTrigger>
              <TabsTrigger value="opcionais">Opcionais</TabsTrigger>
              {formData.tipo === 'KIT_LANCHE' && (
                <TabsTrigger value="tipo-kit">Tipo de Kit</TabsTrigger>
              )}
              {formData.tipo === 'KIT_FESTA' && (
                <TabsTrigger value="kit-festa-config">Configurações</TabsTrigger>
              )}
              {formData.tipo === 'KIT' && (
                <TabsTrigger value="kit">Itens do Kit</TabsTrigger>
              )}
              <TabsTrigger value="disponibilidade">Disponibilidade</TabsTrigger>
            </TabsList>

            {/* Aba Básico */}
            <TabsContent value="basico" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tipo">Tipo *</Label>
                  <Select
                    value={PRODUTO_TIPOS.some(t => t.value === formData.tipo) ? formData.tipo : 'PRODUTO'}
                    onValueChange={(v) => setFormData({ ...formData, tipo: v as ProdutoTipo })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      {PRODUTO_TIPOS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="categoria">Categoria</Label>
                  <Select 
                    value={formData.categoria_id || 'none'} 
                    onValueChange={(v) => setFormData({ ...formData, categoria_id: v === 'none' ? 'none' : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categorias.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="unidade">Unidade</Label>
                  <Select
                    value={formData.unidade === 'KG' ? 'KG' : 'UN'}
                    onValueChange={(v) => setFormData({ ...formData, unidade: v as 'UN' | 'KG' })}
                  >
                    <SelectTrigger id="unidade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UN">Unitário (un)</SelectItem>
                      <SelectItem value="KG">Kilograma (kg)</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.unidade === 'KG' && (
                    <p className="text-xs text-muted-foreground mt-1">Preço é por kg. No PDV o operador informa as gramas.</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="preco">Preço * {formData.unidade === 'KG' && '(por kg)'}</Label>
                  <Input
                    id="preco"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.preco}
                    onChange={(e) => setFormData({ ...formData, preco: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="valor_custo">Valor de Custo (R$)</Label>
                  <Input
                    id="valor_custo"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={formData.valor_custo}
                    onChange={(e) => setFormData({ ...formData, valor_custo: e.target.value })}
                  />
                </div>

                {!['SERVICO'].includes(formData.tipo) && (
                  <div>
                    {temVariacoes ? (
                      <>
                        <Label>Estoque (variações)</Label>
                        <Input
                          id="estoque"
                          type="number"
                          min="0"
                          value={estoqueVariacoes}
                          disabled
                          className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          O estoque é definido por valor na aba Variações. Remova todas as variações para editar o estoque aqui.
                        </p>
                      </>
                    ) : (
                      <>
                        <Label htmlFor="estoque">Estoque</Label>
                        <Input
                          id="estoque"
                          type="number"
                          min="0"
                          value={formData.estoque}
                          onChange={(e) => setFormData({ ...formData, estoque: parseInt(e.target.value) || 0 })}
                        />
                      </>
                    )}
                  </div>
                )}

                <div>
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="favorito"
                  checked={formData.favorito}
                  onChange={(e) => setFormData({ ...formData, favorito: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="favorito" className="cursor-pointer font-normal">
                  Favoritar produto (destacado no PDV)
                </Label>
              </div>

              {/* Upload de Imagem */}
              <div>
                <Label htmlFor="imagem">Imagem do Produto</Label>
                <div className="space-y-3">
                  {imagePreview && (
                    <div className="relative w-full max-w-xs">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-lg border"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={async () => {
                          if (formData.imagem_url && formData.imagem_url.includes('supabase.co/storage')) {
                            try {
                              await deletarImagem(formData.imagem_url, 'produtos')
                            } catch (err) {
                              console.error('Erro ao deletar imagem:', err)
                            }
                          }
                          setFormData({ ...formData, imagem_url: '' })
                          setImagePreview(null)
                          if (fileInputRef.current) {
                            fileInputRef.current.value = ''
                          }
                        }}
                      >
                        ✕
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      id="imagem"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return

                        try {
                          setUploadingImage(true)
                          const url = await uploadImagem(file, 'produtos', `empresa-${empresaId}`)

                          if (formData.imagem_url && formData.imagem_url.includes('supabase.co/storage')) {
                            await deletarImagem(formData.imagem_url, 'produtos')
                          }

                          setFormData(prev => ({ ...prev, imagem_url: url }))
                          setImagePreview(url)
                        } catch (err) {
                          console.error('Erro ao fazer upload:', err)
                          alert(err instanceof Error ? err.message : 'Erro ao fazer upload da imagem. Tente novamente.')
                        } finally {
                          setUploadingImage(false)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? 'Enviando...' : imagePreview ? 'Alterar Imagem' : 'Selecionar Imagem'}
                    </Button>
                    {!imagePreview && (
                      <div className="flex-1">
                        <Input
                          type="url"
                          placeholder="Ou cole a URL da imagem"
                          value={formData.imagem_url}
                          onChange={(e) => {
                            setFormData({ ...formData, imagem_url: e.target.value })
                            setImagePreview(e.target.value || null)
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: JPG, PNG, WebP, GIF. Tamanho máximo: 5MB
                  </p>
                </div>
              </div>


              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="grupo">Grupo</Label>
                  <Select 
                    value={formData.grupo_id || 'none'} 
                    onValueChange={(v) => setFormData({ ...formData, grupo_id: v === 'none' ? 'none' : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem grupo</SelectItem>
                      {grupos.map(grupo => (
                        <SelectItem key={grupo.id} value={grupo.id}>{grupo.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ordem">Ordem</Label>
                  <Input
                    id="ordem"
                    type="number"
                    value={formData.ordem}
                    onChange={(e) => setFormData({ ...formData, ordem: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="compra_unica"
                    checked={formData.compra_unica}
                    onChange={(e) => setFormData({ ...formData, compra_unica: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="compra_unica">Compra única</Label>
                </div>

                {formData.compra_unica && (
                  <div>
                    <Label htmlFor="limite_max">Limite máximo de compra única</Label>
                    <Input
                      id="limite_max"
                      type="number"
                      min="1"
                      value={formData.limite_max_compra_unica}
                      onChange={(e) => setFormData({ ...formData, limite_max_compra_unica: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="permitir_pix"
                    checked={formData.permitir_pix}
                    onChange={(e) => setFormData({ ...formData, permitir_pix: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="permitir_pix">Permitir PIX</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="permitir_cartao"
                    checked={formData.permitir_cartao}
                    onChange={(e) => setFormData({ ...formData, permitir_cartao: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="permitir_cartao">Permitir Cartão</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="exigir_termo_aceite"
                    checked={formData.exigir_termo_aceite ?? false}
                    onChange={(e) => setFormData({ ...formData, exigir_termo_aceite: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="exigir_termo_aceite">Exigir termo de aceite</Label>
                </div>
                {formData.exigir_termo_aceite && (
                  <div className="space-y-2">
                    <Label htmlFor="texto_termo_aceite">Texto do termo de aceite *</Label>
                    <Textarea
                      id="texto_termo_aceite"
                      value={formData.texto_termo_aceite ?? ''}
                      onChange={(e) => setFormData({ ...formData, texto_termo_aceite: e.target.value })}
                      placeholder="Digite o texto do termo (quebras de linha serão preservadas)"
                      rows={6}
                      className="resize-y min-h-[120px]"
                    />
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="ativo"
                    checked={formData.ativo}
                    onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="ativo">Ativo</Label>
                </div>
              </div>
            </TabsContent>

            {/* Aba Tributação */}
            <TabsContent value="tributacao" className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <span className="text-blue-600 text-lg">ℹ️</span>
                  <div className="flex-1">
                    <p className="text-sm text-blue-900">
                      <strong>Dados Tributários (NF-e):</strong> Estes campos são usados na emissão de notas fiscais de produtos. 
                      Se não preenchidos, serão usados valores padrão (isento/zero para MEI).
                    </p>
                  </div>
                </div>
              </div>

              {/* Campos obrigatórios para NF-e */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Campos Obrigatórios para NF-e</h3>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="ncm">
                      NCM <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="ncm"
                      value={formData.ncm}
                      onChange={(e) => setFormData({ ...formData, ncm: e.target.value })}
                      placeholder="49019900"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Código NCM - Classificação fiscal do produto
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="cfop">
                      CFOP <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="cfop"
                      value={formData.cfop}
                      onChange={(e) => setFormData({ ...formData, cfop: e.target.value })}
                      placeholder="5102"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Código Fiscal de Operações - Padrão: 5102 (venda no mesmo estado)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="unidade_comercial">
                      Unidade Comercial <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="unidade_comercial"
                      value={formData.unidade_comercial}
                      onChange={(e) => setFormData({ ...formData, unidade_comercial: e.target.value })}
                      placeholder="UN"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Unidade de medida para NFe - Padrão: UN
                    </p>
                  </div>
                </div>
              </div>

              {/* Dados Tributários */}
              <div className="space-y-4 mt-6">
                <h3 className="text-lg font-semibold">Dados Tributários (NF-e)</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Coluna Esquerda */}
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="cst_icms">CST ICMS</Label>
                      <Select
                        value={formData.cst_icms}
                        onValueChange={(v) => setFormData({ ...formData, cst_icms: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o CST ICMS" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="00">00 - Tributada integralmente</SelectItem>
                          <SelectItem value="10">10 - Tributada e com cobrança do ICMS por substituição tributária</SelectItem>
                          <SelectItem value="20">20 - Com redução de base de cálculo</SelectItem>
                          <SelectItem value="30">30 - Isenta ou não tributada e com cobrança do ICMS por substituição tributária</SelectItem>
                          <SelectItem value="40">40 - Isenta</SelectItem>
                          <SelectItem value="41">41 - Não tributada</SelectItem>
                          <SelectItem value="50">50 - Suspensa</SelectItem>
                          <SelectItem value="51">51 - Diferimento</SelectItem>
                          <SelectItem value="60">60 - ICMS cobrado anteriormente por substituição tributária</SelectItem>
                          <SelectItem value="70">70 - Com redução de base de cálculo e cobrança do ICMS por substituição tributária</SelectItem>
                          <SelectItem value="90">90 - Outras</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Código de Situação Tributária do ICMS (Regime Normal)
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="cst_pis">CST Pis</Label>
                      <Select
                        value={formData.cst_pis}
                        onValueChange={(v) => setFormData({ ...formData, cst_pis: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o CST PIS" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="01">01 - Operação Tributável (base de cálculo = valor da operação alíquota normal)</SelectItem>
                          <SelectItem value="02">02 - Operação Tributável (base de cálculo = valor da operação alíquota diferenciada)</SelectItem>
                          <SelectItem value="03">03 - Operação Tributável (base de cálculo = quantidade vendida x alíquota por unidade)</SelectItem>
                          <SelectItem value="04">04 - Operação Tributável (tributação monofásica alíquota zero)</SelectItem>
                          <SelectItem value="05">05 - Operação Tributável (Substituição Tributária)</SelectItem>
                          <SelectItem value="06">06 - Operação Tributável a Alíquota Zero</SelectItem>
                          <SelectItem value="07">07 - Operação Isenta da Contribuição</SelectItem>
                          <SelectItem value="08">08 - Operação Sem Incidência da Contribuição</SelectItem>
                          <SelectItem value="09">09 - Operação com Suspensão da Contribuição</SelectItem>
                          <SelectItem value="49">49 - Outras Operações de Saída</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Código de Situação Tributária do PIS
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="cst_cofins">CST Cofins</Label>
                      <Select
                        value={formData.cst_cofins}
                        onValueChange={(v) => setFormData({ ...formData, cst_cofins: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o CST COFINS" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="01">01 - Operação Tributável (base de cálculo = valor da operação alíquota normal)</SelectItem>
                          <SelectItem value="02">02 - Operação Tributável (base de cálculo = valor da operação alíquota diferenciada)</SelectItem>
                          <SelectItem value="03">03 - Operação Tributável (base de cálculo = quantidade vendida x alíquota por unidade)</SelectItem>
                          <SelectItem value="04">04 - Operação Tributável (tributação monofásica alíquota zero)</SelectItem>
                          <SelectItem value="05">05 - Operação Tributável (Substituição Tributária)</SelectItem>
                          <SelectItem value="06">06 - Operação Tributável a Alíquota Zero</SelectItem>
                          <SelectItem value="07">07 - Operação Isenta da Contribuição</SelectItem>
                          <SelectItem value="08">08 - Operação Sem Incidência da Contribuição</SelectItem>
                          <SelectItem value="09">09 - Operação com Suspensão da Contribuição</SelectItem>
                          <SelectItem value="49">49 - Outras Operações de Saída</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Código de Situação Tributária do COFINS
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="cbenef">Código de Benefício Fiscal (cBenef)</Label>
                      <Input
                        id="cbenef"
                        value={formData.cbenef}
                        onChange={(e) => setFormData({ ...formData, cbenef: e.target.value })}
                        placeholder="SP070130"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Obrigatório quando ICMS situação tributária for 400 (Isenta/Imune) ou 40 (Isenta) ou 41 (Não Incidência). 
                        Exemplo: SP070130 para livros em São Paulo. Consulte a tabela de códigos de benefício fiscal da SEFAZ do seu estado.
                      </p>
                    </div>
                  </div>

                  {/* Coluna Direita */}
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="csosn">CSOSN</Label>
                      <Select
                        value={formData.csosn}
                        onValueChange={(v) => setFormData({ ...formData, csosn: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o CSOSN" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="101">101 - Tributada pelo Simples Nacional com permissão de crédito</SelectItem>
                          <SelectItem value="102">102 - Tributada pelo Simples Nacional sem permissão de crédito</SelectItem>
                          <SelectItem value="103">103 - Isenção do ICMS no Simples Nacional para faixa de receita bruta</SelectItem>
                          <SelectItem value="201">201 - Tributada pelo Simples Nacional com permissão de crédito e com cobrança do ICMS por substituição tributária</SelectItem>
                          <SelectItem value="202">202 - Tributada pelo Simples Nacional sem permissão de crédito e com cobrança do ICMS por substituição tributária</SelectItem>
                          <SelectItem value="203">203 - Isenção do ICMS no Simples Nacional para faixa de receita bruta e com cobrança do ICMS por substituição tributária</SelectItem>
                          <SelectItem value="300">300 - Imune</SelectItem>
                          <SelectItem value="400">400 - Não tributada pelo Simples Nacional</SelectItem>
                          <SelectItem value="500">500 - ICMS cobrado anteriormente por substituição tributária (substituído) ou por antecipação</SelectItem>
                          <SelectItem value="900">900 - Outros</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Código de Situação da Operação no Simples Nacional
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="icms_origem">ICMS - Origem</Label>
                      <Select
                        value={formData.icms_origem}
                        onValueChange={(v) => setFormData({ ...formData, icms_origem: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a origem" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 - Nacional</SelectItem>
                          <SelectItem value="1">1 - Estrangeira - Importação direta</SelectItem>
                          <SelectItem value="2">2 - Estrangeira - Adquirida no mercado interno</SelectItem>
                          <SelectItem value="3">3 - Nacional - Mercadoria ou bem com conteúdo de importação superior a 40%</SelectItem>
                          <SelectItem value="4">4 - Nacional - Produção em conformidade com processos produtivos básicos</SelectItem>
                          <SelectItem value="5">5 - Nacional - Mercadoria ou bem com conteúdo de importação inferior ou igual a 40%</SelectItem>
                          <SelectItem value="6">6 - Estrangeira - Importação direta, sem similar nacional</SelectItem>
                          <SelectItem value="7">7 - Estrangeira - Adquirida no mercado interno, sem similar nacional</SelectItem>
                          <SelectItem value="8">8 - Nacional - Mercadoria ou bem com conteúdo de importação superior a 70%</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Origem da mercadoria
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="aliq_icms">Alíq. ICMS (%)</Label>
                      <Input
                        id="aliq_icms"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.aliq_icms}
                        onChange={(e) => setFormData({ ...formData, aliq_icms: e.target.value })}
                        placeholder="0.00"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Alíquota do ICMS (%)
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="aliq_pis">Alíq. Pis (%)</Label>
                      <Input
                        id="aliq_pis"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.aliq_pis}
                        onChange={(e) => setFormData({ ...formData, aliq_pis: e.target.value })}
                        placeholder="0.00"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Alíquota do PIS (%)
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="aliq_cofins">Alíq. Cofins (%)</Label>
                      <Input
                        id="aliq_cofins"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.aliq_cofins}
                        onChange={(e) => setFormData({ ...formData, aliq_cofins: e.target.value })}
                        placeholder="0.00"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Alíquota do COFINS (%)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Aba Variações */}
            <TabsContent value="variacoes" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Nova Variação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Nome da Variação</Label>
                      <Input
                        value={novaVariacao.nome}
                        onChange={(e) => setNovaVariacao({ ...novaVariacao, nome: e.target.value })}
                        placeholder="ex: Tamanho, Cor"
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select value={novaVariacao.tipo} onValueChange={(v: any) => setNovaVariacao({ ...novaVariacao, tipo: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TEXTO">Texto</SelectItem>
                          <SelectItem value="NUMERO">Número</SelectItem>
                          <SelectItem value="COR">Cor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button type="button" onClick={adicionarVariacao} disabled={!novaVariacao.nome}>
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {[...variacoes]
                .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999))
                .map((variacao, idx) => (
                <Card key={variacao.id || variacao.tempId}>
                  <CardHeader className="flex flex-row items-center gap-4">
                    <div className="w-20 shrink-0">
                      <Label className="text-muted-foreground text-xs">Ordem</Label>
                      <Input
                        type="number"
                        min={1}
                        value={variacao.ordem ?? idx + 1}
                        onChange={(e) => {
                          const num = parseInt(e.target.value, 10)
                          const idKey = variacao.id || variacao.tempId
                          const idxOrig = variacoes.findIndex((v: any) => (v.id || v.tempId) === idKey)
                          if (idxOrig === -1) return
                          const novo = [...variacoes]
                          novo[idxOrig] = { ...novo[idxOrig], ordem: isNaN(num) ? 0 : num }
                          novo.sort((a: any, b: any) => (a.ordem ?? 999) - (b.ordem ?? 999))
                          setVariacoes(novo)
                        }}
                      />
                    </div>
                    <CardTitle className="mb-0">{variacao.nome} ({variacao.tipo})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {[...(valoresVariacao[variacao.id || variacao.tempId] || [])]
                        .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999))
                        .map((valor, valIdx) => {
                          const key = variacao.id || variacao.tempId
                          const lista = valoresVariacao[key] || []
                          const idxOrig = lista.findIndex((v: any) => (v.id || v.tempId) === (valor.id || valor.tempId))
                          return (
                            <div key={valor.id || valor.tempId} className="flex gap-2 items-end">
                              <div className="w-20">
                                <Label>Ordem</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={valor.ordem ?? valIdx + 1}
                                  onChange={(e) => {
                                    const novosValores = [...lista]
                                    const num = parseInt(e.target.value, 10)
                                    novosValores[idxOrig] = { ...novosValores[idxOrig], ordem: isNaN(num) ? 0 : num }
                                    novosValores.sort((a: any, b: any) => (a.ordem ?? 999) - (b.ordem ?? 999))
                                    setValoresVariacao({ ...valoresVariacao, [key]: novosValores })
                                  }}
                                />
                              </div>
                              <div className="flex-1">
                                <Label>Valor</Label>
                                <Input
                                  value={valor.valor}
                                  onChange={(e) => {
                                    const novosValores = [...lista]
                                    novosValores[idxOrig] = { ...novosValores[idxOrig], valor: e.target.value }
                                    setValoresVariacao({ ...valoresVariacao, [key]: novosValores })
                                  }}
                                  placeholder="ex: P, M, G"
                                />
                              </div>
                              <div className="flex-1">
                                <Label title="Exibido na loja e no PDV">Nome na loja/PDV</Label>
                                <Input
                                  value={valor.label ?? ''}
                                  onChange={(e) => {
                                    const novosValores = [...lista]
                                    novosValores[idxOrig] = { ...novosValores[idxOrig], label: e.target.value }
                                    setValoresVariacao({ ...valoresVariacao, [key]: novosValores })
                                  }}
                                  placeholder="ex: Coca-Cola, Fanta (deixe vazio = usa Valor)"
                                />
                              </div>
                              <div className="w-32">
                                <Label>Preço Adicional</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={valor.preco_adicional ?? 0}
                                  onChange={(e) => {
                                    const novosValores = [...lista]
                                    const novoValor = e.target.value === '' ? 0 : parseFloat(e.target.value)
                                    novosValores[idxOrig] = { ...novosValores[idxOrig], preco_adicional: isNaN(novoValor) ? 0 : novoValor }
                                    setValoresVariacao({ ...valoresVariacao, [key]: novosValores })
                                  }}
                                />
                              </div>
                              <div className="w-28">
                                <Label>Estoque</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={valor.estoque ?? ''}
                                  onChange={(e) => {
                                    const novosValores = [...lista]
                                    const novoEstoque = e.target.value === '' ? null : parseInt(e.target.value, 10)
                                    novosValores[idxOrig] = { ...novosValores[idxOrig], estoque: isNaN(novoEstoque as any) ? null : novoEstoque }
                                    setValoresVariacao({ ...valoresVariacao, [key]: novosValores })
                                  }}
                                  placeholder="ex: 10"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  const novosValores = lista.filter((_: any, i: number) => i !== idxOrig)
                                  setValoresVariacao({ ...valoresVariacao, [key]: novosValores })
                                }}
                              >
                                Remover
                              </Button>
                            </div>
                          )
                        })}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => adicionarValorVariacao(variacao.id || variacao.tempId)}
                      >
                        + Adicionar Valor
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const idKey = variacao.id || variacao.tempId
                        setVariacoes(variacoes.filter((v: any) => (v.id || v.tempId) !== idKey))
                        const novosValores = { ...valoresVariacao }
                        delete novosValores[idKey]
                        setValoresVariacao(novosValores)
                      }}
                    >
                      Remover Variação
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* Aba Opcionais */}
            <TabsContent value="opcionais" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Novo Grupo de Opcionais</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label>Nome do Grupo</Label>
                      <Input
                        value={novoGrupoOpcional.nome}
                        onChange={(e) => setNovoGrupoOpcional({ ...novoGrupoOpcional, nome: e.target.value })}
                        placeholder="ex: Adicionais, Bebidas"
                      />
                    </div>
                    <div>
                      <Label>Min Seleções</Label>
                      <Input
                        type="number"
                        min="0"
                        value={novoGrupoOpcional.min_selecoes}
                        onChange={(e) => setNovoGrupoOpcional({ ...novoGrupoOpcional, min_selecoes: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label>Max Seleções</Label>
                      <Input
                        type="number"
                        min="1"
                        value={novoGrupoOpcional.max_selecoes || ''}
                        onChange={(e) => setNovoGrupoOpcional({ ...novoGrupoOpcional, max_selecoes: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="Ilimitado"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="button" onClick={adicionarGrupoOpcional} disabled={!novoGrupoOpcional.nome}>
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {[...gruposOpcionais]
                .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999))
                .map((grupo, idx) => (
                <Card key={grupo.id || grupo.tempId}>
                  <CardHeader className="flex flex-row items-center gap-4">
                    <div className="w-20 shrink-0">
                      <Label className="text-muted-foreground text-xs">Ordem</Label>
                      <Input
                        type="number"
                        min={1}
                        value={grupo.ordem ?? idx + 1}
                        onChange={(e) => {
                          const num = parseInt(e.target.value, 10)
                          const idKey = grupo.id || grupo.tempId
                          const idxOrig = gruposOpcionais.findIndex((g: any) => (g.id || g.tempId) === idKey)
                          if (idxOrig === -1) return
                          const novo = [...gruposOpcionais]
                          novo[idxOrig] = { ...novo[idxOrig], ordem: isNaN(num) ? 0 : num }
                          novo.sort((a: any, b: any) => (a.ordem ?? 999) - (b.ordem ?? 999))
                          setGruposOpcionais(novo)
                        }}
                      />
                    </div>
                    <div>
                      <CardTitle className="mb-0">{grupo.nome}</CardTitle>
                      <CardDescription>
                        Min: {grupo.min_selecoes} | Max: {grupo.max_selecoes || 'Ilimitado'}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {[...(opcionais[grupo.id || grupo.tempId] || [])]
                        .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999))
                        .map((opc, opcIdx) => {
                          const key = grupo.id || grupo.tempId
                          const lista = opcionais[key] || []
                          const idxOrig = lista.findIndex((o: any) => (o.id || o.tempId) === (opc.id || opc.tempId))
                          return (
                            <div key={opc.id || opc.tempId} className="flex gap-2 items-end">
                              <div className="w-20">
                                <Label>Ordem</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={opc.ordem ?? opcIdx + 1}
                                  onChange={(e) => {
                                    const novosOpcionais = [...lista]
                                    const num = parseInt(e.target.value, 10)
                                    novosOpcionais[idxOrig] = { ...novosOpcionais[idxOrig], ordem: isNaN(num) ? 0 : num }
                                    novosOpcionais.sort((a: any, b: any) => (a.ordem ?? 999) - (b.ordem ?? 999))
                                    setOpcionais({ ...opcionais, [key]: novosOpcionais })
                                  }}
                                />
                              </div>
                              <div className="flex-1">
                                <Label>Nome</Label>
                                <Input
                                  value={opc.nome}
                                  onChange={(e) => {
                                    const novosOpcionais = [...lista]
                                    novosOpcionais[idxOrig] = { ...novosOpcionais[idxOrig], nome: e.target.value }
                                    setOpcionais({ ...opcionais, [key]: novosOpcionais })
                                  }}
                                  placeholder="ex: Queijo Extra"
                                />
                              </div>
                              <div className="w-32">
                                <Label>Preço</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={opc.preco || 0}
                                  onChange={(e) => {
                                    const novosOpcionais = [...lista]
                                    novosOpcionais[idxOrig] = { ...novosOpcionais[idxOrig], preco: parseFloat(e.target.value) || 0 }
                                    setOpcionais({ ...opcionais, [key]: novosOpcionais })
                                  }}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  const novosOpcionais = lista.filter((_: any, i: number) => i !== idxOrig)
                                  setOpcionais({ ...opcionais, [key]: novosOpcionais })
                                }}
                              >
                                Remover
                              </Button>
                            </div>
                          )
                        })}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => adicionarOpcional(grupo.id || grupo.tempId)}
                      >
                        + Adicionar Opcional
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const idKey = grupo.id || grupo.tempId
                        setGruposOpcionais(gruposOpcionais.filter((g: any) => (g.id || g.tempId) !== idKey))
                        const novosOpcionais = { ...opcionais }
                        delete novosOpcionais[idKey]
                        setOpcionais(novosOpcionais)
                      }}
                    >
                      Remover Grupo
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* Aba Tipo de Kit (apenas para Kit Lanche) */}
            {formData.tipo === 'KIT_LANCHE' && (
              <TabsContent value="tipo-kit" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Tipo de Kit Lanche</CardTitle>
                    <CardDescription>
                      Defina se o kit lanche é mensal (assinatura/recorrente) ou avulso (compra única)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Tipo *</Label>
                      <Select
                        value={formData.tipo_kit || 'AVULSO'}
                        onValueChange={(v) => setFormData({ ...formData, tipo_kit: v as 'MENSAL' | 'AVULSO' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MENSAL">Mensal</SelectItem>
                          <SelectItem value="AVULSO">Avulso</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Mensal: kit recorrente por mês (valor × dias úteis do mês com desconto). Avulso: compra por dias selecionados no calendário.
                      </p>
                    </div>
                    {formData.tipo_kit === 'MENSAL' && (
                      <div>
                        <Label>Desconto para Kit Mensal (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={formData.desconto_kit_mensal_pct}
                          onChange={(e) => setFormData({ ...formData, desconto_kit_mensal_pct: e.target.value })}
                          placeholder="Ex: 10"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Percentual de desconto aplicado ao total (preço × dias úteis do mês). Os dias úteis são definidos em Admin &gt; Calendário.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Aba Configurações (Kit Festa) */}
            {formData.tipo === 'KIT_FESTA' && (
              <TabsContent value="kit-festa-config" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Antecedência de compra</CardTitle>
                    <CardDescription>
                      Quantos dias de antecedência o cliente pode comprar (mínimo e máximo).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Mínimo de dias</Label>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={kitFestaDiasMin}
                          onChange={(e) => setKitFestaDiasMin(e.target.value)}
                          placeholder="Ex: 10"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Ex.: 10 = só pode comprar com no mínimo 10 dias de antecedência</p>
                      </div>
                      <div>
                        <Label>Máximo de dias</Label>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={kitFestaDiasMax}
                          onChange={(e) => setKitFestaDiasMax(e.target.value)}
                          placeholder="Ex: 60"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Ex.: 60 = pode comprar até 60 dias antes</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Horários disponíveis por período</CardTitle>
                    <CardDescription>
                      Defina os horários em que o kit festa pode ser retirado (ex.: 09:00 às 09:59 para manhã).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h4 className="font-medium mb-2">Manhã</h4>
                      <ul className="space-y-2">
                        {kitFestaHorariosManha.length === 0 && (
                          <li className="text-sm text-muted-foreground">Nenhum horário. Adicione abaixo.</li>
                        )}
                        {kitFestaHorariosManha.map((h, i) => (
                          <li key={`manha-${i}`} className="flex items-center gap-2">
                            <Input type="time" value={h.inicio} onChange={(e) => {
                              const nova = [...kitFestaHorariosManha]
                              nova[i] = { ...nova[i], inicio: e.target.value }
                              setKitFestaHorariosManha(nova)
                            }} className="w-28" />
                            <span className="text-muted-foreground">até</span>
                            <Input type="time" value={h.fim} onChange={(e) => {
                              const nova = [...kitFestaHorariosManha]
                              nova[i] = { ...nova[i], fim: e.target.value }
                              setKitFestaHorariosManha(nova)
                            }} className="w-28" />
                            <Button type="button" variant="ghost" size="sm" onClick={() => setKitFestaHorariosManha(kitFestaHorariosManha.filter((_, j) => j !== i))}>
                              Remover
                            </Button>
                          </li>
                        ))}
                        <li>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setKitFestaHorariosManha([...kitFestaHorariosManha, { inicio: '09:00', fim: '09:59' }])}
                          >
                            Adicionar horário (manhã)
                          </Button>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Tarde</h4>
                      <ul className="space-y-2">
                        {kitFestaHorariosTarde.length === 0 && (
                          <li className="text-sm text-muted-foreground">Nenhum horário. Adicione abaixo.</li>
                        )}
                        {kitFestaHorariosTarde.map((h, i) => (
                          <li key={`tarde-${i}`} className="flex items-center gap-2">
                            <Input type="time" value={h.inicio} onChange={(e) => {
                              const nova = [...kitFestaHorariosTarde]
                              nova[i] = { ...nova[i], inicio: e.target.value }
                              setKitFestaHorariosTarde(nova)
                            }} className="w-28" />
                            <span className="text-muted-foreground">até</span>
                            <Input type="time" value={h.fim} onChange={(e) => {
                              const nova = [...kitFestaHorariosTarde]
                              nova[i] = { ...nova[i], fim: e.target.value }
                              setKitFestaHorariosTarde(nova)
                            }} className="w-28" />
                            <Button type="button" variant="ghost" size="sm" onClick={() => setKitFestaHorariosTarde(kitFestaHorariosTarde.filter((_, j) => j !== i))}>
                              Remover
                            </Button>
                          </li>
                        ))}
                        <li>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setKitFestaHorariosTarde([...kitFestaHorariosTarde, { inicio: '15:00', fim: '15:59' }])}
                          >
                            Adicionar horário (tarde)
                          </Button>
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Aba Itens do Kit - somente quando tipo é exatamente Kit */}
            {formData.tipo === 'KIT' && (
              <TabsContent value="kit" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Produtos que compõem o Kit</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Adicione os produtos que fazem parte deste kit. Na emissão da nota fiscal, o kit será expandido para os produtos individuais.
                    </p>
                    
                    {/* Formulário para adicionar item */}
                    {produto?.id ? (
                      <Card className="p-4 mb-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2">
                            <Label>Produto</Label>
                            <Select
                              value={novoKitItem.produto_id}
                              onValueChange={(v) => setNovoKitItem({ ...novoKitItem, produto_id: v })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um produto" />
                              </SelectTrigger>
                              <SelectContent>
                                {produtosDisponiveis
                                  .filter(p => !kitsItens.some(ki => ki.produto_id === p.id))
                                  .map(prod => (
                                    <SelectItem key={prod.id} value={prod.id}>
                                      {prod.nome} - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(prod.preco))}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Quantidade</Label>
                            <Input
                              type="number"
                              min="1"
                              value={novoKitItem.quantidade}
                              onChange={(e) => setNovoKitItem({ ...novoKitItem, quantidade: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          onClick={adicionarKitItem}
                          disabled={!novoKitItem.produto_id}
                          className="mt-4"
                        >
                          Adicionar ao Kit
                        </Button>
                      </Card>
                    ) : (
                      <Card className="p-4 mb-4 bg-muted">
                        <p className="text-sm text-muted-foreground">
                          Salve o produto primeiro para adicionar itens ao kit.
                        </p>
                      </Card>
                    )}

                    {/* Lista de itens do kit */}
                    {kitsItens.length === 0 ? (
                      <Card className="p-8 text-center">
                        <p className="text-muted-foreground">Nenhum produto adicionado ao kit ainda.</p>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {kitsItens.map((item) => (
                          <Card key={item.id} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h4 className="font-semibold">
                                  {(item.produto as any)?.nome || 'Produto não encontrado'}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  Quantidade: {item.quantidade} | 
                                  Preço unitário: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number((item.produto as any)?.preco || 0))}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => removerKitItem(item.id)}
                              >
                                Remover
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* Aba Disponibilidade */}
            <TabsContent value="disponibilidade" className="space-y-4">
              <div className="space-y-2">
                <Label>Onde este produto ficará à mostra?</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {VISIBILIDADES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, visibilidade: opt.value })}
                      className={[
                        'border rounded-md px-3 py-2 text-left text-sm transition-colors',
                        formData.visibilidade === opt.value
                          ? 'border-primary bg-primary/5'
                          : 'border-input hover:bg-muted',
                      ].join(' ')}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.descricao}</div>
                    </button>
                  ))}
                </div>
              </div>

              <DisponibilidadeManager 
                produtoId={produto?.id}
                empresaId={empresaId}
                disponibilidades={produto?.disponibilidades || []}
              />
            </TabsContent>
          </Tabs>

          {errorForm && (
            <p className="text-sm text-destructive mt-2">{errorForm}</p>
          )}
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
