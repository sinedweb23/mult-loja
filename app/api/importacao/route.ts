import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Usar função compartilhada de processamento
    const { processarImportacao } = await import('./processar')
    const result = await processarImportacao(body)
    
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Erro na importação:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao processar importação' },
      { status: 400 }
    )
  }
}
