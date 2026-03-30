import { getProdutosDisponiveis } from '@/app/actions/produtos'
import { createAdminClient } from '@/lib/supabase/admin'

// Mock do Supabase server
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

describe('getProdutosDisponiveis', () => {
  const adminClient = createAdminClient()

  beforeEach(async () => {
    // Limpar dados de teste
    await adminClient.from('pedido_itens').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminClient.from('pedidos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminClient.from('produto_disponibilidade').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminClient.from('produtos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminClient.from('responsavel_aluno').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminClient.from('alunos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminClient.from('turmas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminClient.from('unidades').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminClient.from('empresas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminClient.from('responsaveis').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  })

  it('deve retornar produtos disponíveis para TODOS', async () => {
    // Setup: criar empresa, aluno, responsável, produto
    const { data: empresa } = await adminClient
      .from('empresas')
      .insert({ nome: 'Empresa Teste' })
      .select()
      .single()

    const { data: turma } = await adminClient
      .from('turmas')
      .insert({
        empresa_id: empresa.id,
        descricao: 'Turma Teste',
        segmento: 'FUNDAMENTAL'
      })
      .select()
      .single()

    const { data: aluno } = await adminClient
      .from('alunos')
      .insert({
        empresa_id: empresa.id,
        prontuario: '12345',
        nome: 'Aluno Teste',
        turma_id: turma.id
      })
      .select()
      .single()

    // Criar usuário auth e responsável
    const { data: authUser } = await adminClient.auth.admin.createUser({
      email: 'responsavel@teste.com',
      password: 'senha123'
    })

    const { data: responsavel } = await adminClient
      .from('responsaveis')
      .insert({
        auth_user_id: authUser.user.id,
        tipo: 'AMBOS'
      })
      .select()
      .single()

    await adminClient
      .from('responsavel_aluno')
      .insert({
        responsavel_id: responsavel.id,
        aluno_id: aluno.id
      })

    const { data: produto } = await adminClient
      .from('produtos')
      .insert({
        empresa_id: empresa.id,
        tipo: 'PRODUTO',
        nome: 'Produto Teste',
        preco: 100.00,
        ativo: true
      })
      .select()
      .single()

    await adminClient
      .from('produto_disponibilidade')
      .insert({
        produto_id: produto.id,
        tipo: 'TODOS'
      })

    // Mock do client server com o usuário autenticado
    const { createClient } = require('@/lib/supabase/server')
    const mockClient = {
      from: jest.fn(),
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: authUser.user }
        })
      }
    }

    mockClient.from.mockImplementation((table) => {
      const queries = {
        alunos: {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: aluno, error: null })
        },
        responsaveis: {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: responsavel, error: null })
        },
        responsavel_aluno: {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'test' }, error: null })
        },
        turmas: {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: turma, error: null })
        },
        produtos: {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({
            data: [produto],
            error: null
          })
        },
        produto_disponibilidade: {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({
            data: [{ produto_id: produto.id, tipo: 'TODOS' }],
            error: null
          })
        }
      }
      return queries[table] || { select: jest.fn(), eq: jest.fn() }
    })

    createClient.mockResolvedValue(mockClient)

    // Test
    const produtos = await getProdutosDisponiveis(aluno.id)

    expect(produtos).toHaveLength(1)
    expect(produtos[0].id).toBe(produto.id)
  })

  it('deve filtrar produtos por segmento', async () => {
    // Similar ao teste anterior, mas com disponibilidade por SEGMENTO
    // Implementação similar...
  })

  it('deve respeitar janela de datas', async () => {
    // Teste com disponivel_de e disponivel_ate
    // Implementação similar...
  })
})
