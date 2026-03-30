import type { Metadata } from "next"
import Script from "next/script"
import { Inter } from "next/font/google"
import "./globals.css"
import { LoadingOverlay } from "@/components/loading-overlay"
import { PwaRegisterAndButton } from "@/components/pwa/pwa-register-and-button"
import { RecoveryHashRedirect } from "@/components/auth/recovery-hash-redirect"
import { obterConfiguracaoAparencia } from "@/app/actions/configuracoes"

const inter = Inter({ subsets: ["latin"] })

const PWA_THEME_COLOR = "#16a34a"

export async function generateMetadata(): Promise<Metadata> {
  try {
    const config = await obterConfiguracaoAparencia()
    const title = (config?.loja_nome || "").trim() || "Loja Escola"
    const faviconUrl = (config?.loja_favicon_url || "").trim()
    const iconUrl = faviconUrl || "/favicon.svg"
    return {
      title: { default: title, template: `%s | ${title}` },
      description: "E-commerce para escola",
      manifest: "/manifest.json",
      icons: {
        icon: iconUrl,
        shortcut: iconUrl,
        apple: "/icons/icon-192.png",
      },
    }
  } catch {
    return {
      title: "Loja Escola",
      description: "E-commerce para escola",
      manifest: "/manifest.json",
      icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/icons/icon-192.png" },
    }
  }
}

export const viewport = {
  themeColor: PWA_THEME_COLOR,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Script
          id="pwa-capture-install-prompt"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              /* PWA: captura apenas o prompt nativo (Adicionar à tela inicial). Sem APK nem download. */
              window.__pwaInstallPrompt = null;
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.__pwaInstallPrompt = e;
              });
            `,
          }}
        />
        <LoadingOverlay />
        <RecoveryHashRedirect />
        {children}
        <PwaRegisterAndButton />
      </body>
    </html>
  )
}
