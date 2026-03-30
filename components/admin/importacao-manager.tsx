'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { listarLogsImportacao, importarDaAPIExterna, processarProximoLoteImportacao, testarConexaoAPIExterna, type ResultadoTesteConexao } from '@/app/actions/importacao'
import { getAdminData } from '@/app/actions/admin'
import { obterTokenAPIExterna, salvarTokenAPIExterna } from '@/app/actions/configuracoes'
import { listarEmpresas } from '@/app/actions/empresas'
import { CheckCircle2, XCircle, Clock, AlertCircle, Download, Loader2, Wifi } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ImportacaoLog {
  id: string
  tipo: string
  status: string
  total_registros: number
  registros_processados: number
  registros_criados: number
  registros_atualizados: number
  registros_com_erro: number
  iniciado_em: string
  finalizado_em: string | null
}

export function ImportacaoManager() {
  const [logs, setLogs] = useState<ImportacaoLog[]>([])
  const [loading, setLoading] = useState(false)
  const [importando, setImportando] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [apiUrlExterna, setApiUrlExterna] = useState('https://loja.escolamorumbisul.com.br/api/importacao.php')
  const [apiKeyExterna, setApiKeyExterna] = useState('')
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([])
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null)
  const [progresso, setProgresso] = useState(0)
  const [statusImportacao, setStatusImportacao] = useState<string>('')
  const [testandoConexao, setTestandoConexao] = useState(false)
  const [resultadoTeste, setResultadoTeste] = useState<ResultadoTesteConexao | null>(null)

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    try {
      const [adminData, empresasList, tokenSalvo] = await Promise.all([
        getAdminData().catch(() => null),
        listarEmpresas(),
        obterTokenAPIExterna(),
      ])
      const list = (empresasList || []).map((e: { id: string; nome: string }) => ({ id: e.id, nome: e.nome }))
      setEmpresas(list)
      const defaultEmpresaId = (adminData as { empresa_id?: string | null } | null)?.empresa_id ?? list[0]?.id ?? null
      setEmpresaId(defaultEmpresaId)
      if (tokenSalvo) setApiKeyExterna(tokenSalvo)
      if (defaultEmpresaId) {
        const logsData = await listarLogsImportacao(defaultEmpresaId)
        setLogs(logsData as ImportacaoLog[])
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'SUCESSO':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'ERRO':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'PARCIAL':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      default:
        return <Clock className="h-5 w-5 text-blue-500" />
    }
  }

  function formatarData(data: string | null) {
    if (!data) return '-'
    return new Date(data).toLocaleString('pt-BR')
  }

  async function handleImportarDaAPIExterna() {
    if (!apiUrlExterna || !apiKeyExterna || !empresaId) {
      setMensagem({ tipo: 'error', texto: 'Preencha a URL da API externa e a API Key' })
      return
    }

    setImportando(true)
    setMensagem(null)
    setProgresso(0)
    setStatusImportacao('Conectando...')

    let resultado: Awaited<ReturnType<typeof importarDaAPIExterna>> | null = null
    try {
      await salvarTokenAPIExterna(apiKeyExterna)
      setStatusImportacao('Baixando dados da API...')
      resultado = await importarDaAPIExterna(apiUrlExterna, apiKeyExterna, empresaId)

      if (resultado == null || resultado === undefined) {
        setMensagem({
          tipo: 'error',
          texto: 'O servidor não respondeu. Tente novamente.',
        })
        return
      }
      if (resultado.success === false) {
        setMensagem({ tipo: 'error', texto: resultado.error || 'Erro na importação.' })
        return
      }

      const total = resultado.total_alunos ?? resultado.total_registros ?? 0
      if (resultado.em_andamento && resultado.log_id && total > 0) {
        setStatusImportacao('Sincronizando em lotes...')
        setProgresso(10)
        const logId = resultado.log_id
        let processados = resultado.registros_processados ?? 0
        let cancelled = false
        const PAUSA_ENTRE_LOTES_MS = 3000

        ;(async () => {
          while (!cancelled) {
            try {
              const lote = await processarProximoLoteImportacao(logId)
              if (lote.success && lote.registros_processados != null) {
                processados = lote.registros_processados
                const pct = total > 0 ? Math.min(95, 10 + Math.round((processados / total) * 85)) : 50
                setProgresso(pct)
                setStatusImportacao(`Sincronizando... ${processados} / ${total}`)
              }
              if (lote.success === false) {
                setImportando(false)
                setProgresso(0)
                setStatusImportacao('')
                setMensagem({ tipo: 'error', texto: lote.error || 'Erro ao processar lote.' })
                carregarDados()
                return
              }
              if ((lote as any).done) {
                setProgresso(100)
                setStatusImportacao('Concluído!')
                const p = (lote as any).registros_processados ?? processados
                const c = (lote as any).registros_criados ?? 0
                const a = (lote as any).registros_atualizados ?? 0
                const e = (lote as any).registros_com_erro ?? 0
                setMensagem({
                  tipo: 'success',
                  texto: `Sincronização concluída. ${p} processados (${c} criados, ${a} atualizados${e > 0 ? `, ${e} com erro` : ''}).`,
                })
                setImportando(false)
                setTimeout(() => {
                  setProgresso(0)
                  setStatusImportacao('')
                }, 2000)
                carregarDados()
                return
              }
              await new Promise((r) => setTimeout(r, PAUSA_ENTRE_LOTES_MS))
            } catch (_) {
              await new Promise((r) => setTimeout(r, 2000))
            }
          }
        })()

        setTimeout(() => {
          cancelled = true
          setProgresso(0)
          setStatusImportacao('')
          setMensagem({ tipo: 'success', texto: 'Processamento em andamento. Atualize a página para ver o histórico.' })
          setImportando(false)
          carregarDados()
        }, 600000)
        return
      }

      setProgresso(100)
      setStatusImportacao('Concluído!')
      const p = resultado.registros_processados ?? resultado.total_registros ?? 0
      const c = resultado.registros_criados ?? 0
      const a = resultado.registros_atualizados ?? 0
      const e = resultado.registros_com_erro ?? 0
      setMensagem({
        tipo: 'success',
        texto: `Importação concluída. ${p} processados (${c} criados, ${a} atualizados${e > 0 ? `, ${e} com erro` : ''}). ${resultado.message ?? ''}`,
      })
      await carregarDados()
      setTimeout(() => {
        setProgresso(0)
        setStatusImportacao('')
      }, 2000)
    } catch (error: any) {
      console.error('Erro na importação:', error)
      let errorMessage = error?.message || error?.toString() || 'Erro ao importar'
      if (/timeout|fetch|network|Failed to fetch/i.test(errorMessage)) {
        errorMessage = 'O servidor não respondeu. Tente novamente.'
      }
      setProgresso(0)
      setStatusImportacao('')
      setMensagem({ tipo: 'error', texto: errorMessage })
    } finally {
      const emAndamento = resultado && resultado.success && 'em_andamento' in resultado && (resultado as { em_andamento?: boolean }).em_andamento
      if (!emAndamento) setImportando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Importação Manual da API Externa */}
      <Card>
        <CardHeader>
          <CardTitle>Importação da API Externa</CardTitle>
          <CardDescription>
            Consumir dados da API PHP e importar automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {empresas.length > 0 ? (
            <div>
              <Label>Empresa para importação</Label>
              <Select
                value={empresaId ?? ''}
                onValueChange={(v) => {
                  setEmpresaId(v || null)
                  if (v) listarLogsImportacao(v).then((logsData) => setLogs(logsData as ImportacaoLog[]))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Dados serão importados para esta empresa (alunos, turmas, responsáveis)
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 text-sm">
              Nenhuma empresa cadastrada. Cadastre uma empresa em Admin → Empresas antes de importar.
            </div>
          )}

          <div>
            <Label>URL da API Externa (PHP)</Label>
            <Input
              value={apiUrlExterna}
              onChange={(e) => setApiUrlExterna(e.target.value)}
              placeholder="https://loja.escolamorumbisul.com.br/api/importacao.php"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              URL da API PHP que fornece os dados (método GET)
            </p>
          </div>

          <div>
            <Label>API Key da API Externa</Label>
            <Input
              type="password"
              value={apiKeyExterna}
              onChange={(e) => setApiKeyExterna(e.target.value)}
              placeholder="Bearer token para autenticação"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Token de autenticação (Bearer Token) para acessar a API externa
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testandoConexao || importando || !apiUrlExterna || !apiKeyExterna}
              onClick={async () => {
                if (!apiUrlExterna || !apiKeyExterna) return
                setResultadoTeste(null)
                setTestandoConexao(true)
                try {
                  const r = await testarConexaoAPIExterna(apiUrlExterna, apiKeyExterna)
                  setResultadoTeste(r)
                } finally {
                  setTestandoConexao(false)
                }
              }}
            >
              {testandoConexao ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wifi className="h-4 w-4 mr-1" />}
              Testar conexão
            </Button>
            <span className="text-xs text-muted-foreground">
              Só faz GET na URL e mostra o que o servidor recebe (não importa nada)
            </span>
          </div>

          {resultadoTeste && (
            <div className={`p-3 rounded-md text-sm font-mono ${resultadoTeste.ok ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200'}`}>
              <div className="font-semibold">
                {resultadoTeste.ok ? 'Conexão OK' : 'Falha na conexão'}
                {resultadoTeste.status != null && ` — HTTP ${resultadoTeste.status}${resultadoTeste.statusText ? ` ${resultadoTeste.statusText}` : ''}`}
              </div>
              <div className="mt-1">Tamanho do corpo: {resultadoTeste.bodyLength} caracteres</div>
              <div className="mt-1">{resultadoTeste.detalhe}</div>
              {resultadoTeste.snippet != null && resultadoTeste.snippet !== '' && (
                <pre className="mt-2 p-2 bg-black/10 rounded text-xs overflow-x-auto break-all whitespace-pre-wrap">{resultadoTeste.snippet}</pre>
              )}
            </div>
          )}

          {mensagem && (
            <div className={`p-3 rounded-md ${
              mensagem.tipo === 'success' 
                ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200' 
                : 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200'
            }`}>
              {mensagem.texto}
            </div>
          )}

          {importando && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{statusImportacao}</span>
                <span className="font-medium">{progresso}%</span>
              </div>
              <Progress value={progresso} />
            </div>
          )}

          <Button 
            onClick={handleImportarDaAPIExterna}
            disabled={importando || !apiUrlExterna || !apiKeyExterna || !empresaId}
            className="w-full"
          >
            {importando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Importar da API Externa
              </>
            )}
          </Button>

          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-md">
            <h4 className="font-semibold mb-2">Como funciona:</h4>
            <ol className="text-sm space-y-1 list-decimal list-inside">
              <li>O sistema faz uma requisição <strong>GET</strong> para a URL da API externa (PHP)</li>
              <li>Envia o header <code className="bg-black/10 px-1 rounded">Authorization: Bearer {'{API Key}'}</code></li>
              <li>A API PHP deve retornar <strong>200</strong> e JSON com: <code className="bg-black/10 px-1 rounded">success: true</code>, <code className="bg-black/10 px-1 rounded">registros: [ ... ]</code></li>
              <li>Cada item em <code>registros</code> deve ter: <code>nomealuno</code>, <code>prontuario</code>, <code>descricaoturma</code> e dados dos responsáveis (ex.: <code>nomerespfin</code>, <code>cpfrespfin</code>, <code>emailrespfin</code>)</li>
              <li>Se o aluno vier com <code>situacao</code> diferente de <code>ATIVO</code>, ele será inativado aqui</li>
              <li>O sistema processa e importa (cria/atualiza alunos, turmas, responsáveis e vínculos) e cria um log</li>
            </ol>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-md">
            <h4 className="font-semibold mb-2">Resposta vazia ou erro?</h4>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>Confirme que a <strong>URL</strong> está correta e acessível (sem bloqueio CORS no servidor da API)</li>
              <li>A API Key deve ser exatamente a configurada no PHP (<code>API_IMPORTACAO_KEY</code> / Bearer)</li>
              <li>A API deve responder ao <strong>GET</strong> com <strong>Content-Type: application/json</strong></li>
              <li>O JSON deve ter <code>success: true</code> e <code>registros</code> (array, pode ser vazio)</li>
              <li>Se <code>registros</code> estiver vazio, a importação conclui sem erros e mostra 0 processados</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Documentação da API */}
      {/* Documentação da API */}
      <Card>
        <CardHeader>
          <CardTitle>API de Importação</CardTitle>
          <CardDescription>
            Endpoint para importação de dados de alunos, responsáveis e turmas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>URL do Endpoint da Sua Aplicação</Label>
            <Input
              value={apiUrl || (typeof window !== 'undefined' ? `${window.location.origin}/api/importacao` : '/api/importacao')}
              readOnly
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Esta é a URL que a API externa (PHP) deve chamar. Configure no código da API externa.
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
              ⚠️ A API externa deve fazer POST para esta URL, não o contrário.
            </p>
          </div>

          <div>
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Configure no .env.local como IMPORTACAO_API_KEY"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Configure a variável de ambiente IMPORTACAO_API_KEY no servidor
            </p>
          </div>

          <div className="bg-muted p-4 rounded-md">
            <h4 className="font-semibold mb-2">Formato do Payload:</h4>
            <pre className="text-xs overflow-x-auto">
{`POST /api/importacao
Content-Type: application/json
Authorization: Bearer {API_KEY}

{
  "empresa_id": "uuid-da-empresa",
  "api_key": "sua-api-key",
  "registros": [
    {
      "nomealuno": "João Silva",
      "prontuario": "12345",
      "descricaoturma": "Kindergarten 5",
      "tipocurso": "Educação Infantil",
      "situacao": "ATIVO",
      "nomerespfin": "Maria Silva",
      "cpfrespfin": "123.456.789-00",
      "emailrespfin": "maria@email.com",
      "logradourorespfin": "Rua Exemplo",
      "numerorespfin": "123",
      "bairrorespfin": "Centro",
      "cidaderespfin": "São Paulo",
      "estadorespfin": "SP",
      "ceprespfin": "01234-567",
      "celularrespfin": "(11) 98765-4321",
      "nomerespped": "Pedro Silva",
      "cpfrespped": "987.654.321-00",
      "emailrespped": "pedro@email.com",
      "logradourorespped": "Rua Exemplo",
      "numerorespped": "123",
      "bairrorespped": "Centro",
      "cidaderespped": "São Paulo",
      "estadorespped": "SP",
      "ceprespped": "01234-567",
      "celularrespped": "(11) 98765-4321"
    }
  ]
}`}
            </pre>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-md">
            <h4 className="font-semibold mb-2">Resposta de Sucesso:</h4>
            <pre className="text-xs overflow-x-auto">
{`{
  "success": true,
  "log_id": "uuid-do-log",
  "total_registros": 10,
  "registros_processados": 10,
  "registros_criados": 5,
  "registros_atualizados": 5,
  "registros_com_erro": 0
}`}
            </pre>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded-md">
            <h4 className="font-semibold mb-2">Características:</h4>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li><strong>Idempotente:</strong> Upsert por prontuario + cpf/email do responsável</li>
              <li><strong>Logs:</strong> Todas as importações são registradas com detalhes</li>
              <li><strong>Validação:</strong> Schema Zod valida todos os campos</li>
              <li><strong>Segmento:</strong> Mapeamento automático de tipocurso para segmento</li>
              <li><strong>Responsáveis:</strong> Cria/atualiza responsável financeiro e pedagógico</li>
              <li><strong>Endereços:</strong> Cria/atualiza endereços dos responsáveis</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Importações */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Importações</CardTitle>
          <CardDescription>
            Últimas importações realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhuma importação realizada ainda
            </p>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(log.status)}
                      <span className="font-semibold">{log.status}</span>
                      <span className="text-sm text-muted-foreground">
                        ({log.tipo})
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatarData(log.iniciado_em)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total:</span>
                      <div className="font-semibold">{log.total_registros}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Processados:</span>
                      <div className="font-semibold">{log.registros_processados}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Criados:</span>
                      <div className="font-semibold text-green-600">{log.registros_criados}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Atualizados:</span>
                      <div className="font-semibold text-blue-600">{log.registros_atualizados}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Erros:</span>
                      <div className="font-semibold text-red-600">{log.registros_com_erro}</div>
                    </div>
                  </div>
                  {log.finalizado_em && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Finalizado em: {formatarData(log.finalizado_em)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
