import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA: usamos vite-plugin-pwa (em vez de escrever o service worker à mão) porque é a rota
// padrão para Vite — gera o manifest, o service worker (via workbox) e o módulo virtual
// `virtual:pwa-register/react` que o aviso de atualização consome, tudo a partir de uma
// única configuração declarativa. Escrever um SW manual reimplementaria precache,
// invalidação de cache por versão e o ciclo de update — só risco a mais para um app que
// já lida com dado sensível (reconstituição contábil pericial).
//
// registerType: 'prompt' (não 'autoUpdate') de propósito — um SW que troca a versão em uso
// sozinho, no meio de uma sessão de trabalho, pode invalidar chunks que a página ainda vai
// buscar (lazy import) e quebrar a tela em uso. Com 'prompt', o usuário decide quando
// recarregar (ver src/ui/pwa/AvisoAtualizacao.tsx).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null, // registro feito à mão em AvisoAtualizacao.tsx via useRegisterSW
      includeAssets: ['favicon.svg', 'icons.svg', 'sql-wasm.wasm'],
      manifest: {
        id: '/',
        name: 'CRMT Histórico Contábil & Financeiro',
        short_name: 'CRMT Contábil',
        description:
          'Reconstituição contábil de locação de imóveis: DRE, inadimplência, auditoria forense e laudo pericial — 100% local no navegador.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#2e6b4b',
        background_color: '#f3f5f0',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // O app shell (JS/CSS/HTML/ícones/manifest + sql-wasm.wasm, essencial para abrir o
        // banco a cada carga) entra no precache. O diretório tesseract/ (~6,6 MB, usado só
        // quando a pessoa aciona OCR de imagem) fica de fora do precache — cacheá-lo sempre,
        // para todo mundo, custaria download e espaço em disco que a maioria das sessões
        // nunca usa. runtimeCaching abaixo garante que, uma vez usado, ele fica em cache
        // (CacheFirst) para as próximas vezes, inclusive offline.
        globPatterns: ['**/*.{js,css,html,ico,svg,png,webmanifest,wasm}'],
        globIgnores: ['tesseract/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/icons\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/tesseract/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-ocr',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 180 },
            },
          },
        ],
      },
      devOptions: {
        // SW desligado em dev: interferiria com o HMR do Vite sem trazer benefício nenhum
        // (instalabilidade e cache offline só importam no build de produção/preview).
        enabled: false,
      },
    }),
  ],
})
