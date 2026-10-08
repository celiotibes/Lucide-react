import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Connect } from 'vite'

/**
 * Security Headers Middleware
 * Phase 22.18 — Web Security Headers
 */
function securityHeadersMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    // Content-Security-Policy header
    // Prevents inline script execution and restricts resource loading
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for Recharts
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://api.anthropic.com https://googleapis.com https://www.googleapis.com",
      "media-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join('; ')

    res.setHeader('Content-Security-Policy', csp)

    // Other security headers
    res.setHeader('X-Content-Type-Options', 'nosniff') // Prevent MIME type sniffing
    res.setHeader('X-Frame-Options', 'DENY') // Prevent clickjacking
    res.setHeader('X-XSS-Protection', '1; mode=block') // Legacy XSS filter
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin') // Control referrer
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()') // Restrict APIs
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains') // HSTS

    // Cache control for HTML (no caching) vs assets (long cache with hash)
    if (req.url.endsWith('.html') || req.url === '/') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    } else if (/\.[a-f0-9]{8}\.(js|css|png|jpg|woff)$/.test(req.url)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }

    next()
  }
}

// Phase 22.17 — Performance & Optimization
//
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
//
// Code Splitting Strategy (Phase 22.17):
// - App.tsx já usa React.lazy() para 35+ views (✓ não modificar)
// - Recharts, jsPDF, tesseract já são lazy/externalizados (✓)
// - Vite automatic code splitting ativado via rollupOptions.output.manualChunks
// - Target: main.js < 500KB gzip, vendor chunks lazy-loaded

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.wasm'],
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
        // /api nunca recebe o fallback de navegação (index.html) nem é precacheado: respostas
        // autenticadas não passam pelo cache do service worker (não há runtimeCaching para /api).
        navigateFallbackDenylist: [/^\/icons\//, /^\/api\//],
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
  server: {
    // Dev em MESMO ORIGEM: o navegador fala só com o Vite (5173) e o Vite encaminha /api para o
    // servidor Express. Assim cookie de sessão (SameSite=Lax) e CSRF funcionam sem CORS, igual à
    // produção atrás de proxy reverso. A porta padrão do server/ é 8787 (PORT); para outra,
    // defina VITE_DEV_API_TARGET (ex.: http://localhost:3000). Deixe VITE_API_URL vazio em dev.
    middlewares: [securityHeadersMiddleware()],
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Phase 22.17: Aggressive minification with terser
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        passes: 2, // Multiple passes for better compression
      },
      mangle: true,
      format: {
        comments: false, // Remove comments
      },
    },
    sourcemap: 'hidden', // No source maps in production (smaller bundle)

    // Code splitting strategy
    rollupOptions: {
      output: {
        // Hash-based filenames for cache busting
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash][extname]',

        // Manual chunk splitting for better control
        // Separates large vendor libraries into lazy-loaded chunks
        manualChunks(id) {
          // React core (always needed)
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-core';
          }

          // Heavy charting library (lazy-loaded with Dashboard)
          if (id.includes('node_modules/recharts')) {
            return 'recharts-bundle';
          }

          // PDF processing (lazy-loaded with Laudo/ECD views)
          if (id.includes('node_modules/jspdf')) {
            return 'jspdf-bundle';
          }

          // Parsing utilities (reused across import views)
          if (id.includes('node_modules/papaparse') || id.includes('node_modules/fast-xml-parser')) {
            return 'parsers';
          }

          // UI framework
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }

          // Keep main app code together
          // (Vite automatic splitting handles the rest)
        },
      },

      // Tree-shaking: aggressive removal of unused code
      treeshake: {
        moduleSideEffects: false, // Assume no side effects unless marked
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
    },

    // Chunk size warnings (helps identify bloated chunks)
    chunkSizeWarningLimit: 500, // Warn if chunk > 500KB

    // Report compressed sizes
    reportCompressedSize: true,
  },

  // Optimization hints for bundler
  optimizeDeps: {
    // Pre-bundle these dependencies for faster dev startup
    include: [
      'react',
      'react-dom',
      'lucide-react',
      'date-fns',
      'zod',
    ],
    // Exclude large libraries that are better code-split
    exclude: [
      'recharts', // Too large for pre-bundling, lazy-loaded anyway
      'jspdf',    // Too large for pre-bundling, lazy-loaded anyway
      'tesseract.js', // Already externalized
    ],
  },
})
