import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Carregar variáveis de ambiente do .env.local
config({ path: resolve(process.cwd(), '.env.local') })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'your_service_role_key') {
  console.error('❌ Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

async function criarDadosTeste() {
  console.log('🚀 Criando dados de teste...\n')

  // 1. Obter empresa existente ou criar
  let { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .limit(1)
    .single()

  if (!empresa) {
    const { data: novaEmpresa } = await supabase
      .from('empresas')
      .insert({ nome: 'Escola Teste', cnpj: '12345678000190' })
      .select()
      .single()
    empresa = novaEmpresa
  }

  if (!empresa) {
    console.error('❌ Erro ao obter/criar empresa')
    return
  }

  console.log('✅ Empresa:', empresa.id)

  // 2. Criar unidade
  const { data: unidade } = await supabase
    .from('unidades')
    .insert({
      empresa_id: empresa.id,
      nome: 'Unidade Centro'
    })
    .select()
    .single()

  if (!unidade) {
    console.error('❌ Erro ao criar unidade')
    return
  }

  console.log('✅ Unidade criada:', unidade.id)

  // 3. Criar turmas
  const turmas = [
    { descricao: 'Kindergarten 5', segmento: 'EDUCACAO_INFANTIL', tipo_curso: 'Infantil' },
    { descricao: '1º Ano Fundamental', segmento: 'FUNDAMENTAL', tipo_curso: 'Fundamental' }
  ]

  const turmasCriadas = []
  for (const turmaData of turmas) {
    const { data: turma } = await supabase
      .from('turmas')
      .insert({
        empresa_id: empresa.id,
        unidade_id: unidade.id,
        ...turmaData,
        situacao: 'ATIVA'
      })
      .select()
      .single()

    if (turma) {
      turmasCriadas.push(turma)
      console.log(`✅ Turma criada: ${turma.descricao}`)
    }
  }

  if (turmasCriadas.length === 0) {
    console.error('❌ Erro ao criar turmas')
    return
  }

  // 4. Criar alunos
  const alunos = [
    { nome: 'João Silva', prontuario: '2024001', turma: turmasCriadas[0] },
    { nome: 'Maria Santos', prontuario: '2024002', turma: turmasCriadas[1] }
  ]

  const alunosCriados = []
  for (const alunoData of alunos) {
    const { data: aluno } = await supabase
      .from('alunos')
      .insert({
        empresa_id: empresa.id,
        unidade_id: unidade.id,
        turma_id: alunoData.turma.id,
        nome: alunoData.nome,
        prontuario: alunoData.prontuario,
        situacao: 'ATIVO'
      })
      .select()
      .single()

    if (aluno) {
      alunosCriados.push(aluno)
      console.log(`✅ Aluno criado: ${aluno.nome} (${aluno.prontuario})`)
    }
  }

  if (alunosCriados.length === 0) {
    console.error('❌ Erro ao criar alunos')
    return
  }

  // 5. Vincular alunos ao responsável
  // Buscar usuário auth primeiro
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const responsavelAuthUser = authUsers?.users.find(u => u.email === 'responsavel@teste.com')

  if (!responsavelAuthUser) {
    console.error('❌ Usuário responsável não encontrado no Auth. Execute primeiro: npm run criar-usuarios')
    return
  }

  const { data: responsavel } = await supabase
    .from('responsaveis')
    .select('id')
    .eq('auth_user_id', responsavelAuthUser.id)
    .single()

  if (!responsavel) {
    console.error('❌ Responsável não encontrado na tabela. Execute primeiro: npm run criar-usuarios')
    return
  }

  for (const aluno of alunosCriados) {
    const { error } = await supabase
      .from('responsavel_aluno')
      .upsert({
        responsavel_id: responsavel.id,
        aluno_id: aluno.id
      }, {
        onConflict: 'responsavel_id,aluno_id'
      })

    if (error) {
      console.error(`⚠️  Erro ao vincular aluno ${aluno.nome}:`, error.message)
    } else {
      console.log(`✅ Aluno ${aluno.nome} vinculado ao responsável`)
    }
  }

  // 6. Criar produtos
  const produtos = [
    {
      nome: 'Kit Material Escolar 2024',
      tipo: 'KIT',
      descricao: 'Kit completo de material escolar',
      preco: 150.00,
      estoque: 100,
      compra_unica: true,
      limite_max_compra_unica: 1
    },
    {
      nome: 'Uniforme Escolar',
      tipo: 'PRODUTO',
      descricao: 'Uniforme completo (camiseta + calça)',
      preco: 80.00,
      estoque: 50,
      compra_unica: false
    },
    {
      nome: 'Aula de Inglês Extra',
      tipo: 'SERVICO',
      descricao: 'Aulas extras de inglês',
      preco: 200.00,
      estoque: 0,
      compra_unica: false
    }
  ]

  const produtosCriados = []
  for (const produtoData of produtos) {
    const { data: produto } = await supabase
      .from('produtos')
      .insert({
        empresa_id: empresa.id,
        unidade_id: unidade.id,
        ...produtoData,
        ativo: true
      })
      .select()
      .single()

    if (produto) {
      produtosCriados.push(produto)
      console.log(`✅ Produto criado: ${produto.nome}`)
    }
  }

  // 7. Criar disponibilidades
  // Produto 1: TODOS
  if (produtosCriados[0]) {
    await supabase
      .from('produto_disponibilidade')
      .insert({
        produto_id: produtosCriados[0].id,
        tipo: 'TODOS'
      })
    console.log('✅ Disponibilidade criada: Kit Material - TODOS')
  }

  // Produto 2: SEGMENTO (Educação Infantil)
  if (produtosCriados[1]) {
    await supabase
      .from('produto_disponibilidade')
      .insert({
        produto_id: produtosCriados[1].id,
        tipo: 'SEGMENTO',
        segmento: 'EDUCACAO_INFANTIL'
      })
    console.log('✅ Disponibilidade criada: Uniforme - SEGMENTO (Educação Infantil)')
  }

  // Produto 3: TURMA específica
  if (produtosCriados[2] && turmasCriadas[1]) {
    await supabase
      .from('produto_disponibilidade')
      .insert({
        produto_id: produtosCriados[2].id,
        tipo: 'TURMA',
        turma_id: turmasCriadas[1].id
      })
    console.log('✅ Disponibilidade criada: Aula Inglês - TURMA (1º Ano)')
  }

  console.log('\n' + '='.repeat(50))
  console.log('✅ DADOS DE TESTE CRIADOS COM SUCESSO!')
  console.log('='.repeat(50))
  console.log(`\n📚 Criados:`)
  console.log(`   - ${turmasCriadas.length} turmas`)
  console.log(`   - ${alunosCriados.length} alunos`)
  console.log(`   - ${produtosCriados.length} produtos`)
  console.log(`   - Vínculos responsável-aluno`)
  console.log(`\n🌐 Acesse: http://localhost:3000/loja`)
  console.log('\n')
}

criarDadosTeste()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro:', error)
    process.exit(1)
  })
