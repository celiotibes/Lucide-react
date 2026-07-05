/**
 * Tipos para Mobile & PWA
 */

export interface ConfiguracaoPWA {
  nomeApp: string
  descricao: string
  icone: string
  corPrimaria: string
  corSecundaria: string
  temaBackground: string
  telaInteira: boolean
  orientacao: 'portrait' | 'landscape' | 'portrait-primary' | 'landscape-primary'
}

export interface DispositivoInfo {
  tipo: 'mobile' | 'tablet' | 'desktop'
  largura: number
  altura: number
  diagonalPolegadas: number
  dpi: number
  touchSupport: boolean
  orientacao: 'portrait' | 'landscape'
}

export interface GestureInfo {
  tipo: 'tap' | 'long-press' | 'swipe' | 'pinch' | 'double-tap'
  timestamp: Date
  x: number
  y: number
  velocidade?: number
  distancia?: number
}

export interface PreferenciasMobile {
  reducaoMovimento: boolean
  temaEscuro: boolean
  tamanhoFonte: 'pequeno' | 'normal' | 'grande' | 'muito-grande'
  largurasResponsivas: boolean
  compactMode: boolean
  gestauresHabilitados: boolean
}

export interface ResultadoOtimizacao {
  sucesso: boolean
  tempoCarregamento: number
  tamanhoBundle: number
  imagensOtimizadas: number
  metricas: {
    coreWebVitals: CoreWebVitals
    performanceScore: number
  }
}

export interface CoreWebVitals {
  LCP: number // Largest Contentful Paint
  FID: number // First Input Delay
  CLS: number // Cumulative Layout Shift
  TTFB: number // Time to First Byte
  FCP: number // First Contentful Paint
}
