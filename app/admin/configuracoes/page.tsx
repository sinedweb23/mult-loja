'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  obterConfiguracaoAparencia,
  atualizarConfiguracaoAparencia,
  obterConfiguracaoAcesso,
  atualizarConfiguracaoAcesso,
} from '@/app/actions/configuracoes'
import {
  obterConfiguracaoProdutosCredito,
  atualizarConfiguracaoProdutosCredito,
  listarProdutosParaLancheDoDia,
  listarTurmasParaExcecaoCreditoCantina,
  listarRegrasParcelamento,
  salvarRegrasParcelamento,
  removerRegraParcelamento,
  buscarAlunosParaCreditoIlimitado,
  listarAlunosPorIds,
  type TurmaParaExcecao,
  type RegraParcelamento,
  type AlunoParaCreditoIlimitado,
} from '@/app/actions/configuracoes'
import type { PapelUsuario } from '@/lib/types/database'
import { CANTINA_PAPEIS } from '@/lib/cantina-papeis'
import { uploadImagem, deletarImagem } from '@/lib/storage'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { getAdminData } from '@/app/actions/admin'
import { listarEmpresas } from '@/app/actions/empresas'
import {
  listarDepartamentosComSegmentos,
  criarDepartamento,
  atualizarDepartamento,
  removerDepartamento,
  criarSegmento,
  atualizarSegmento,
  removerSegmento,
  type DepartamentoComSegmentos,
} from '@/app/actions/departamentos'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('aparencia')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  
  const [aparenciaConfig, setAparenciaConfig] = useState({
    loja_nome: '',
    loja_logo_url: '',
    loja_favicon_url: '',
  })

  const [produtosCreditoConfig, setProdutosCreditoConfig] = useState<{
    lanche_do_dia_produto_id: string
    excecoes_turma_ids: string[]
    permitir_saldo_negativo: boolean
    limite_saldo_negativo: number
    alunos_saldo_negativo_ilimitado_ids: string[]
  }>({
    lanche_do_dia_produto_id: '',
    excecoes_turma_ids: [],
    permitir_saldo_negativo: false,
    limite_saldo_negativo: 0,
    alunos_saldo_negativo_ilimitado_ids: [],
  })
  const [produtosOpcoes, setProdutosOpcoes] = useState<{ id: string; nome: string }[]>([])
  const [turmasParaExcecao, setTurmasParaExcecao] = useState<TurmaParaExcecao[]>([])
  const [filtroTipoCurso, setFiltroTipoCurso] = useState<string>('')
  const [alunosIlimitadosList, setAlunosIlimitadosList] = useState<AlunoParaCreditoIlimitado[]>([])
  const [buscaAlunoIlimitado, setBuscaAlunoIlimitado] = useState('')
  const [buscaAlunoIlimitadoResultados, setBuscaAlunoIlimitadoResultados] = useState<AlunoParaCreditoIlimitado[]>([])
  const [buscandoAlunoIlimitado, setBuscandoAlunoIlimitado] = useState(false)
  const [acessoPerfis, setAcessoPerfis] = useState<PapelUsuario[]>([])
  const [regrasParcelamento, setRegrasParcelamento] = useState<RegraParcelamento[]>([])
  const [parcelamentoLoading, setParcelamentoLoading] = useState(false)
  const [novaRegra, setNovaRegra] = useState<{
    valor_min: string
    valor_max: string
    max_parcelas: number
    tipo: 'SEM_JUROS' | 'COM_JUROS'
    taxa_juros_pct: string
  }>({
    valor_min: '0',
    valor_max: '',
    max_parcelas: 3,
    tipo: 'SEM_JUROS',
    taxa_juros_pct: '',
  })

  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [departamentos, setDepartamentos] = useState<DepartamentoComSegmentos[]>([])
  const [loadingDepartamentos, setLoadingDepartamentos] = useState(false)
  const [novoDepartamentoNome, setNovoDepartamentoNome] = useState('')
  const [novoSegmentoPorDep, setNovoSegmentoPorDep] = useState<Record<string, string>>({})
  const [departamentosExpandidos, setDepartamentosExpandidos] = useState<Set<string>>(new Set())

  useEffect(() => {
    carregarConfiguracoes()
  }, [])

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const adminData = await getAdminData()
        let id = (adminData as { empresa_id?: string }).empresa_id ?? null
        if (!id) {
          const empresas = await listarEmpresas()
          const primeira = Array.isArray(empresas) && empresas.length > 0 ? (empresas[0] as { id: string }).id : null
          id = primeira
        }
        if (mounted) setEmpresaId(id)
      } catch {
        if (mounted) setEmpresaId(null)
      }
    }
    init()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (activeTab !== 'departamentos' || !empresaId) return
    let mounted = true
    setLoadingDepartamentos(true)
    listarDepartamentosComSegmentos(empresaId)
      .then((list) => { if (mounted) setDepartamentos(list) })
      .catch(() => { if (mounted) setDepartamentos([]) })
      .finally(() => { if (mounted) setLoadingDepartamentos(false) })
    return () => { mounted = false }
  }, [activeTab, empresaId])

  async function carregarConfiguracoes() {
    try {
      setLoading(true)
      setError(null)
      
      const [aparencia, produtosCredito, produtos, turmas, perfisAcesso, regrasParcel] = await Promise.all([
        obterConfiguracaoAparencia(),
        obterConfiguracaoProdutosCredito(),
        listarProdutosParaLancheDoDia(),
        listarTurmasParaExcecaoCreditoCantina(),
        obterConfiguracaoAcesso(),
        listarRegrasParcelamento(),
      ])

      setAparenciaConfig({
        loja_nome: aparencia.loja_nome || '',
        loja_logo_url: aparencia.loja_logo_url || '',
        loja_favicon_url: aparencia.loja_favicon_url || '',
      })
      setProdutosCreditoConfig({
        lanche_do_dia_produto_id: produtosCredito.lanche_do_dia_produto_id || '',
        excecoes_turma_ids: produtosCredito.excecoes_turma_ids || [],
        permitir_saldo_negativo: produtosCredito.permitir_saldo_negativo ?? false,
        limite_saldo_negativo: produtosCredito.limite_saldo_negativo ?? 0,
        alunos_saldo_negativo_ilimitado_ids: produtosCredito.alunos_saldo_negativo_ilimitado_ids ?? [],
      })
      setProdutosOpcoes(produtos)
      const alunosIlimitados = await listarAlunosPorIds(produtosCredito.alunos_saldo_negativo_ilimitado_ids ?? [])
      setAlunosIlimitadosList(alunosIlimitados)
      setTurmasParaExcecao(turmas)
      setAcessoPerfis(perfisAcesso)
      setRegrasParcelamento(regrasParcel)
    } catch (err) {
      console.error('Erro ao carregar configurações:', err)
      setError('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }

  async function handleSalvarAparencia(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await atualizarConfiguracaoAparencia(aparenciaConfig)
      setSuccess('Configurações de aparência salvas com sucesso!')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Erro ao salvar configurações de aparência:', err)
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  async function handleSalvarProdutosCredito(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await atualizarConfiguracaoProdutosCredito({
        lanche_do_dia_produto_id: produtosCreditoConfig.lanche_do_dia_produto_id,
        excecoes_turma_ids: produtosCreditoConfig.excecoes_turma_ids,
        permitir_saldo_negativo: produtosCreditoConfig.permitir_saldo_negativo,
        limite_saldo_negativo: produtosCreditoConfig.limite_saldo_negativo,
        alunos_saldo_negativo_ilimitado_ids: produtosCreditoConfig.alunos_saldo_negativo_ilimitado_ids,
      })
      setSuccess('Configurações de Produtos / Crédito Cantina salvas com sucesso!')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Erro ao salvar Produtos/Crédito Cantina:', err)
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  async function handleSalvarAcesso(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await atualizarConfiguracaoAcesso(acessoPerfis)
      setSuccess('Configuração de acesso salva. Apenas os perfis marcados poderão fazer login.')
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function toggleAcessoPerfil(papel: PapelUsuario) {
    setAcessoPerfis((prev) =>
      prev.includes(papel) ? prev.filter((p) => p !== papel) : [...prev, papel]
    )
  }

  function toggleExcecaoTurma(turmaId: string) {
    setProdutosCreditoConfig((prev) => {
      const list = prev.excecoes_turma_ids.includes(turmaId)
        ? prev.excecoes_turma_ids.filter((id) => id !== turmaId)
        : [...prev.excecoes_turma_ids, turmaId]
      return { ...prev, excecoes_turma_ids: list }
    })
  }

  async function carregarRegrasParcelamento() {
    setParcelamentoLoading(true)
    try {
      const regras = await listarRegrasParcelamento()
      setRegrasParcelamento(regras)
    } finally {
      setParcelamentoLoading(false)
    }
  }

  async function handleSalvarParcelamento(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = regrasParcelamento.map((r, i) => ({
        valor_min: r.valor_min,
        valor_max: r.valor_max,
        max_parcelas: r.max_parcelas,
        tipo: r.tipo,
        taxa_juros_pct: r.tipo === 'COM_JUROS' ? (r.taxa_juros_pct ?? 0) : null,
        ordem: i,
      }))
      const res = await salvarRegrasParcelamento(payload)
      if (!res.ok) {
        setError(res.erro ?? 'Erro ao salvar')
        return
      }
      setSuccess('Regras de parcelamento salvas com sucesso!')
      setTimeout(() => setSuccess(null), 3000)
      await carregarRegrasParcelamento()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function adicionarRegraParcelamento() {
    const vMin = parseFloat(novaRegra.valor_min.replace(',', '.')) || 0
    const vMax = novaRegra.valor_max.trim() === '' ? null : parseFloat(novaRegra.valor_max.replace(',', '.'))
    if (vMin < 0) {
      setError('Valor mínimo deve ser >= 0')
      return
    }
    if (vMax != null && vMax < vMin) {
      setError('Valor máximo deve ser >= valor mínimo')
      return
    }
    if (novaRegra.tipo === 'COM_JUROS') {
      const taxa = parseFloat(novaRegra.taxa_juros_pct.replace(',', '.')) || 0
      if (taxa < 0 || taxa > 100) {
        setError('Taxa de juros deve ser entre 0 e 100%')
        return
      }
    }
    setRegrasParcelamento((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        valor_min: vMin,
        valor_max: vMax,
        max_parcelas: novaRegra.max_parcelas,
        tipo: novaRegra.tipo,
        taxa_juros_pct: novaRegra.tipo === 'COM_JUROS' ? (parseFloat(novaRegra.taxa_juros_pct.replace(',', '.')) || 0) : null,
        ordem: prev.length,
      },
    ])
    setNovaRegra({
      valor_min: vMax != null ? String(vMax) : novaRegra.valor_min,
      valor_max: '',
      max_parcelas: 3,
      tipo: 'SEM_JUROS',
      taxa_juros_pct: '',
    })
    setError(null)
  }

  async function handleRemoverRegraParcelamento(id: string) {
    if (!confirm('Remover esta regra?')) return
    if (id.startsWith('temp-')) {
      setRegrasParcelamento((prev) => prev.filter((r) => r.id !== id))
      return
    }
    const res = await removerRegraParcelamento(id)
    if (!res.ok) setError(res.erro ?? 'Erro ao remover')
    else await carregarRegrasParcelamento()
  }

  const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  async function carregarDepartamentos() {
    if (!empresaId) return
    setLoadingDepartamentos(true)
    try {
      const list = await listarDepartamentosComSegmentos(empresaId)
      setDepartamentos(list)
    } catch {
      setDepartamentos([])
    } finally {
      setLoadingDepartamentos(false)
    }
  }

  async function handleCriarDepartamento(e: React.FormEvent) {
    e.preventDefault()
    if (!empresaId || !novoDepartamentoNome.trim()) return
    setError(null)
    setSuccess(null)
    try {
      await criarDepartamento(empresaId, { nome: novoDepartamentoNome.trim(), ordem: departamentos.length })
      setNovoDepartamentoNome('')
      setSuccess('Departamento criado.')
      setTimeout(() => setSuccess(null), 3000)
      await carregarDepartamentos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar departamento')
    }
  }

  async function handleRemoverDepartamento(id: string) {
    if (!confirm('Remover este departamento e todos os seus segmentos?')) return
    setError(null)
    try {
      await removerDepartamento(id)
      setSuccess('Departamento removido.')
      setTimeout(() => setSuccess(null), 3000)
      await carregarDepartamentos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover')
    }
  }

  function toggleExpandirDepartamento(id: string) {
    setDepartamentosExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCriarSegmento(departamentoId: string) {
    const nome = (novoSegmentoPorDep[departamentoId] || '').trim()
    if (!nome) return
    setError(null)
    setSuccess(null)
    try {
      const dep = departamentos.find((d) => d.id === departamentoId)
      const ordem = dep ? dep.segmentos.length : 0
      await criarSegmento(departamentoId, { nome, ordem })
      setNovoSegmentoPorDep((prev) => ({ ...prev, [departamentoId]: '' }))
      setSuccess('Segmento adicionado.')
      setTimeout(() => setSuccess(null), 3000)
      await carregarDepartamentos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar segmento')
    }
  }

  async function handleRemoverSegmento(id: string) {
    if (!confirm('Remover este segmento?')) return
    setError(null)
    try {
      await removerSegmento(id)
      setSuccess('Segmento removido.')
      setTimeout(() => setSuccess(null), 3000)
      await carregarDepartamentos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover')
    }
  }

  const tiposCursoDistintos = [...new Set(turmasParaExcecao.map((t) => t.tipo_curso).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const turmasFiltradas =
    filtroTipoCurso === ''
      ? turmasParaExcecao
      : turmasParaExcecao.filter((t) => (t.tipo_curso || '') === filtroTipoCurso)

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Carregando configurações...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Configurações do Sistema</h1>
        <p className="text-muted-foreground">
          Gerencie as configurações gerais da loja, aparência e produtos
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 rounded-md text-sm">
          {success}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="aparencia">Aparência</TabsTrigger>
          <TabsTrigger value="produtos-credito">Produtos / Crédito Cantina</TabsTrigger>
          <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
          <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
          <TabsTrigger value="acesso">Configurar acesso</TabsTrigger>
        </TabsList>

        {/* Aba de Aparência */}
        <TabsContent value="aparencia">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Aparência</CardTitle>
              <CardDescription>
                Personalize a aparência da loja: nome, logo e favicon
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSalvarAparencia} className="space-y-6">
                {/* Nome da Loja */}
                <div>
                  <Label htmlFor="loja_nome">Nome da Loja *</Label>
                  <Input
                    id="loja_nome"
                    type="text"
                    value={aparenciaConfig.loja_nome}
                    onChange={(e) => setAparenciaConfig({ ...aparenciaConfig, loja_nome: e.target.value })}
                    placeholder="Ex: Loja da Escola"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Nome que aparece no header da loja e nos emails
                  </p>
                </div>

                {/* Logo */}
                <div>
                  <Label htmlFor="loja_logo_url">Logo da Loja</Label>
                  <div className="space-y-2 mt-1">
                    {aparenciaConfig.loja_logo_url && (
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                        <img 
                          src={aparenciaConfig.loja_logo_url} 
                          alt="Logo preview" 
                          className="max-h-16 object-contain"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            if (aparenciaConfig.loja_logo_url?.includes('supabase.co/storage')) {
                              await deletarImagem(aparenciaConfig.loja_logo_url, 'loja')
                            }
                            setAparenciaConfig({ ...aparenciaConfig, loja_logo_url: '' })
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setUploadingLogo(true)
                          try {
                            const url = await uploadImagem(file, 'loja', 'logo')
                            if (aparenciaConfig.loja_logo_url?.includes('supabase.co/storage')) {
                              await deletarImagem(aparenciaConfig.loja_logo_url, 'loja')
                            }
                            setAparenciaConfig(prev => ({ ...prev, loja_logo_url: url }))
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Erro ao fazer upload')
                          } finally {
                            setUploadingLogo(false)
                            if (logoInputRef.current) logoInputRef.current.value = ''
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        {uploadingLogo ? 'Enviando...' : 'Fazer upload do logo'}
                      </Button>
                      <div className="flex-1 min-w-[200px]">
                        <Input
                          type="url"
                          placeholder="Ou cole a URL do logo"
                          value={aparenciaConfig.loja_logo_url}
                          onChange={(e) => setAparenciaConfig({ ...aparenciaConfig, loja_logo_url: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      PNG transparente recomendado (200x50px). Máx: 5MB
                    </p>
                  </div>
                </div>

                {/* Favicon */}
                <div>
                  <Label htmlFor="loja_favicon_url">Favicon da Loja</Label>
                  <div className="space-y-2 mt-1">
                    {aparenciaConfig.loja_favicon_url && (
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                        <img 
                          src={aparenciaConfig.loja_favicon_url} 
                          alt="Favicon preview" 
                          className="w-8 h-8 object-contain"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            if (aparenciaConfig.loja_favicon_url?.includes('supabase.co/storage')) {
                              await deletarImagem(aparenciaConfig.loja_favicon_url, 'loja')
                            }
                            setAparenciaConfig({ ...aparenciaConfig, loja_favicon_url: '' })
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <input
                        ref={faviconInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setUploadingFavicon(true)
                          try {
                            const url = await uploadImagem(file, 'loja', 'favicon')
                            if (aparenciaConfig.loja_favicon_url?.includes('supabase.co/storage')) {
                              await deletarImagem(aparenciaConfig.loja_favicon_url, 'loja')
                            }
                            setAparenciaConfig(prev => ({ ...prev, loja_favicon_url: url }))
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Erro ao fazer upload')
                          } finally {
                            setUploadingFavicon(false)
                            if (faviconInputRef.current) faviconInputRef.current.value = ''
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => faviconInputRef.current?.click()}
                        disabled={uploadingFavicon}
                      >
                        {uploadingFavicon ? 'Enviando...' : 'Fazer upload do favicon'}
                      </Button>
                      <div className="flex-1 min-w-[200px]">
                        <Input
                          type="url"
                          placeholder="Ou cole a URL do favicon"
                          value={aparenciaConfig.loja_favicon_url}
                          onChange={(e) => setAparenciaConfig({ ...aparenciaConfig, loja_favicon_url: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ICO ou PNG (32x32px). Máx: 5MB
                    </p>
                  </div>
                </div>

                <Button type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Configurações de Aparência'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Produtos / Crédito Cantina */}
        <TabsContent value="produtos-credito">
          <Card>
            <CardHeader>
              <CardTitle>Produtos / Crédito Cantina</CardTitle>
              <CardDescription>
                Configure o Lanche do Dia e quais segmentos têm acesso à funcionalidade Crédito Cantina na loja
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSalvarProdutosCredito} className="space-y-8">
                {/* Lanche do Dia */}
                <div className="space-y-2">
                  <Label>Lanche do Dia</Label>
                  <p className="text-sm text-muted-foreground">
                    Produto exibido como &quot;Lanche do Dia&quot; na página da Loja. Apenas um por vez.
                  </p>
                  <Select
                    value={produtosCreditoConfig.lanche_do_dia_produto_id || 'nenhum'}
                    onValueChange={(v) =>
                      setProdutosCreditoConfig((prev) => ({
                        ...prev,
                        lanche_do_dia_produto_id: v === 'nenhum' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Nenhum</SelectItem>
                      {produtosOpcoes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Lista de exceção: turmas que NÃO têm acesso ao Crédito Cantina */}
                <div className="space-y-2">
                  <Label>Lista de exceção: turmas sem acesso ao Crédito Cantina</Label>
                  <p className="text-sm text-muted-foreground">
                    Por padrão todas as turmas têm acesso. Marque as turmas que <strong>não</strong> devem ver o botão nem acessar /loja/credito-cantina. Filtre por tipo de curso (coluna tipo_curso) e marque turmas específicas (coluna descrição).
                  </p>
                  {turmasParaExcecao.length === 0 ? (
                    <p className="text-sm text-muted-foreground pt-2">Nenhuma turma cadastrada. Cadastre turmas no admin.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 pt-2">
                        <Label className="text-sm font-normal text-muted-foreground">Filtrar por tipo de curso:</Label>
                        <Select value={filtroTipoCurso || 'todos'} onValueChange={(v) => setFiltroTipoCurso(v === 'todos' ? '' : v)}>
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos</SelectItem>
                            {tiposCursoDistintos.map((tc) => (
                              <SelectItem key={tc} value={tc}>
                                {tc}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="border rounded-md divide-y max-h-[320px] overflow-y-auto mt-2">
                        {turmasFiltradas.map((turma, idx) => (
                          <div key={turma.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50">
                            <div className="flex items-center space-x-2 min-w-0 flex-1">
                              <Checkbox
                                id={`excecao-${turma.id}`}
                                checked={produtosCreditoConfig.excecoes_turma_ids.includes(turma.id)}
                                onCheckedChange={() => toggleExcecaoTurma(turma.id)}
                              />
                              <Label htmlFor={`excecao-${turma.id}`} className="cursor-pointer font-normal truncate">
                                {turma.descricao}
                              </Label>
                            </div>
                            {turma.tipo_curso && (
                              <span className="text-xs text-muted-foreground shrink-0">{turma.tipo_curso}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {turmasFiltradas.length === 0 && filtroTipoCurso !== '' && (
                        <p className="text-sm text-muted-foreground pt-1">Nenhuma turma com este tipo de curso.</p>
                      )}
                    </>
                  )}
                </div>

                {/* Permitir compra com saldo negativo no PDV */}
                <div className="space-y-2">
                  <Label>Permitir compra com saldo negativo no PDV?</Label>
                  <p className="text-sm text-muted-foreground">
                    Se NÃO, a venda é bloqueada quando o aluno não tem saldo suficiente. Se SIM, pode definir um limite máximo (em R$) de saldo negativo.
                  </p>
                  <div className="flex gap-6 items-center pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="permitir_saldo_negativo"
                        checked={!produtosCreditoConfig.permitir_saldo_negativo}
                        onChange={() =>
                          setProdutosCreditoConfig((p) => ({ ...p, permitir_saldo_negativo: false }))
                        }
                        className="rounded-full"
                      />
                      <span className="text-sm font-medium">NÃO</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="permitir_saldo_negativo"
                        checked={produtosCreditoConfig.permitir_saldo_negativo}
                        onChange={() =>
                          setProdutosCreditoConfig((p) => ({ ...p, permitir_saldo_negativo: true }))
                        }
                        className="rounded-full"
                      />
                      <span className="text-sm font-medium">SIM</span>
                    </label>
                  </div>
                  {produtosCreditoConfig.permitir_saldo_negativo && (
                    <div className="pt-3 flex items-center gap-2">
                      <Label htmlFor="limite_saldo_negativo" className="text-sm font-normal">
                        Limite máximo permitido (R$)
                      </Label>
                      <Input
                        id="limite_saldo_negativo"
                        type="number"
                        min={0}
                        step={0.01}
                        value={produtosCreditoConfig.limite_saldo_negativo === 0 ? '' : produtosCreditoConfig.limite_saldo_negativo}
                        onChange={(e) => {
                          const v = e.target.value.trim() === '' ? 0 : parseFloat(e.target.value.replace(',', '.'))
                          setProdutosCreditoConfig((p) => ({
                            ...p,
                            limite_saldo_negativo: Number.isFinite(v) && v >= 0 ? v : 0,
                          }))
                        }}
                        placeholder="Ex: 50"
                        className="w-32"
                      />
                    </div>
                  )}
                </div>

                {/* Alunos com saldo negativo ilimitado */}
                <div className="space-y-2">
                  <Label>Alunos com saldo negativo ilimitado</Label>
                  <p className="text-sm text-muted-foreground">
                    Estes alunos podem comprar na cantina com saldo negativo sem limite e independente do bloqueio do responsável.
                  </p>
                  <div className="flex gap-2 flex-wrap items-center pt-2">
                    <Input
                      type="text"
                      placeholder="Buscar por nome ou prontuário..."
                      value={buscaAlunoIlimitado}
                      onChange={(e) => setBuscaAlunoIlimitado(e.target.value)}
                      onFocus={() => {
                        if (buscaAlunoIlimitado.trim().length >= 2) {
                          setBuscandoAlunoIlimitado(true)
                          buscarAlunosParaCreditoIlimitado(buscaAlunoIlimitado.trim())
                            .then(setBuscaAlunoIlimitadoResultados)
                            .finally(() => setBuscandoAlunoIlimitado(false))
                        }
                      }}
                      className="max-w-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (buscaAlunoIlimitado.trim().length < 2) return
                        setBuscandoAlunoIlimitado(true)
                        buscarAlunosParaCreditoIlimitado(buscaAlunoIlimitado.trim())
                          .then((list) => {
                            setBuscaAlunoIlimitadoResultados(list)
                            setBuscandoAlunoIlimitado(false)
                          })
                          .catch(() => setBuscandoAlunoIlimitado(false))
                      }}
                      disabled={buscandoAlunoIlimitado}
                    >
                      {buscandoAlunoIlimitado ? 'Buscando...' : 'Buscar'}
                    </Button>
                  </div>
                  {buscaAlunoIlimitadoResultados.length > 0 && (
                    <ul className="border rounded-md divide-y max-h-40 overflow-y-auto mt-2">
                      {buscaAlunoIlimitadoResultados
                        .filter((a) => !produtosCreditoConfig.alunos_saldo_negativo_ilimitado_ids.includes(a.id))
                        .map((a) => (
                          <li key={a.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/50">
                            <span className="text-sm">
                              {a.nome} {a.prontuario && `(${a.prontuario})`}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setProdutosCreditoConfig((p) => ({
                                  ...p,
                                  alunos_saldo_negativo_ilimitado_ids: [...p.alunos_saldo_negativo_ilimitado_ids, a.id],
                                }))
                                setAlunosIlimitadosList((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]))
                                setBuscaAlunoIlimitadoResultados((prev) => prev.filter((x) => x.id !== a.id))
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      {buscaAlunoIlimitadoResultados.every((a) =>
                        produtosCreditoConfig.alunos_saldo_negativo_ilimitado_ids.includes(a.id)
                      ) &&
                        buscaAlunoIlimitadoResultados.length > 0 && (
                          <li className="px-3 py-2 text-sm text-muted-foreground">
                            Todos já estão na lista.
                          </li>
                        )}
                    </ul>
                  )}
                  {alunosIlimitadosList.length > 0 && (
                    <div className="border rounded-md divide-y max-h-48 overflow-y-auto mt-3">
                      <p className="text-xs text-muted-foreground px-3 py-2 bg-muted/50 font-medium">
                        Alunos cadastrados ({alunosIlimitadosList.length})
                      </p>
                      {alunosIlimitadosList.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between px-3 py-2 hover:bg-muted/30"
                        >
                          <span className="text-sm">
                            {a.nome} {a.prontuario && `(${a.prontuario})`}
                            {a.turma_descricao && (
                              <span className="text-muted-foreground ml-1">— {a.turma_descricao}</span>
                            )}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setProdutosCreditoConfig((p) => ({
                                ...p,
                                alunos_saldo_negativo_ilimitado_ids: p.alunos_saldo_negativo_ilimitado_ids.filter(
                                  (id) => id !== a.id
                                ),
                              }))
                              setAlunosIlimitadosList((prev) => prev.filter((x) => x.id !== a.id))
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Pagamento - Parcelamento */}
        <TabsContent value="pagamento">
          <Card>
            <CardHeader>
              <CardTitle>Configuração de Parcelamento</CardTitle>
              <CardDescription>
                Defina regras de parcelamento por faixa de valor. O sistema aplica automaticamente a regra conforme o total do pedido no checkout. Máximo 10x. Não pode haver sobreposição de faixas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {parcelamentoLoading && <p className="text-sm text-muted-foreground">Carregando regras...</p>}

              <div className="space-y-4">
                <Label>Nova regra</Label>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
                  <div>
                    <Label htmlFor="parc_valor_min" className="text-xs">Valor mín. (R$)</Label>
                    <Input
                      id="parc_valor_min"
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={novaRegra.valor_min}
                      onChange={(e) => setNovaRegra((r) => ({ ...r, valor_min: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="parc_valor_max" className="text-xs">Valor máx. (R$) — opcional</Label>
                    <Input
                      id="parc_valor_max"
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex: 100"
                      value={novaRegra.valor_max}
                      onChange={(e) => setNovaRegra((r) => ({ ...r, valor_max: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="parc_max_parcelas" className="text-xs">Até quantas parcelas</Label>
                    <Select
                      value={String(novaRegra.max_parcelas)}
                      onValueChange={(v) => setNovaRegra((r) => ({ ...r, max_parcelas: parseInt(v, 10) }))}
                    >
                      <SelectTrigger id="parc_max_parcelas" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <SelectItem key={n} value={String(n)}>Até {n}x</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <div className="flex gap-3 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="parc_tipo"
                          checked={novaRegra.tipo === 'SEM_JUROS'}
                          onChange={() => setNovaRegra((r) => ({ ...r, tipo: 'SEM_JUROS', taxa_juros_pct: '' }))}
                          className="rounded-full"
                        />
                        <span className="text-sm">Sem juros</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="parc_tipo"
                          checked={novaRegra.tipo === 'COM_JUROS'}
                          onChange={() => setNovaRegra((r) => ({ ...r, tipo: 'COM_JUROS' }))}
                          className="rounded-full"
                        />
                        <span className="text-sm">Com juros</span>
                      </label>
                    </div>
                  </div>
                  {novaRegra.tipo === 'COM_JUROS' && (
                    <div>
                      <Label htmlFor="parc_taxa" className="text-xs">Taxa de parcelamento (%)</Label>
                      <Input
                        id="parc_taxa"
                        type="text"
                        inputMode="decimal"
                        placeholder="Ex: 2,5"
                        value={novaRegra.taxa_juros_pct}
                        onChange={(e) => setNovaRegra((r) => ({ ...r, taxa_juros_pct: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  )}
                  <Button type="button" variant="secondary" onClick={adicionarRegraParcelamento}>
                    Adicionar regra
                  </Button>
                </div>
              </div>

              <form onSubmit={handleSalvarParcelamento} className="space-y-4">
                {regrasParcelamento.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada. Adicione acima e salve.</p>
                ) : (
                  <div className="space-y-2">
                    <Label>Regras atuais (ordem de aplicação)</Label>
                    <ul className="border rounded-md divide-y">
                      {regrasParcelamento.map((r, i) => (
                        <li key={r.id} className="flex items-center justify-between gap-4 px-3 py-2 hover:bg-muted/50">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">
                              De {formatBRL(r.valor_min)} até {r.valor_max != null ? formatBRL(r.valor_max) : 'acima'}
                            </span>
                            <span className="text-muted-foreground text-sm ml-2">
                              — Até {r.max_parcelas}x {r.tipo === 'SEM_JUROS' ? 'sem juros' : `com taxa de parcelamento de ${Number(r.taxa_juros_pct ?? 0).toFixed(1).replace('.', ',')}%`}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive shrink-0"
                            onClick={() => handleRemoverRegraParcelamento(r.id)}
                          >
                            Remover
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button type="submit" disabled={saving || regrasParcelamento.length === 0}>
                  {saving ? 'Salvando...' : 'Salvar regras de parcelamento'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Departamentos */}
        <TabsContent value="departamentos">
          <Card>
            <CardHeader>
              <CardTitle>Departamentos e Segmentos</CardTitle>
              <CardDescription>
                Organize a estrutura da instituição em departamentos (ex.: Pedagógico, Administrativo) e segmentos dentro de cada um (ex.: EFAF, EFAI, Infantil, TI, Secretaria).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!empresaId ? (
                <p className="text-sm text-muted-foreground">Nenhuma empresa selecionada. Configure o admin com uma empresa.</p>
              ) : loadingDepartamentos ? (
                <p className="text-sm text-muted-foreground">Carregando departamentos...</p>
              ) : (
                <>
                  <form onSubmit={handleCriarDepartamento} className="flex gap-2 flex-wrap items-end">
                    <div className="flex-1 min-w-[200px]">
                      <Label htmlFor="novo-dep-nome">Novo departamento</Label>
                      <Input
                        id="novo-dep-nome"
                        value={novoDepartamentoNome}
                        onChange={(e) => setNovoDepartamentoNome(e.target.value)}
                        placeholder="Ex: Pedagógico"
                      />
                    </div>
                    <Button type="submit" disabled={!novoDepartamentoNome.trim()}>
                      <Plus className="h-4 w-4 mr-1" />
                      Criar departamento
                    </Button>
                  </form>

                  <div className="border rounded-lg divide-y">
                    {departamentos.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        Nenhum departamento cadastrado. Crie um acima.
                      </div>
                    ) : (
                      departamentos.map((dep) => {
                        const expandido = departamentosExpandidos.has(dep.id)
                        return (
                          <div key={dep.id} className="bg-card">
                            <div className="flex items-center gap-2 p-3 hover:bg-muted/50">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0"
                                onClick={() => toggleExpandirDepartamento(dep.id)}
                              >
                                {expandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                              <span className="font-medium flex-1">{dep.nome}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleRemoverDepartamento(dep.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            {expandido && (
                              <div className="pl-10 pr-3 pb-3 space-y-2">
                                <div className="text-xs text-muted-foreground mb-2">Segmentos</div>
                                {dep.segmentos.map((seg) => (
                                  <div key={seg.id} className="flex items-center gap-2 py-1.5 pl-3 border-l-2 border-muted">
                                    <span className="flex-1 text-sm">{seg.nome}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-destructive hover:text-destructive"
                                      onClick={() => handleRemoverSegmento(seg.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                                <form
                                  className="flex gap-2 pt-2"
                                  onSubmit={(e) => {
                                    e.preventDefault()
                                    handleCriarSegmento(dep.id)
                                  }}
                                >
                                  <Input
                                    value={novoSegmentoPorDep[dep.id] || ''}
                                    onChange={(e) => setNovoSegmentoPorDep((prev) => ({ ...prev, [dep.id]: e.target.value }))}
                                    placeholder="Nome do segmento"
                                    className="text-sm"
                                  />
                                  <Button type="submit" size="sm" disabled={!(novoSegmentoPorDep[dep.id] || '').trim()}>
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </form>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Configurar acesso */}
        <TabsContent value="acesso">
          <Card>
            <CardHeader>
              <CardTitle>Configurar acesso ao login</CardTitle>
              <CardDescription>
                Marque os perfis que podem fazer login na plataforma. Quem não estiver selecionado verá uma mensagem de que a plataforma está em manutenção ao tentar entrar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSalvarAcesso} className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Perfis permitidos a acessar a tela de login:
                  </p>
                  <div className="border rounded-lg divide-y max-w-md">
                    {(Object.entries(CANTINA_PAPEIS) as [PapelUsuario, typeof CANTINA_PAPEIS[PapelUsuario]][]).map(([papel, config]) => (
                      <div key={papel} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                        <Checkbox
                          id={`acesso-${papel}`}
                          checked={acessoPerfis.includes(papel)}
                          onCheckedChange={() => toggleAcessoPerfil(papel)}
                        />
                        <Label htmlFor={`acesso-${papel}`} className="cursor-pointer flex-1 font-normal">
                          <span className="font-medium">{config.label}</span>
                          <span className="text-muted-foreground text-sm block">{config.description}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se nenhum perfil estiver marcado, ninguém conseguirá fazer login. Deixe todos marcados para não restringir.
                  </p>
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar configuração de acesso'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
