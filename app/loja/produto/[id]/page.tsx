'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { obterProdutoCompleto, getAlunosComAcessoAoProduto } from '@/app/actions/produtos'
import { getAlunosDoResponsavel } from '@/app/actions/responsavel'
import { salvarCarrinho, carregarCarrinho, type ItemCarrinho } from '@/lib/carrinho'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { LojaHeader } from '@/components/loja/header'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Link from 'next/link'
import type { ProdutoCompleto } from '@/lib/types/database'
import type { Aluno } from '@/lib/types/database'
import { ArrowLeft, ShoppingCart, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CalendarioDiasUteis } from '@/components/loja/calendario-dias-uteis'
import { obterDiasUteis } from '@/app/actions/dias-uteis'
import { listarDatasDisponiveisKitFesta, getHorariosDisponiveisKitFesta } from '@/app/actions/kit-festa'

/** Nome para exibir: mesma regra do PDV — valor primeiro, depois label. */
function nomeVariacaoValor(valor: { label?: string | null; valor?: string | null }): string {
  const v = (valor?.valor ?? '').trim()
  if (v !== '') return v
  const l = (valor?.label ?? '').trim()
  return l !== '' ? l : 'Opção'
}

export default function ProdutoDetalhesPage() {
  const router = useRouter()
  const params = useParams()
  const produtoId = params.id as string

  const [produto, setProduto] = useState<ProdutoCompleto | null>(null)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [alunoIdsComAcesso, setAlunoIdsComAcesso] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estados para seleções
  const [variacoesSelecionadas, setVariacoesSelecionadas] = useState<Record<string, string>>({})
  const [opcionaisSelecionados, setOpcionaisSelecionados] = useState<Record<string, number>>({}) // opcional_id -> quantidade
  const [alunoSelecionado, setAlunoSelecionado] = useState<string>('')
  const [quantidade, setQuantidade] = useState(1)
  const [diasSelecionados, setDiasSelecionados] = useState<string[]>([])
  // Kit Lanche MENSAL: mês/ano e dias úteis carregados
  const [mesReferencia, setMesReferencia] = useState<number>(() => new Date().getMonth() + 1)
  const [anoReferencia, setAnoReferencia] = useState<number>(() => new Date().getFullYear())
  const [diasUteisMes, setDiasUteisMes] = useState<number>(0)
  const [carregandoDiasUteis, setCarregandoDiasUteis] = useState(false)
  const [diasUteisProximoMes, setDiasUteisProximoMes] = useState<number>(0)

  // Kit Festa: fluxo Aluno → Data → Horário (com validação Google Agenda)
  const [kitFestaData, setKitFestaData] = useState<string>('')
  const [kitFestaHorario, setKitFestaHorario] = useState<{ inicio: string; fim: string } | null>(null)
  const [kitFestaDatasDisponiveis, setKitFestaDatasDisponiveis] = useState<string[]>([])
  const [kitFestaHorariosDisponiveis, setKitFestaHorariosDisponiveis] = useState<Array<{ inicio: string; fim: string }>>([])
  const [kitFestaErroAgenda, setKitFestaErroAgenda] = useState<string | null>(null)
  const [kitFestaCarregandoDatas, setKitFestaCarregandoDatas] = useState(false)
  const [kitFestaCarregandoHorarios, setKitFestaCarregandoHorarios] = useState(false)
  const [kitFestaCalendarioMes, setKitFestaCalendarioMes] = useState(() => new Date().getMonth())
  const [kitFestaCalendarioAno, setKitFestaCalendarioAno] = useState(() => new Date().getFullYear())
  const [kitFestaTema, setKitFestaTema] = useState('')
  const [kitFestaIdade, setKitFestaIdade] = useState<number | ''>('')

  const [showModalAdicionado, setShowModalAdicionado] = useState(false)
  const [aceiteTermo, setAceiteTermo] = useState(false)

  useEffect(() => {
    setAceiteTermo(false)
  }, [produtoId])

  useEffect(() => {
    loadData().catch((err) => {
      if (String(err).includes('Não autenticado')) router.replace('/login?message=session_nao_encontrada')
    })
  }, [produtoId])

  // Se o aluno selecionado não tem permissão para o produto, limpar ou escolher o primeiro permitido
  useEffect(() => {
    if (alunoIdsComAcesso.length === 0) return
    if (alunoSelecionado && !alunoIdsComAcesso.includes(alunoSelecionado)) {
      setAlunoSelecionado(alunoIdsComAcesso[0] ?? '')
    }
  }, [alunoIdsComAcesso, alunoSelecionado])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // Carregar produto
      const produtoData = await obterProdutoCompleto(produtoId)
      if (!produtoData) {
        setError('Produto não encontrado')
        setLoading(false)
        return
      }
      setProduto(produtoData)

      // Kit Mensal: só pode comprar para o próximo mês em diante — inicializar mês/ano para o próximo mês
      if (produtoData.tipo === 'KIT_LANCHE' && (produtoData as any).tipo_kit === 'MENSAL') {
        const now = new Date()
        let proxMes = now.getMonth() + 2
        let proxAno = now.getFullYear()
        if (proxMes > 12) {
          proxMes = 1
          proxAno += 1
        }
        setMesReferencia(proxMes)
        setAnoReferencia(proxAno)
      }

      // Inicializar variações obrigatórias
      const variacoesIniciais: Record<string, string> = {}
      if (produtoData.variacoes) {
        for (const variacao of produtoData.variacoes) {
          if (variacao.obrigatorio && variacao.valores && variacao.valores.length > 0) {
            variacoesIniciais[variacao.id] = variacao.valores[0].id
          }
        }
      }
      setVariacoesSelecionadas(variacoesIniciais)

      // Carregar alunos e quais têm permissão para este produto (disponibilidade)
      const alunosData = await getAlunosDoResponsavel()
      setAlunos(alunosData)
      const idsAcesso = await getAlunosComAcessoAoProduto(produtoId)
      setAlunoIdsComAcesso(idsAcesso)
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const ehKitLanche = produto?.tipo === 'KIT_LANCHE'
  const ehKitFesta = produto?.tipo === 'KIT_FESTA'
  const ehKitLancheMensal = ehKitLanche && (produto as any)?.tipo_kit === 'MENSAL'

  // Só podem ser escolhidos alunos que têm permissão para este produto (disponibilidade)
  const alunosPermitidos = alunos.filter((a) => alunoIdsComAcesso.includes(a.id))
  const qtdEfetiva = ehKitFesta
    ? 1
    : ehKitLancheMensal
      ? 1
      : ehKitLanche
        ? Math.max(1, diasSelecionados.length)
        : quantidade

  // Turno do aluno selecionado (para Kit Festa: MANHA ou TARDE)
  const empresaIdProduto = (produto as any)?.empresa_id

  const turnoAlunoSelecionado = ((): 'MANHA' | 'TARDE' | null => {
    if (!ehKitFesta || !alunoSelecionado) return null
    const aluno = alunos.find((a) => a.id === alunoSelecionado) as any
    if (!aluno?.turma_id) return null
    const turmaRef = aluno.turmas ?? aluno.turma
    const turma = Array.isArray(turmaRef) ? turmaRef[0] : turmaRef
    const t = turma?.turno
    return t === 'MANHA' || t === 'TARDE' ? t : null
  })()

  // Kit Festa: carregar datas disponíveis quando aluno é selecionado
  useEffect(() => {
    if (!ehKitFesta || !alunoSelecionado || !empresaIdProduto || !produtoId) return
    setKitFestaData('')
    setKitFestaHorario(null)
    setKitFestaHorariosDisponiveis([])
    setKitFestaErroAgenda(null)
    setKitFestaCarregandoDatas(true)
    listarDatasDisponiveisKitFesta(empresaIdProduto, produtoId)
      .then((res) => {
        setKitFestaDatasDisponiveis(res.erro ? [] : res.datas)
        if (res.erro) setKitFestaErroAgenda(res.erro)
      })
      .catch(() => setKitFestaDatasDisponiveis([]))
      .finally(() => setKitFestaCarregandoDatas(false))
  }, [ehKitFesta, alunoSelecionado, empresaIdProduto, produtoId])

  // Kit Festa: carregar horários disponíveis quando data é selecionada (consulta Google Agenda)
  useEffect(() => {
    if (!ehKitFesta || !kitFestaData || turnoAlunoSelecionado === null) {
      setKitFestaHorariosDisponiveis([])
      return
    }
    setKitFestaHorario(null)
    setKitFestaErroAgenda(null)
    setKitFestaCarregandoHorarios(true)
    getHorariosDisponiveisKitFesta(produtoId, kitFestaData, turnoAlunoSelecionado)
      .then((res) => {
        setKitFestaHorariosDisponiveis(res.horarios || [])
        if (res.erro) setKitFestaErroAgenda(res.erro)
      })
      .catch((err) => {
        setKitFestaHorariosDisponiveis([])
        setKitFestaErroAgenda(err instanceof Error ? err.message : 'Erro ao consultar disponibilidade.')
      })
      .finally(() => setKitFestaCarregandoHorarios(false))
  }, [ehKitFesta, kitFestaData, turnoAlunoSelecionado, produtoId])

  // Carregar dias úteis do mês quando Kit Lanche MENSAL
  useEffect(() => {
    if (!ehKitLancheMensal || !empresaIdProduto) return
    setCarregandoDiasUteis(true)
    obterDiasUteis(empresaIdProduto, anoReferencia, mesReferencia)
      .then(setDiasUteisMes)
      .catch(() => setDiasUteisMes(0))
      .finally(() => setCarregandoDiasUteis(false))
  }, [ehKitLancheMensal, empresaIdProduto, anoReferencia, mesReferencia])

  // Dias úteis do próximo mês (para exibir "A partir de" no Kit Mensal)
  useEffect(() => {
    if (!ehKitLancheMensal || !empresaIdProduto) return
    const hoje = new Date()
    const proxMes = hoje.getMonth() + 2
    const proxAno = proxMes > 12 ? hoje.getFullYear() + 1 : hoje.getFullYear()
    const proxMesNorm = proxMes > 12 ? 1 : proxMes
    obterDiasUteis(empresaIdProduto, proxAno, proxMesNorm)
      .then(setDiasUteisProximoMes)
      .catch(() => setDiasUteisProximoMes(0))
  }, [ehKitLancheMensal, empresaIdProduto])

  // Kit Mensal: garantir que mês/ano não fiquem antes do próximo mês
  useEffect(() => {
    if (!ehKitLancheMensal) return
    const now = new Date()
    let proximoMes = now.getMonth() + 2
    let proximoAno = now.getFullYear()
    if (proximoMes > 12) {
      proximoMes = 1
      proximoAno += 1
    }
    if (anoReferencia < proximoAno || (anoReferencia === proximoAno && mesReferencia < proximoMes)) {
      setAnoReferencia(proximoAno)
      setMesReferencia(proximoMes)
    }
  }, [ehKitLancheMensal, anoReferencia, mesReferencia])

  /** Estoque disponível: do produto (sem variação) ou o mínimo entre os valores das variações selecionadas (null = ilimitado). Sempre chamado (hooks) mesmo com produto null. */
  const estoqueDisponivel = useMemo(() => {
    if (!produto) return 0
    const estProduto = Number(produto.estoque ?? 0)
    if (!produto.variacoes?.length) return estProduto
    let minEstoque: number = Infinity
    for (const variacao of produto.variacoes) {
      const valorId = variacoesSelecionadas[variacao.id]
      // Se a variação não tem valores configurados, ignora no cálculo de estoque
      if (!variacao.valores?.length) continue
      // Enquanto o responsável ainda não escolheu a variação, não considerar como esgotado;
      // o botão ficará desabilitado por validação de seleção, mas sem exibir "Esgotado".
      if (!valorId) continue
      const valor = variacao.valores.find((v) => v.id === valorId)
      if (!valor) continue
      const ev = valor.estoque
      if (ev === null || ev === undefined) continue
      if (ev < minEstoque) minEstoque = ev
    }
    return minEstoque === Infinity ? estProduto : minEstoque
  }, [produto, variacoesSelecionadas])

  // Preço mínimo "a partir de": base + menor valor de cada variação; Kit Mensal = isso × dias úteis próximo mês × (1 - desconto)
  const precoAPartirDe = (() => {
    if (!produto) return null
    let base = Number(produto.preco)
    if (produto.variacoes?.length) {
      for (const v of produto.variacoes) {
        if (v.valores?.length) {
          const minVal = Math.min(...v.valores.map((x) => Number(x.preco_adicional)))
          base += minVal
        }
      }
    }
    if (ehKitLancheMensal) {
      const dias = diasUteisProximoMes || 0
      const desconto = Number((produto as any).desconto_kit_mensal_pct || 0) / 100
      return base * dias * (1 - desconto)
    }
    return base
  })()

  // Kit Mensal: total sem desconto (baseado na variação e mês selecionados) — para exibir valor cheio
  function kitMensalValorCheio(): number {
    if (!produto || !ehKitLancheMensal) return 0
    const dias = diasUteisMes || 0
    let total = Number(produto.preco) * dias
    if (produto.variacoes) {
      for (const variacao of produto.variacoes) {
        const valorId = variacoesSelecionadas[variacao.id]
        if (valorId && variacao.valores) {
          const valor = variacao.valores.find(v => v.id === valorId)
          if (valor) total += Number(valor.preco_adicional) * dias
        }
      }
    }
    return total
  }

  function calcularPrecoTotal(): number {
    if (!produto) return 0

    const dias = diasUteisMes || 0
    const descontoPct = Number((produto as any).desconto_kit_mensal_pct || 0) / 100

    let precoBase: number
    if (ehKitLancheMensal) {
      const totalSemDesconto = kitMensalValorCheio()
      precoBase = totalSemDesconto * (1 - descontoPct)
      // Opcionais são adicionados ao final (sem multiplicar por dias; já são por item)
      if (produto.grupos_opcionais) {
        for (const grupo of produto.grupos_opcionais) {
          if (grupo.opcionais) {
            for (const opcional of grupo.opcionais) {
              const qtd = opcionaisSelecionados[opcional.id] || 0
              if (qtd > 0) {
                precoBase += Number(opcional.preco) * qtd
              }
            }
          }
        }
      }
      return precoBase
    }

    precoBase = Number(produto.preco) * qtdEfetiva
    // Adicionar preços das variações (produto normal ou Kit Avulso)
    if (produto.variacoes) {
      for (const variacao of produto.variacoes) {
        const valorId = variacoesSelecionadas[variacao.id]
        if (valorId && variacao.valores) {
          const valor = variacao.valores.find(v => v.id === valorId)
          if (valor) {
            precoBase += Number(valor.preco_adicional) * qtdEfetiva
          }
        }
      }
    }
    // Adicionar preços dos opcionais
    if (produto.grupos_opcionais) {
      for (const grupo of produto.grupos_opcionais) {
        if (grupo.opcionais) {
          for (const opcional of grupo.opcionais) {
            const qtd = opcionaisSelecionados[opcional.id] || 0
            if (qtd > 0) {
              precoBase += Number(opcional.preco) * qtd
            }
          }
        }
      }
    }
    return precoBase
  }

  function validarSelecoes(): { erro: string | null; campoId: string | null } {
    // Kit Festa: ordem dos campos (aluno, data, horário, tema, idade)
    if (ehKitFesta) {
      if (!alunoSelecionado) return { erro: 'Por favor, selecione um aluno', campoId: 'kit-festa-aluno' }
      if (!kitFestaData) return { erro: 'Por favor, selecione a data da festa', campoId: 'kit-festa-data' }
      if (!kitFestaHorario) return { erro: 'Por favor, selecione o horário', campoId: 'kit-festa-horario' }
      if (!String(kitFestaTema || '').trim()) return { erro: 'Por favor, informe o tema da festa', campoId: 'kit-festa-tema' }
      if (!kitFestaIdade || kitFestaIdade < 1 || kitFestaIdade > 15) return { erro: 'Por favor, selecione a idade (1 a 15 anos)', campoId: 'kit-festa-idade' }
    }

    // Verificar variações: todas com opções exigem seleção
    if (produto?.variacoes) {
      for (const variacao of produto.variacoes) {
        const valor = variacoesSelecionadas[variacao.id]
        if (variacao.valores && variacao.valores.length > 0 && (!valor || valor === '')) {
          return { erro: `Por favor, selecione ${variacao.nome}`, campoId: `variacao-${variacao.id}` }
        }
      }
    }

    // Verificar grupos de opcionais (mínimo e máximo de seleções)
    if (produto?.grupos_opcionais) {
      for (const grupo of produto.grupos_opcionais) {
        const minimo = Number(grupo.min_selecoes ?? 0)
        const totalSelecionado =
          grupo.opcionais?.reduce((sum, op) => sum + (opcionaisSelecionados[op.id] || 0), 0) || 0
        // Se o grupo tiver mínimo > 0, sempre exigir esse mínimo (independente do flag "obrigatorio")
        if (minimo > 0 && totalSelecionado < minimo) {
          return {
            erro: `Por favor, selecione pelo menos ${minimo} item(ns) de ${grupo.nome}`,
            campoId: `grupo-${grupo.id}`,
          }
        }
        if (grupo.max_selecoes != null && totalSelecionado > grupo.max_selecoes) {
          return { erro: `Você pode selecionar no máximo ${grupo.max_selecoes} item(ns) de ${grupo.nome}`, campoId: `grupo-${grupo.id}` }
        }
      }
    }

    if (!alunoSelecionado) {
      return { erro: 'Por favor, selecione um aluno', campoId: ehKitFesta ? 'kit-festa-aluno' : 'selecao-aluno' }
    }

    if (ehKitLancheMensal) {
      if (diasUteisMes <= 0) {
        return { erro: 'Configure os dias úteis deste mês no painel admin ou escolha outro mês', campoId: null }
      }
    } else if (ehKitLanche && diasSelecionados.length === 0) {
      return { erro: 'Por favor, selecione os dias úteis no calendário', campoId: null }
    }

    return { erro: null, campoId: null }
  }

  function focarPrimeiroCampoFaltante(campoId: string | null) {
    if (!campoId) return
    setTimeout(() => {
      const el = document.getElementById(campoId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const focusable = el.querySelector<HTMLElement>('input, select, button[type="button"], [role="combobox"]')
        if (focusable) (focusable as HTMLElement).focus()
      }
    }, 150)
  }

  function scrollParaMensagemErro() {
    setTimeout(() => {
      const el = document.getElementById('mensagem-erro')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus({ preventScroll: false })
      }
    }, 150)
  }

  function adicionarAoCarrinho() {
    const { erro, campoId } = validarSelecoes()
    if (erro) {
      setError(erro)
      focarPrimeiroCampoFaltante(campoId)
      return
    }

    if (!produto || !alunoSelecionado) return

    if (estoqueDisponivel <= 0) {
      setError('Produto esgotado. Não é possível adicionar ao carrinho.')
      return
    }

    const aluno = alunos.find(a => a.id === alunoSelecionado)
    if (!aluno) return

    // Preparar opcionais selecionados para o carrinho
    const opcionaisArray: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }> = []
    if (produto.grupos_opcionais) {
      for (const grupo of produto.grupos_opcionais) {
        if (grupo.opcionais) {
          for (const opcional of grupo.opcionais) {
            const qtd = opcionaisSelecionados[opcional.id] || 0
            if (qtd > 0) {
              opcionaisArray.push({
                opcional_id: opcional.id,
                nome: opcional.nome,
                preco: Number(opcional.preco),
                quantidade: qtd
              })
            }
          }
        }
      }
    }

    // Preparar variações selecionadas (nome -> valor)
    const variacoesFormatadas: Record<string, string> = {}
    if (produto.variacoes) {
      for (const variacao of produto.variacoes) {
        const valorId = variacoesSelecionadas[variacao.id]
        if (valorId && variacao.valores) {
          const valor = variacao.valores.find(v => v.id === valorId)
          if (valor) {
            variacoesFormatadas[variacao.nome] = nomeVariacaoValor(valor)
          }
        }
      }
    }

    const totalCalculado = calcularPrecoTotal()
    const carrinho = carregarCarrinho()
    // Carrinho deve ter só itens do mesmo tipo: normais, Kit Lanche ou Kit Festa
    if (carrinho.length > 0) {
      const tipoCarrinho = carrinho[0].produto.tipo
      const tipoProduto = produto.tipo
      const carrinhoEhKitFesta = tipoCarrinho === 'KIT_FESTA'
      const carrinhoEhKitLanche = tipoCarrinho === 'KIT_LANCHE'
      const produtoEhKitFesta = tipoProduto === 'KIT_FESTA'
      const produtoEhKitLanche = tipoProduto === 'KIT_LANCHE'
      if (carrinhoEhKitFesta && !produtoEhKitFesta) {
        setError('O Kit Festa deve ser comprado sozinho. Finalize essa compra ou esvazie o carrinho para adicionar outros produtos.')
        scrollParaMensagemErro()
        return
      }
      if (carrinhoEhKitLanche && !produtoEhKitLanche) {
        setError('O carrinho contém apenas Kit Lanche. Finalize essa compra ou esvazie o carrinho para adicionar outros produtos.')
        scrollParaMensagemErro()
        return
      }
      if (!carrinhoEhKitFesta && !carrinhoEhKitLanche && produtoEhKitFesta) {
        setError('O Kit Festa deve ser comprado sozinho. Esvazie o carrinho ou finalize a compra atual para adicionar Kit Festa.')
        scrollParaMensagemErro()
        return
      }
      if (!carrinhoEhKitFesta && !carrinhoEhKitLanche && produtoEhKitLanche) {
        setError('O carrinho contém apenas produtos normais. Finalize essa compra ou esvazie o carrinho para adicionar Kit Lanche.')
        scrollParaMensagemErro()
        return
      }
    }
    const novoItem: ItemCarrinho = {
      produto: {
        id: produto.id,
        nome: produto.nome,
        preco: ehKitLancheMensal ? totalCalculado : totalCalculado / qtdEfetiva,
        tipo: produto.tipo,
        descricao: produto.descricao || null,
        imagem_url: produto.imagem_url || null,
      },
      alunoId: alunoSelecionado,
      alunoNome: aluno.nome,
      quantidade: ehKitLancheMensal ? 1 : qtdEfetiva,
      variacoesSelecionadas: Object.keys(variacoesFormatadas).length > 0 ? variacoesFormatadas : undefined,
      opcionaisSelecionados: opcionaisArray.length > 0 ? opcionaisArray : undefined,
      diasSelecionados: ehKitLanche && !ehKitLancheMensal && diasSelecionados.length > 0 ? [...diasSelecionados] : undefined,
      mesReferencia: ehKitLancheMensal ? mesReferencia : undefined,
      anoReferencia: ehKitLancheMensal ? anoReferencia : undefined,
      diasUteis: ehKitLancheMensal ? diasUteisMes : undefined,
      tipo_kit: ehKitLanche ? ((produto as any).tipo_kit || 'AVULSO') : undefined,
      empresaId: ehKitLancheMensal ? (produto as any).empresa_id : undefined,
      kitFestaData: ehKitFesta ? kitFestaData : undefined,
      kitFestaHorario: ehKitFesta && kitFestaHorario ? kitFestaHorario : undefined,
      temaFesta: ehKitFesta && kitFestaTema.trim() ? kitFestaTema.trim() : undefined,
      idadeFesta: ehKitFesta && kitFestaIdade !== '' && kitFestaIdade >= 1 && kitFestaIdade <= 15 ? kitFestaIdade : undefined,
    }

    carrinho.push(novoItem)
    salvarCarrinho(carrinho)
    setShowModalAdicionado(true)
  }

  function formatPrice(value: number) {
    const n = Number(value)
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number.isFinite(n) ? n : 0)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Carregando produto...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !produto) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <Card className="text-center py-12">
            <CardContent>
              <div className="text-6xl mb-4">❌</div>
              <h2 className="text-2xl font-semibold mb-2">Erro</h2>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => router.push('/loja')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para a Loja
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!produto) return null

  const temVariacaoSemSelecao = produto.variacoes?.some(
    (v) => v.valores && v.valores.length > 0 && !variacoesSelecionadas[v.id]
  )
  const gruposOpcionaisIncompletos = produto.grupos_opcionais?.some((grupo) => {
    const minimo = Number(grupo.min_selecoes ?? 0)
    if (minimo <= 0) return false
    const totalSelecionado =
      grupo.opcionais?.reduce((sum, op) => sum + (opcionaisSelecionados[op.id] || 0), 0) || 0
    return totalSelecionado < minimo
  })
  const kitFestaIncompleto = ehKitFesta && (
    !alunoSelecionado || !kitFestaData || !kitFestaHorario || !!kitFestaErroAgenda ||
    !String(kitFestaTema || '').trim() || !kitFestaIdade || kitFestaIdade < 1 || kitFestaIdade > 15
  )
  const exigirTermoAceite = !!(produto as any)?.exigir_termo_aceite
  const esgotado = estoqueDisponivel <= 0
  const botaoAdicionarDesabilitado =
    !alunoSelecionado ||
    !!temVariacaoSemSelecao ||
    !!gruposOpcionaisIncompletos ||
    kitFestaIncompleto ||
    (exigirTermoAceite && !aceiteTermo) ||
    esgotado

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <LojaHeader />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <Button
          variant="ghost"
          onClick={() => router.push('/loja')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para a Loja
        </Button>

        {error && (
          <div
            id="mensagem-erro"
            className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 scroll-mt-4"
            tabIndex={-1}
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Imagem do Produto */}
          <Card className="overflow-hidden">
            <div className="relative aspect-square bg-gradient-to-br from-muted to-muted/50">
              {produto.imagem_url ? (
                <img
                  src={produto.imagem_url}
                  alt={produto.nome}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-2 opacity-50">
                      {produto.tipo === 'PRODUTO' ? '📦' : produto.tipo === 'SERVICO' ? '🔧' : '🎁'}
                    </div>
                    <p className="text-sm text-muted-foreground">Sem imagem</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Informações do Produto */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{produto.nome}</h1>
              {ehKitLancheMensal && Number((produto as any)?.desconto_kit_mensal_pct ?? 0) > 0 ? (
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">
                    {formatPrice(kitMensalValorCheio())} ({(produto as any).desconto_kit_mensal_pct}% de desconto)
                  </p>
                  <p className="text-2xl font-semibold text-primary">{formatPrice(calcularPrecoTotal())}</p>
                </div>
              ) : (
                <p className={`text-2xl font-semibold text-primary ${precoAPartirDe != null && (produto.variacoes?.length ?? 0) > 0 ? 'mb-1' : 'mb-4'}`}>
                  {formatPrice(calcularPrecoTotal())}
                </p>
              )}
              {precoAPartirDe != null && (produto.variacoes?.length ?? 0) > 0 && !ehKitLancheMensal && (
                <p className="text-sm text-muted-foreground mb-4">A partir de {formatPrice(precoAPartirDe)}</p>
              )}
              {produto.descricao && (
                <p className="text-muted-foreground">{produto.descricao}</p>
              )}
            </div>

            {/* Kit Festa: fluxo no topo — Aluno → Data (calendário) → Horário */}
            {ehKitFesta && (
              <Card className="p-4 border-primary/20">
                <h2 className="text-lg font-semibold mb-1">Seleção para Kit Festa</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Selecione na ordem: 1) Aluno, 2) Data (calendário – apenas dias úteis), 3) Horário (conforme turno da turma e disponibilidade na agenda).
                </p>
                <div className="space-y-4">
                  <div id="kit-festa-aluno" className="space-y-2 scroll-mt-4">
                    <Label className="flex items-center gap-2">
                      1. Aluno <span className="text-destructive">*</span>
                      {alunoSelecionado && <span className="text-green-600" title="Preenchido"><Check className="h-4 w-4" /></span>}
                    </Label>
                    {alunosPermitidos.length === 0 ? (
                      <p className="text-sm text-amber-700 py-2">Nenhum dos seus filhos tem permissão para este produto (disponibilidade configurada na escola).</p>
                    ) : (
                      <Select value={alunoSelecionado} onValueChange={(v) => { setAlunoSelecionado(v); setKitFestaData(''); setKitFestaHorario(null); setKitFestaTema(''); setKitFestaIdade('') }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o aluno" />
                        </SelectTrigger>
                        <SelectContent>
                          {alunosPermitidos.map((aluno) => (
                            <SelectItem key={aluno.id} value={aluno.id}>
                              {aluno.nome} ({aluno.prontuario})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {alunoSelecionado && (() => {
                      const aluno = alunos.find((a) => a.id === alunoSelecionado) as any
                      const turmaRef = aluno?.turmas ?? aluno?.turma
                      const turma = Array.isArray(turmaRef) ? turmaRef[0] : turmaRef
                      const turmaNome = turma?.descricao ?? (aluno?.turma_id ? 'Turma (sem nome)' : null)
                      const turnoStr = turma?.turno === 'MANHA' ? 'Manhã' : turma?.turno === 'TARDE' ? 'Tarde' : null
                      return (turmaNome != null || turnoStr != null) ? (
                        <div className="rounded-md border bg-muted/30 p-2 text-sm">
                          {turmaNome != null && <p className="font-medium">Turma: {turmaNome}</p>}
                          {turnoStr != null && <p className="text-muted-foreground">Turno: {turnoStr}</p>}
                          {turmaNome == null && turnoStr == null && aluno?.turma_id && (
                            <p className="text-muted-foreground">Turma sem turno definido. Defina em Admin → Turmas.</p>
                          )}
                        </div>
                      ) : null
                    })()}
                  </div>
                  {alunoSelecionado && (
                    <>
                      {turnoAlunoSelecionado === null && (
                        <p className="text-sm text-amber-700">O aluno selecionado não possui turma com turno definido. Defina o turno em Admin → Turmas.</p>
                      )}
                      {turnoAlunoSelecionado !== null && (
                        <>
                          <div id="kit-festa-data" className="space-y-2 scroll-mt-4">
                            <Label className="flex items-center gap-2">
                              2. Data (apenas dias úteis)
                              {kitFestaData && <span className="text-green-600" title="Preenchido"><Check className="h-4 w-4" /></span>}
                            </Label>
                            {kitFestaCarregandoDatas ? (
                              <p className="text-sm text-muted-foreground">Carregando datas...</p>
                            ) : (
                              <div className="border rounded-lg p-3 bg-background">
                                <div className="flex items-center justify-between mb-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (kitFestaCalendarioMes === 0) {
                                        setKitFestaCalendarioMes(11)
                                        setKitFestaCalendarioAno((a) => a - 1)
                                      } else {
                                        setKitFestaCalendarioMes((m) => m - 1)
                                      }
                                    }}
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                  </Button>
                                  <span className="text-sm font-medium capitalize">
                                    {new Date(kitFestaCalendarioAno, kitFestaCalendarioMes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (kitFestaCalendarioMes === 11) {
                                        setKitFestaCalendarioMes(0)
                                        setKitFestaCalendarioAno((a) => a + 1)
                                      } else {
                                        setKitFestaCalendarioMes((m) => m + 1)
                                      }
                                    }}
                                  >
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-7 gap-1 mb-1">
                                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
                                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                                  ))}
                                </div>
                                <div className="grid grid-cols-7 gap-1">
                                  {(() => {
                                    const primeiro = new Date(kitFestaCalendarioAno, kitFestaCalendarioMes, 1)
                                    const inicio = new Date(primeiro); inicio.setDate(inicio.getDate() - inicio.getDay())
                                    const dias: Date[] = []
                                    const d = new Date(inicio)
                                    for (let i = 0; i < 42; i++) { dias.push(new Date(d)); d.setDate(d.getDate() + 1) }
                                    const setDisponiveis = new Set(kitFestaDatasDisponiveis)
                                    return dias.map((date, i) => {
                                      const key = date.toISOString().slice(0, 10)
                                      const doMes = date.getMonth() === kitFestaCalendarioMes
                                      const disponivel = setDisponiveis.has(key)
                                      const selecionado = kitFestaData === key
                                      const clicavel = doMes && disponivel
                                      return (
                                        <button
                                          key={i}
                                          type="button"
                                          disabled={!clicavel}
                                          onClick={() => clicavel && (setKitFestaData(key), setKitFestaHorario(null))}
                                          className={cn(
                                            'aspect-square rounded-md text-sm font-medium transition-colors',
                                            !doMes && 'text-muted-foreground/40',
                                            doMes && !disponivel && 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed',
                                            clicavel && 'hover:bg-primary/20 cursor-pointer',
                                            selecionado && 'bg-primary text-primary-foreground hover:bg-primary/90'
                                          )}
                                        >
                                          {date.getDate()}
                                        </button>
                                      )
                                    })
                                  })()}
                                </div>
                                {kitFestaData && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Data selecionada: {new Date(kitFestaData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                  </p>
                                )}
                              </div>
                            )}
                            {kitFestaDatasDisponiveis.length === 0 && !kitFestaCarregandoDatas && (
                              <p className="text-sm text-muted-foreground">Nenhuma data disponível no período configurado.</p>
                            )}
                          </div>
                          {kitFestaData && (
                            <div id="kit-festa-horario" className="space-y-2 scroll-mt-4">
                              <Label className="flex items-center gap-2">
                                3. Horário (validado com Google Agenda)
                                {kitFestaHorario && <span className="text-green-600" title="Preenchido"><Check className="h-4 w-4" /></span>}
                              </Label>
                              {kitFestaCarregandoHorarios ? (
                                <p className="text-sm text-muted-foreground">Verificando disponibilidade na agenda...</p>
                              ) : kitFestaHorariosDisponiveis.length > 0 ? (
                                <Select
                                  value={(() => {
                                    if (!kitFestaHorario) return ''
                                    const normalizar = (t: string) => (t || '').replace(/^(\d):/, '0$1:')
                                    const key = kitFestaHorariosDisponiveis.find(
                                      (h) => normalizar(h.inicio) === normalizar(kitFestaHorario!.inicio) && normalizar(h.fim) === normalizar(kitFestaHorario!.fim)
                                    )
                                    return key ? `${key.inicio}-${key.fim}` : ''
                                  })()}
                                  onValueChange={(v) => { const [inicio, fim] = v.split('-'); setKitFestaHorario(inicio && fim ? { inicio, fim } : null) }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione o horário" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {kitFestaHorariosDisponiveis.map((h) => (
                                      <SelectItem key={`${h.inicio}-${h.fim}`} value={`${h.inicio}-${h.fim}`}>
                                        {h.inicio} às {h.fim}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <p className="text-sm text-muted-foreground">Selecione o horário</p>
                              )}
                              {kitFestaHorariosDisponiveis.length === 0 && !kitFestaCarregandoHorarios && kitFestaErroAgenda && (
                                <div className="space-y-1">
                                  <p className="text-sm text-destructive">{kitFestaErroAgenda}</p>
                                  {kitFestaErroAgenda.includes('Google Agenda') && (
                                    <p className="text-xs text-muted-foreground">Local: GOOGLE_CALENDAR_ID e GOOGLE_APPLICATION_CREDENTIALS no .env. Na Vercel: GOOGLE_SERVICE_ACCOUNT_JSON (conteúdo do JSON).</p>
                                  )}
                                </div>
                              )}
                              {kitFestaHorariosDisponiveis.length === 0 && !kitFestaCarregandoHorarios && !kitFestaErroAgenda && (
                                <p className="text-sm text-muted-foreground">Nenhum horário disponível nesta data (todos ocupados na agenda).</p>
                              )}
                            </div>
                          )}
                          {kitFestaData && kitFestaHorario && (
                            <>
                              <div id="kit-festa-tema" className="space-y-2 scroll-mt-4">
                                <Label className="flex items-center gap-2">
                                  4. Tema da Festa <span className="text-destructive">*</span>
                                  {String(kitFestaTema || '').trim() && <span className="text-green-600" title="Preenchido"><Check className="h-4 w-4" /></span>}
                                </Label>
                                <Input
                                  placeholder="Ex.: Princesas, Roblox, Super-Heróis"
                                  value={kitFestaTema}
                                  onChange={(e) => setKitFestaTema(e.target.value)}
                                  maxLength={200}
                                />
                              </div>
                              <div id="kit-festa-idade" className="space-y-2 scroll-mt-4">
                                <Label className="flex items-center gap-2">
                                  5. Idade que a criança fará <span className="text-destructive">*</span>
                                  {kitFestaIdade !== '' && kitFestaIdade >= 1 && kitFestaIdade <= 15 && <span className="text-green-600" title="Preenchido"><Check className="h-4 w-4" /></span>}
                                </Label>
                                <Select
                                  value={kitFestaIdade === '' ? '' : String(kitFestaIdade)}
                                  onValueChange={(v) => setKitFestaIdade(v === '' ? '' : Number(v))}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione a idade (1 a 15 anos)" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                                      <SelectItem key={n} value={String(n)}>{n} {n === 1 ? 'ano' : 'anos'}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </Card>
            )}

            {/* Variações */}
            {produto.variacoes && produto.variacoes.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Variações</h2>
                {produto.variacoes.map((variacao) => {
                  const preenchido = !!(variacoesSelecionadas[variacao.id] && variacao.valores?.length)
                  const exigeSelecao = !!(variacao.valores?.length)
                  const faltaPreencher = exigeSelecao && !preenchido
                  return (
                    <div key={variacao.id} id={`variacao-${variacao.id}`} className="space-y-2 scroll-mt-4">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="flex items-center gap-2">
                          {variacao.nome}
                          {variacao.obrigatorio && <span className="text-destructive">*</span>}
                          {variacao.obrigatorio && faltaPreencher && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                              Obrigatório
                            </span>
                          )}
                          {variacao.obrigatorio && preenchido && (
                            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                              <Check className="h-3 w-3" />
                              Preenchido
                            </span>
                          )}
                        </Label>
                      </div>
                      <Select
                        value={variacoesSelecionadas[variacao.id] || ''}
                        onValueChange={(value) => {
                          setVariacoesSelecionadas({
                            ...variacoesSelecionadas,
                            [variacao.id]: value
                          })
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            'min-h-10 h-auto py-2 [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-left',
                            faltaPreencher ? 'border-destructive/40 bg-destructive/5 focus:ring-destructive/40' : ''
                          )}
                        >
                          <SelectValue placeholder={`Selecione ${variacao.nome}`} />
                        </SelectTrigger>
                        <SelectContent className="max-w-[min(100vw,28rem)]">
                          {variacao.valores?.map((valor) => (
                            <SelectItem key={valor.id} value={valor.id} className="py-2.5 whitespace-normal">
                              <span className="block text-left break-words pr-2">
                                {nomeVariacaoValor(valor)}
                                {valor.preco_adicional > 0 && (
                                  <span className="text-muted-foreground ml-1">(+{formatPrice(valor.preco_adicional)})</span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Opcionais/Adicionais */}
            {produto.grupos_opcionais && produto.grupos_opcionais.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Adicionais</h2>
                {produto.grupos_opcionais.map((grupo) => {
                  const totalSelecionado = grupo.opcionais?.reduce((sum, op) => sum + (opcionaisSelecionados[op.id] || 0), 0) ?? 0
                  const minimo = Number(grupo.min_selecoes ?? 0)
                  const obrigatorioPreenchido =
                    minimo > 0
                      ? totalSelecionado >= minimo
                      : !grupo.obrigatorio || totalSelecionado > 0
                  const faltaMinimo = minimo > 0 && totalSelecionado < minimo
                  return (
                  <Card
                    key={grupo.id}
                    id={`grupo-${grupo.id}`}
                    className={cn(
                      'p-4 scroll-mt-4 border border-[var(--cantina-border)]',
                      faltaMinimo ? 'border-destructive/50 bg-destructive/5' : ''
                    )}
                  >
                    <div className="mb-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-base font-medium flex items-center gap-2">
                            {grupo.nome}
                            {grupo.obrigatorio && <span className="text-destructive">*</span>}
                          </Label>
                          {minimo > 0 && faltaMinimo && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                              Obrigatório
                            </span>
                          )}
                          {(minimo > 0 || grupo.obrigatorio) && obrigatorioPreenchido && (
                            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                              <Check className="h-3 w-3" />
                              Preenchido
                            </span>
                          )}
                        </div>
                        {grupo.descricao && (
                          <p className="text-sm text-muted-foreground">{grupo.descricao}</p>
                        )}
                        {grupo.min_selecoes > 0 && (
                          <p
                            className={cn(
                              'text-xs',
                              faltaMinimo ? 'text-destructive' : 'text-muted-foreground'
                            )}
                          >
                            Selecione pelo menos {grupo.min_selecoes} item(ns). Máximo: {grupo.max_selecoes || 'Ilimitado'}.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {grupo.opcionais?.map((opcional) => (
                        <div key={opcional.id} className="flex items-center justify-between p-2 border rounded">
                          <div className="flex-1 min-w-0">
                            <Label className="font-normal">{opcional.nome}</Label>
                            {opcional.descricao && (
                              <p className="text-xs text-muted-foreground">{opcional.descricao}</p>
                            )}
                            {(Number(opcional.preco) ?? 0) > 0 && (
                              <p className="text-sm font-medium text-primary">
                                {formatPrice(Number(opcional.preco))}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const atual = opcionaisSelecionados[opcional.id] || 0
                                if (atual > 0) {
                                  setOpcionaisSelecionados({
                                    ...opcionaisSelecionados,
                                    [opcional.id]: atual - 1
                                  })
                                }
                              }}
                            >
                              -
                            </Button>
                            <span className="w-8 text-center">
                              {opcionaisSelecionados[opcional.id] || 0}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const atual = opcionaisSelecionados[opcional.id] || 0
                                const totalGrupo = totalSelecionado
                                const maxPorOpcional = opcional.max_selecoes ?? Infinity
                                const maxDoGrupo = grupo.max_selecoes ?? Infinity
                                if (atual < maxPorOpcional && totalGrupo < maxDoGrupo) {
                                  setOpcionaisSelecionados({
                                    ...opcionaisSelecionados,
                                    [opcional.id]: atual + 1
                                  })
                                }
                              }}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                  );
                })}
              </div>
            )}

            {/* Quantidade - bloqueada para Kit Lanche (vem dos dias selecionados) */}
            {!ehKitLanche && !ehKitFesta && (
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setQuantidade(Math.max(1, quantidade - 1))}
                  >
                    -
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    value={quantidade}
                    onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setQuantidade(quantidade + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
            )}

            {/* Kit Lanche MENSAL: só pode selecionar a partir do próximo mês (compra no mês anterior ao de referência) */}
            {ehKitLancheMensal && (() => {
              const now = new Date()
              let proximoMes = now.getMonth() + 2
              let proximoAno = now.getFullYear()
              if (proximoMes > 12) {
                proximoMes = 1
                proximoAno += 1
              }
              const anoAtual = now.getFullYear()
              const mesesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
              const mesesPermitidos = mesesNomes.map((nome, i) => {
                const mes = i + 1
                const permitido = anoReferencia > anoAtual || (anoReferencia === anoAtual && mes >= proximoMes)
                return { mes, nome, permitido }
              })
              return (
              <div className="space-y-2">
                <Label>Mês de referência (apenas a partir do próximo mês)</Label>
                <div className="flex flex-wrap gap-4 items-center">
                  <div>
                    <Label className="text-xs text-muted-foreground">Mês</Label>
                    <Select
                      value={String(mesReferencia)}
                      onValueChange={(v) => setMesReferencia(parseInt(v, 10))}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {mesesPermitidos.map(({ mes, nome, permitido }) => (
                          <SelectItem key={mes} value={String(mes)} disabled={!permitido}>
                            {nome}
                            {!permitido ? ' (indisponível)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ano</Label>
                    <Input
                      type="number"
                      min={proximoAno}
                      max={anoAtual + 2}
                      value={anoReferencia}
                      onChange={(e) => setAnoReferencia(parseInt(e.target.value, 10) || proximoAno)}
                      className="w-24"
                    />
                  </div>
                </div>
                {carregandoDiasUteis ? (
                  <p className="text-sm text-muted-foreground">Carregando dias úteis...</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Este mês tem <strong>{diasUteisMes}</strong> dia(s) útil(eis) configurado(s).
                    {diasUteisMes === 0 && ' Configure em Admin → Produtos → Tipo de Kit Lanche → Dias úteis por mês.'}
                  </p>
                )}
                {Number((produto as any)?.desconto_kit_mensal_pct ?? 0) > 0 && (
                  <p className="text-sm font-medium text-green-700 bg-green-50 px-3 py-2 rounded-md">
                    Desconto de <strong>{Number((produto as any).desconto_kit_mensal_pct)}%</strong> aplicado ao total do mês.
                  </p>
                )}
              </div>
              )
            })()}

            {/* Calendário de dias úteis - Kit Lanche AVULSO (só dias cadastrados pela empresa ficam ativos) */}
            {ehKitLanche && !ehKitLancheMensal && (
              <div className="space-y-2">
                <Label>Selecione os dias disponíveis</Label>
                <CalendarioDiasUteis
                  diasSelecionados={diasSelecionados}
                  onSelecaoChange={setDiasSelecionados}
                  minDias={1}
                  empresaId={empresaIdProduto}
                />
                <p className="text-sm text-muted-foreground">
                  Quantidade: <strong>{Math.max(1, diasSelecionados.length)}</strong> (conforme dias selecionados)
                </p>
              </div>
            )}

            {/* Itens do Kit */}
            {['KIT', 'KIT_FESTA', 'KIT_LANCHE'].includes(produto.tipo) && produto.kits_itens && produto.kits_itens.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Itens do Kit</h2>
                <Card className="p-4">
                  <div className="space-y-2">
                    {produto.kits_itens.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium">
                            {(item.produto as any)?.nome || 'Produto não encontrado'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Quantidade: {item.quantidade}
                          </p>
                        </div>
                        <p className="text-sm font-medium">
                          {formatPrice(Number((item.produto as any)?.preco || 0) * item.quantidade)}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* Seleção de Aluno (apenas quando não for Kit Festa; Kit Festa tem Aluno no bloco próprio) — só alunos com permissão para este produto */}
            {!ehKitFesta && (
              <div id="selecao-aluno" className="space-y-2 scroll-mt-4">
                <Label>
                  Aluno <span className="text-destructive">*</span>
                </Label>
                {alunosPermitidos.length === 0 ? (
                  <p className="text-sm text-amber-700 py-2">Nenhum dos seus filhos tem permissão para este produto (disponibilidade configurada na escola).</p>
                ) : (
                  <Select value={alunoSelecionado} onValueChange={setAlunoSelecionado}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o aluno" />
                    </SelectTrigger>
                    <SelectContent>
                      {alunosPermitidos.map((aluno) => (
                        <SelectItem key={aluno.id} value={aluno.id}>
                          {aluno.nome} ({aluno.prontuario})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Termo de aceite (quando produto exige) */}
            {exigirTermoAceite && (produto as any).texto_termo_aceite && (
              <div className="space-y-3 rounded-lg border border-[var(--cantina-border)] bg-muted/30 p-4">
                <div
                  className="text-sm text-[var(--cantina-text)] whitespace-pre-line"
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {(produto as any).texto_termo_aceite}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aceiteTermo}
                    onChange={(e) => setAceiteTermo(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Li e aceito o termo</span>
                </label>
              </div>
            )}

            {/* Botão Adicionar ao Carrinho */}
            {esgotado && (
              <p className="text-sm font-medium text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                Produto esgotado no momento. Não é possível adicionar ao carrinho.
              </p>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={adicionarAoCarrinho}
              disabled={botaoAdicionarDesabilitado}
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              {esgotado ? 'Esgotado' : `Adicionar ao Carrinho - ${formatPrice(calcularPrecoTotal())}`}
            </Button>
          </div>
        </div>
      </main>

      {/* Modal de confirmação */}
      <Dialog open={showModalAdicionado} onOpenChange={setShowModalAdicionado}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>✅ Produto Adicionado!</DialogTitle>
            <DialogDescription>
              <strong>{produto.nome}</strong> foi adicionado ao carrinho
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setShowModalAdicionado(false)}
            >
              Continuar Comprando
            </Button>
            <Link href="/loja/carrinho" className="w-full sm:w-auto">
              <Button className="w-full" onClick={() => setShowModalAdicionado(false)}>
                Ir para o Carrinho
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
