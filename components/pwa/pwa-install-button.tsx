'use client'

import { useState } from 'react'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Download } from 'lucide-react'

const APP_NAME = 'Eat-Simple'

/**
 * Botão pequeno "Instalar" para colocar ao lado do carrinho no header da loja.
 * Só renderiza quando o app não está instalado (standalone).
 */
export function PwaInstallButton() {
  const { isInstalled, promptInstall, hasPrompt } = usePwaInstall()
  const [instrucoesAbertas, setInstrucoesAbertas] = useState(false)

  if (isInstalled) return null

  const handleClique = async () => {
    if (hasPrompt) {
      await promptInstall()
      return
    }
    setInstrucoesAbertas(true)
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClique}
        className="text-white hover:bg-white/15 gap-1 px-2"
        title={`Adicionar ${APP_NAME} à tela inicial (PWA)`}
      >
        <Download className="h-4 w-4 md:h-4 w-4" />
        <span className="hidden sm:inline text-xs">Instalar</span>
      </Button>

      <Dialog open={instrucoesAbertas} onOpenChange={setInstrucoesAbertas}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar à tela inicial</DialogTitle>
            <DialogDescription>
              Este é um app web (PWA). Não há download de APK — o app é instalado pelo navegador na tela inicial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Recarregue a página e toque em &quot;Instalar&quot; de novo — o navegador deve mostrar a opção de instalar.
            </p>
            <p>
              <strong>Chrome (Android ou PC):</strong> Menu (⋮) → &quot;Instalar app&quot; ou &quot;Adicionar à tela inicial&quot;.
            </p>
            <p>
              <strong>Safari (iPhone/iPad):</strong> Compartilhar → &quot;Adicionar à Tela de Início&quot;.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
