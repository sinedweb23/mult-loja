import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const root = resolve(process.cwd())

function tornarPoliciesIdempotentes(sql) {
  return sql.replace(
    /(^|\n)(\s*)CREATE POLICY\s+"([^"]+)"\s+ON\s+([^\s]+)\s+/g,
    (_match, prefix, indent, nomePolicy, tabela) =>
      `${prefix}${indent}DROP POLICY IF EXISTS "${nomePolicy}" ON ${tabela};\n` +
      `${indent}CREATE POLICY "${nomePolicy}" ON ${tabela} `
  )
}

function expandirArquivo(caminhoEntrada, caminhoSaida, titulo) {
  const entradaAbs = resolve(root, caminhoEntrada)
  const saidaAbs = resolve(root, caminhoSaida)
  const conteudo = readFileSync(entradaAbs, 'utf8')
  const linhas = conteudo.split(/\r?\n/)

  const blocos = []

  for (const linha of linhas) {
    const trimmed = linha.trim()
    if (!trimmed || trimmed.startsWith('--')) continue

    const match = trimmed.match(/^\\i\s+(.+)$/)
    if (!match) continue

    const rel = match[1].trim()
    const arquivoMigration = resolve(root, rel)
    let sql = readFileSync(arquivoMigration, 'utf8').trim()
    sql = tornarPoliciesIdempotentes(sql)

    blocos.push(
      `-- =====================================================================\n` +
        `-- ${rel}\n` +
        `-- =====================================================================\n` +
        `${sql}\n`
    )
  }

  const cabecalho =
    `-- ${titulo}\n` +
    `-- Gerado automaticamente a partir de ${caminhoEntrada}\n` +
    `-- Este arquivo NAO usa comandos do psql (sem \\i).\n` +
    `-- Pode ser executado no SQL Editor do Supabase.\n\n` +
    `BEGIN;\n\n`

  const rodape = `\nCOMMIT;\n`
  const final = cabecalho + blocos.join('\n') + rodape

  writeFileSync(saidaAbs, final, 'utf8')
  console.log(`OK: ${caminhoSaida}`)
}

expandirArquivo(
  'criar_projeto.sql',
  'criar_projeto_monolitico.sql',
  'criar_projeto_monolitico.sql'
)

expandirArquivo(
  'criar_policies.sql',
  'criar_policies_monolitico.sql',
  'criar_policies_monolitico.sql'
)
