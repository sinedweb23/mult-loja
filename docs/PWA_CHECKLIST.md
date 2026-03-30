# Checklist PWA – instalação apenas como app web (sem APK)

Este projeto é uma **PWA pura**. A instalação deve ocorrer somente pelo navegador (beforeinstallprompt / Adicionar à tela inicial). Não há download de APK nem link para Play Store.

## Verificações técnicas

### 1. Manifest (`/public/manifest.json`)

- [x] `id` definido (ex.: `"/"`)
- [x] `name`, `short_name`, `description`
- [x] `start_url`: `"/"` (ou path do app)
- [x] `scope`: `"/"` (cobre todo o app)
- [x] `display`: `"standalone"`
- [x] `theme_color`, `background_color`
- [x] Ícones 192x192 e 512x512 com `purpose`: `"any"` e `"maskable"`
- [x] **Sem** `related_applications` (não sugerir app Android/Play)
- [x] **Sem** `prefer_related_applications: true`

### 2. Fluxo de instalação (frontend)

- [x] Apenas `beforeinstallprompt` é usado; o evento é guardado e o prompt é chamado no clique do botão.
- [x] Nenhum link para `.apk`, `play.google.com`, `market://`, ou instalador Android.
- [x] Botão/dialog deixa claro: “Adicionar à tela inicial (PWA)”, “não há download de APK”.

### 3. Service Worker (`/public/sw.js`)

- [x] Registrado apenas para cache/offline; não redireciona para APK nem URLs de app nativo.

### 4. Sem wrapper Android no repositório

- [x] Nenhum projeto Capacitor/Cordova/TWA na pasta do app.
- [x] Nenhum `assetlinks.json` em `/.well-known/` que aponte para um app Android (evita confusão com TWA).

## Como testar se está instalando como PWA (e não como APK)

1. **Android (Chrome)**  
   - Abra o site em HTTPS.  
   - Use o botão “Instalar” do site ou Menu → “Instalar app” / “Adicionar à tela inicial”.  
   - Após instalar: Configurações → Apps → [nome do app].  
   - Deve constar algo como “Instalado por: Chrome” (não “Desconhecido” ou instalador de pacote).  
   - Não deve aparecer tela de “Abrir com” ou instalador de APK.

2. **Desktop (Chrome)**  
   - Ícone de instalação na barra de endereço.  
   - Após instalar, o app abre em janela standalone (sem barra de URL).

3. **Play Protect**  
   - Se o aviso “App de risco / versão mais antiga do Android” aparecer, normalmente é porque o usuário está instalando um **APK** (sideload ou TWA antigo), não a PWA.  
   - Confirme que não existe link/botão que baixe ou abra um APK em nenhuma tela.

## Resumo

- **Manifest**: Ajustado com `scope`, `id` e ícones `maskable`; sem `related_applications`.
- **Frontend**: Apenas `beforeinstallprompt`; textos deixam claro que é PWA, sem APK.
- **Sem** APK, TWA ou link para Play Store no fluxo de instalação desta aplicação.
