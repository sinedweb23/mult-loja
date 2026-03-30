import { redirect } from 'next/navigation'
import { usuarioTemAlgumAlunoComAcessoCreditoCantina } from '@/app/actions/configuracoes'
import { CreditoCantinaContent } from './CreditoCantinaContent'

export default async function CreditoCantinaPage() {
  const temAcesso = await usuarioTemAlgumAlunoComAcessoCreditoCantina()
  if (!temAcesso) {
    redirect('/loja?acesso_credito_cantina=negado')
  }
  return <CreditoCantinaContent />
}
