/**
 * FASE 12: Performance Audit Service
 * Monitora e otimiza performance da aplicação
 */

export interface PerformanceMetric {
  name: string
  value: number
  unit: string
  threshold: number
  status: 'pass' | 'warning' | 'fail'
}

export interface PerformanceReport {
  timestamp: Date
  metrics: PerformanceMetric[]
  summary: string
}

export class PerformanceAudit {
  private static metrics: PerformanceMetric[] = []
  private static marks: Map<string, number> = new Map()

  /**
   * Marca início de operação
   */
  static markStart(label: string): void {
    this.marks.set(`${label}_start`, performance.now())
  }

  /**
   * Marca fim de operação e calcula duração
   */
  static markEnd(label: string): number {
    const startTime = this.marks.get(`${label}_start`)
    if (!startTime) {
      console.warn(`No start mark found for ${label}`)
      return 0
    }

    const duration = performance.now() - startTime
    this.marks.delete(`${label}_start`)

    return duration
  }

  /**
   * Audita tempo de carregamento de componentes
   */
  static auditComponentLoadTime(componentName: string, duration: number): PerformanceMetric {
    const threshold = 1000 // 1s
    const metric: PerformanceMetric = {
      name: `Component Load: ${componentName}`,
      value: duration,
      unit: 'ms',
      threshold,
      status: duration < threshold ? 'pass' : duration < threshold * 1.5 ? 'warning' : 'fail',
    }

    this.metrics.push(metric)
    return metric
  }

  /**
   * Audita tempo de API call
   */
  static auditApiCallTime(endpoint: string, duration: number): PerformanceMetric {
    const threshold = 3000 // 3s
    const metric: PerformanceMetric = {
      name: `API Call: ${endpoint}`,
      value: duration,
      unit: 'ms',
      threshold,
      status: duration < threshold ? 'pass' : duration < threshold * 1.5 ? 'warning' : 'fail',
    }

    this.metrics.push(metric)
    return metric
  }

  /**
   * Audita memória do navegador
   */
  static auditMemoryUsage(): PerformanceMetric | null {
    const perfMemory = (performance as any).memory
    if (!perfMemory) {
      console.warn('Memory API not available')
      return null
    }

    const usedMemoryMb = perfMemory.usedJSHeapSize / 1048576
    const threshold = 100 // 100MB
    const metric: PerformanceMetric = {
      name: 'Memory Usage',
      value: usedMemoryMb,
      unit: 'MB',
      threshold,
      status: usedMemoryMb < threshold ? 'pass' : usedMemoryMb < threshold * 1.2 ? 'warning' : 'fail',
    }

    this.metrics.push(metric)
    return metric
  }

  /**
   * Audita tamanho do bundle
   */
  static auditBundleSize(bundleName: string, sizeKb: number): PerformanceMetric {
    const thresholds: Record<string, number> = {
      main: 500,
      vendor: 300,
      react: 200,
    }

    const threshold = thresholds[bundleName] || 100
    const metric: PerformanceMetric = {
      name: `Bundle Size: ${bundleName}`,
      value: sizeKb,
      unit: 'KB',
      threshold,
      status: sizeKb < threshold ? 'pass' : sizeKb < threshold * 1.2 ? 'warning' : 'fail',
    }

    this.metrics.push(metric)
    return metric
  }

  /**
   * Audita renderização de listas (virtualization check)
   */
  static auditListRenderTime(itemCount: number, renderTime: number): PerformanceMetric {
    const expectedTimePerItem = 0.5 // ms
    const expectedTotal = itemCount * expectedTimePerItem
    const threshold = expectedTotal * 1.5

    const metric: PerformanceMetric = {
      name: `List Render: ${itemCount} items`,
      value: renderTime,
      unit: 'ms',
      threshold: Math.round(threshold),
      status: renderTime < threshold ? 'pass' : renderTime < threshold * 1.5 ? 'warning' : 'fail',
    }

    this.metrics.push(metric)
    return metric
  }

  /**
   * Audita animações (60fps check)
   */
  static auditAnimationFrameTime(frameTime: number): PerformanceMetric {
    const threshold = 16.67 // 1000ms / 60fps
    const metric: PerformanceMetric = {
      name: 'Animation Frame Time',
      value: parseFloat(frameTime.toFixed(2)),
      unit: 'ms',
      threshold: parseFloat(threshold.toFixed(2)),
      status: frameTime <= threshold ? 'pass' : frameTime <= threshold * 1.5 ? 'warning' : 'fail',
    }

    this.metrics.push(metric)
    return metric
  }

  /**
   * Audita localStorage usage
   */
  static auditStorageUsage(): PerformanceMetric {
    let totalSize = 0

    try {
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalSize += localStorage[key].length + key.length
        }
      }
    } catch (err) {
      console.warn('Cannot audit localStorage')
    }

    const sizeKb = totalSize / 1024
    const threshold = 5000 // 5MB
    const metric: PerformanceMetric = {
      name: 'localStorage Size',
      value: sizeKb,
      unit: 'KB',
      threshold,
      status: sizeKb < threshold ? 'pass' : sizeKb < threshold * 1.2 ? 'warning' : 'fail',
    }

    this.metrics.push(metric)
    return metric
  }

  /**
   * Audita número de DOM nodes
   */
  static auditDomNodeCount(): PerformanceMetric {
    const nodeCount = document.getElementsByTagName('*').length
    const threshold = 10000
    const metric: PerformanceMetric = {
      name: 'DOM Nodes',
      value: nodeCount,
      unit: 'nodes',
      threshold,
      status: nodeCount < threshold ? 'pass' : nodeCount < threshold * 1.2 ? 'warning' : 'fail',
    }

    this.metrics.push(metric)
    return metric
  }

  /**
   * Audita listeners de eventos
   */
  static auditEventListeners(): PerformanceMetric {
    // Aproximação: contar event listeners conhecidos
    let listenerCount = 0

    // Contar por tipo de elemento comum
    const elements = document.querySelectorAll('button, input, a, [onclick]')
    listenerCount = elements.length * 1 // Aproximação conservadora

    const threshold = 1000
    const metric: PerformanceMetric = {
      name: 'Event Listeners',
      value: listenerCount,
      unit: 'listeners',
      threshold,
      status: listenerCount < threshold ? 'pass' : listenerCount < threshold * 1.2 ? 'warning' : 'fail',
    }

    this.metrics.push(metric)
    return metric
  }

  /**
   * Calcula Core Web Vitals simulados
   */
  static auditWebVitals(): {
    lcp?: PerformanceMetric // Largest Contentful Paint
    fid?: PerformanceMetric // First Input Delay
    cls?: PerformanceMetric // Cumulative Layout Shift
  } {
    const vitals: any = {}

    // LCP (Largest Contentful Paint)
    if (performance.getEntriesByType) {
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint')

      if (lcpEntries.length > 0) {
        const lcpTime = lcpEntries[lcpEntries.length - 1].startTime
        vitals.lcp = {
          name: 'Largest Contentful Paint',
          value: parseFloat(lcpTime.toFixed(2)),
          unit: 'ms',
          threshold: 2500, // Good is < 2.5s
          status: lcpTime < 2500 ? 'pass' : lcpTime < 4000 ? 'warning' : 'fail',
        }
      }
    }

    return vitals
  }

  /**
   * Gera relatório de performance
   */
  static generateReport(): PerformanceReport {
    const failedMetrics = this.metrics.filter((m) => m.status === 'fail')
    const warningMetrics = this.metrics.filter((m) => m.status === 'warning')

    let summary = `✅ ${this.metrics.filter((m) => m.status === 'pass').length} passing`
    if (warningMetrics.length > 0) summary += `, ⚠️ ${warningMetrics.length} warnings`
    if (failedMetrics.length > 0) summary += `, ❌ ${failedMetrics.length} failing`

    return {
      timestamp: new Date(),
      metrics: this.metrics,
      summary,
    }
  }

  /**
   * Fornece recomendações
   */
  static getRecommendations(): string[] {
    const recommendations: string[] = []
    const failedMetrics = this.metrics.filter((m) => m.status === 'fail')

    for (const metric of failedMetrics) {
      if (metric.name.includes('Load')) {
        recommendations.push('⚡ Otimize carregamento: considere lazy loading ou code splitting')
      }
      if (metric.name.includes('API')) {
        recommendations.push('📡 Otimize API calls: implemente caching ou prefetching')
      }
      if (metric.name.includes('Bundle')) {
        recommendations.push('📦 Reduza bundle size: remova dependências não utilizadas')
      }
      if (metric.name.includes('Memory')) {
        recommendations.push('💾 Reduza uso de memória: implemente cleanup/garbage collection')
      }
      if (metric.name.includes('Render')) {
        recommendations.push('🎨 Otimize renderização: use React.memo ou virtualization')
      }
      if (metric.name.includes('DOM')) {
        recommendations.push('🌳 Reduza DOM nodes: implemente virtual scrolling se necessário')
      }
      if (metric.name.includes('Storage')) {
        recommendations.push('💿 Limpe storage: implemente limpeza periódica de dados antigos')
      }
    }

    return recommendations
  }

  /**
   * Limpa métricas
   */
  static reset(): void {
    this.metrics = []
    this.marks.clear()
  }
}
