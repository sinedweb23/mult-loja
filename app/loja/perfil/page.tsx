'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { obterMeuPerfil, type UsuarioCompleto } from '@/app/actions/responsavel'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'
import { LojaHeader } from '@/components/loja/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { KeyRound, Eye, EyeOff } from 'lucide-react'

export default function PerfilPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [usuario, setUsuario] = useState<UsuarioCompleto | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Trocar senha
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novaSenhaRepetir, setNovaSenhaRepetir] = useState('')
  const [trocarSenhaLoading, setTrocarSenhaLoading] = useState(false)
  const [trocarSenhaErro, setTrocarSenhaErro] = useState<string | null>(null)
  const [trocarSenhaSucesso, setTrocarSenhaSucesso] = useState(false)
  const [mostrarSenhaAtual, setMostrarSenhaAtual] = useState(false)
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false)
  const [mostrarNovaSenhaRepetir, setMostrarNovaSenhaRepetir] = useState(false)

  useEffect(() => {
    const papel = typeof document !== 'undefined'
      ? document.cookie.split('; ').find((r) => r.startsWith(`${PAPEL_COOKIE}=`))?.split('=')[1]
      : null
    if (papel === 'COLABORADOR') {
      router.replace('/loja/colaborador')
      return
    }
    carregarPerfil()
  }, [])

  async function carregarPerfil() {
    try {
      setLoading(true)
      setError(null)
      const dados = await obterMeuPerfil()
      setUsuario(dados)
    } catch (err) {
      console.error('Erro ao carregar perfil:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar perfil')
    } finally {
      setLoading(false)
    }
  }

  function formatCPF(cpf: string | null) {
    if (!cpf) return 'Não informado'
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  function formatPhone(phone: string | null) {
    if (!phone) return 'Não informado'
    return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault()
    setTrocarSenhaErro(null)
    setTrocarSenhaSucesso(false)
    if (!senhaAtual.trim()) {
      setTrocarSenhaErro('Digite a senha atual.')
      return
    }
    if (!novaSenha.trim()) {
      setTrocarSenhaErro('Digite a nova senha.')
      return
    }
    if (novaSenha.length < 6) {
      setTrocarSenhaErro('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (novaSenha !== novaSenhaRepetir) {
      setTrocarSenhaErro('A nova senha e a repetição não coincidem.')
      return
    }
    setTrocarSenhaLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const email = session?.user?.email
      if (!email) {
        setTrocarSenhaErro('Sessão inválida. Faça login novamente.')
        return
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senhaAtual,
      })
      if (signInError) {
        setTrocarSenhaErro('Senha atual incorreta.')
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha })
      if (updateError) {
        setTrocarSenhaErro(updateError.message || 'Erro ao atualizar senha.')
        return
      }
      setTrocarSenhaSucesso(true)
      setSenhaAtual('')
      setNovaSenha('')
      setNovaSenhaRepetir('')
    } catch (err) {
      setTrocarSenhaErro(err instanceof Error ? err.message : 'Erro ao trocar senha.')
    } finally {
      setTrocarSenhaLoading(false)
    }
  }

  if (loading) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Carregando perfil...</p>
          </div>
        </div>
      </>
    )
  }

  if (error || !usuario) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-destructive">{error || 'Erro ao carregar perfil'}</p>
              <Button onClick={carregarPerfil} className="mt-4">Tentar Novamente</Button>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <LojaHeader />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Minha Conta</h1>
          <p className="text-muted-foreground">
            Visualize seus dados pessoais e gerencie os dependentes vinculados à sua conta.
          </p>
        </div>

        <div className="grid gap-6">
          {/* Dados Pessoais */}
          <Card>
            <CardHeader>
              <CardTitle>Dados Pessoais</CardTitle>
              <CardDescription>Suas informações de contato</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Nome</label>
                  <p className="text-base font-semibold">
                    {usuario.nome || usuario.nome_financeiro || usuario.nome_pedagogico || 'Não informado'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Tipo de Responsável</label>
                  <p className="text-base font-semibold">
                    {usuario.tipo === 'FINANCEIRO' && 'Financeiro'}
                    {usuario.tipo === 'PEDAGOGICO' && 'Pedagógico'}
                    {usuario.tipo === 'AMBOS' && 'Financeiro e Pedagógico'}
                    {!usuario.tipo && 'Não informado'}
                  </p>
                </div>
              </div>

              {(usuario.tipo === 'FINANCEIRO' || usuario.tipo === 'AMBOS') && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase">Responsável financeiro</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Nome</label>
                      <p className="text-base">{usuario.nome_financeiro || 'Não informado'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">CPF</label>
                      <p className="text-base">{formatCPF(usuario.cpf_financeiro)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="text-base">{usuario.email_financeiro || 'Não informado'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Celular</label>
                      <p className="text-base">{formatPhone(usuario.celular_financeiro)}</p>
                    </div>
                  </div>
                </div>
              )}

              {(usuario.tipo === 'PEDAGOGICO' || usuario.tipo === 'AMBOS') && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase">Responsável Pedagógico</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Nome</label>
                      <p className="text-base">{usuario.nome_pedagogico || 'Não informado'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">CPF</label>
                      <p className="text-base">{formatCPF(usuario.cpf_pedagogico)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="text-base">{usuario.email_pedagogico || 'Não informado'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Celular</label>
                      <p className="text-base">{formatPhone(usuario.celular_pedagogico)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dependentes (Filhos) */}
          <Card>
            <CardHeader>
              <CardTitle>Dependentes</CardTitle>
              <CardDescription>
                Lista de dependentes vinculados à sua conta. Clique em &quot;Saldo e cantina&quot; para gerenciar cada um.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usuario.alunos && usuario.alunos.length > 0 ? (
                <div className="space-y-4">
                  {usuario.alunos.map((aluno: any) => (
                    <div
                      key={aluno.id}
                      className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1">{aluno.nome}</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Prontuário:</span> {aluno.prontuario}
                            </div>
                            {aluno.turmas && (
                              <div>
                                <span className="font-medium">Turma:</span> {aluno.turmas.descricao}
                              </div>
                            )}
                            {aluno.turmas?.segmento && (
                              <div>
                                <span className="font-medium">Segmento:</span>{' '}
                                {aluno.turmas.segmento === 'EDUCACAO_INFANTIL' && 'Educação Infantil'}
                                {aluno.turmas.segmento === 'FUNDAMENTAL' && 'Fundamental'}
                                {aluno.turmas.segmento === 'MEDIO' && 'Médio'}
                                {aluno.turmas.segmento === 'OUTRO' && 'Outro'}
                              </div>
                            )}
                            <div>
                              <span className="font-medium">Situação:</span>{' '}
                              <span className={`px-2 py-1 rounded text-xs ${
                                aluno.situacao === 'ATIVO'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {aluno.situacao}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Link href={`/loja/recarga?aluno=${aluno.id}`}>
                          <Button size="sm">Saldo e cantina</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Nenhum dependente vinculado à sua conta.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trocar senha */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Trocar senha
              </CardTitle>
              <CardDescription>
                Digite a senha atual e depois a nova senha duas vezes para alterar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTrocarSenha} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="senha-atual">Senha atual</Label>
                  <div className="relative">
                    <Input
                      id="senha-atual"
                      type={mostrarSenhaAtual ? 'text' : 'password'}
                      value={senhaAtual}
                      onChange={(e) => setSenhaAtual(e.target.value)}
                      placeholder="Digite sua senha atual"
                      autoComplete="current-password"
                      disabled={trocarSenhaLoading}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setMostrarSenhaAtual((v) => !v)}
                      aria-label={mostrarSenhaAtual ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {mostrarSenhaAtual ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nova-senha">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="nova-senha"
                      type={mostrarNovaSenha ? 'text' : 'password'}
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      placeholder="Digite a nova senha (mín. 6 caracteres)"
                      autoComplete="new-password"
                      disabled={trocarSenhaLoading}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setMostrarNovaSenha((v) => !v)}
                      aria-label={mostrarNovaSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {mostrarNovaSenha ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nova-senha-repetir">Repetir nova senha</Label>
                  <div className="relative">
                    <Input
                      id="nova-senha-repetir"
                      type={mostrarNovaSenhaRepetir ? 'text' : 'password'}
                      value={novaSenhaRepetir}
                      onChange={(e) => setNovaSenhaRepetir(e.target.value)}
                      placeholder="Repita a nova senha"
                      autoComplete="new-password"
                      disabled={trocarSenhaLoading}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setMostrarNovaSenhaRepetir((v) => !v)}
                      aria-label={mostrarNovaSenhaRepetir ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {mostrarNovaSenhaRepetir ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>
                {trocarSenhaErro && (
                  <p className="text-sm text-destructive">{trocarSenhaErro}</p>
                )}
                {trocarSenhaSucesso && (
                  <p className="text-sm text-green-600">Senha alterada com sucesso.</p>
                )}
                <Button type="submit" disabled={trocarSenhaLoading}>
                  {trocarSenhaLoading ? 'Salvando...' : 'Salvar nova senha'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
