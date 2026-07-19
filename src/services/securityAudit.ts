/**
 * FASE 12: Security Audit Service
 * Verifica vulnerabilidades comuns em operações sensíveis
 */

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  description: string
  location?: string
  remediation?: string
}

export class SecurityAudit {
  private static findings: SecurityFinding[] = []

  /**
   * Valida API Key antes de armazenar
   */
  static validateApiKey(key: string): { valid: boolean; error?: string } {
    if (!key) {
      return { valid: false, error: 'API Key não pode estar vazia' }
    }

    // Validação básica de formato
    if (!key.startsWith('sk-')) {
      return { valid: false, error: 'API Key deve começar com sk-' }
    }

    // Deve ter comprimento adequado
    if (key.length < 20) {
      return { valid: false, error: 'API Key parece muito curta' }
    }

    // Não deve conter espaços
    if (key.includes(' ')) {
      return { valid: false, error: 'API Key não deve conter espaços' }
    }

    return { valid: true }
  }

  /**
   * Audita localStorage para dados sensíveis
   */
  static auditLocalStorage(): SecurityFinding[] {
    const findings: SecurityFinding[] = []
    const dangerousPatterns = [
      { pattern: /password/i, type: 'password' },
      { pattern: /token/i, type: 'auth_token' },
      { pattern: /secret/i, type: 'secret' },
      { pattern: /api.?key/i, type: 'api_key' },
    ]

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key) continue

        // Verificar chave
        for (const { pattern, type } of dangerousPatterns) {
          if (pattern.test(key)) {
            findings.push({
              severity: 'medium',
              category: 'sensitive_storage',
              description: `Dados sensíveis (${type}) armazenados em localStorage`,
              location: key,
              remediation: `Considere usar sessionStorage ou IndexedDB com criptografia para ${type}`,
            })
          }
        }
      }
    } catch (err) {
      // localStorage access error (cross-origin, etc)
    }

    return findings
  }

  /**
   * Valida URLs antes de fazer fetch
   */
  static validateFetchUrl(url: string): { valid: boolean; error?: string } {
    try {
      const parsed = new URL(url)

      // Apenas HTTP/HTTPS
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'URL deve usar HTTP ou HTTPS' }
      }

      // Válida URL mesmo em produção

      return { valid: true }
    } catch (err) {
      return { valid: false, error: 'URL inválida' }
    }
  }

  /**
   * Valida JSON antes de parse
   */
  static safeJsonParse(json: string): { success: boolean; data?: any; error?: string } {
    try {
      const parsed = JSON.parse(json)

      // Verifique tamanho razoável
      const sizeInKb = new Blob([json]).size / 1024
      if (sizeInKb > 10000) {
        return { success: false, error: 'JSON muito grande (> 10MB)' }
      }

      return { success: true, data: parsed }
    } catch (err) {
      return { success: false, error: 'JSON inválido' }
    }
  }

  /**
   * Valida entrada de usuário contra XSS
   */
  static sanitizeInput(input: string): string {
    if (!input) return ''

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
  }

  /**
   * Detecta possível XSS em conteúdo
   */
  static detectXssRisk(content: string): { risky: boolean; patterns: string[] } {
    const xssPatterns = [
      '<script',
      'javascript:',
      'onerror=',
      'onload=',
      'onclick=',
      'onmouseover=',
      'eval(',
      'Function(',
    ]

    const patterns = xssPatterns.filter((pattern) =>
      content.toLowerCase().includes(pattern.toLowerCase())
    )

    return {
      risky: patterns.length > 0,
      patterns,
    }
  }

  /**
   * Valida CORS headers
   */
  static validateCorsHeaders(headers: Record<string, string>): SecurityFinding[] {
    const findings: SecurityFinding[] = []
    const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))

    // Verificar CORS permissivo
    if (lowerHeaders['access-control-allow-origin'] === '*') {
      findings.push({
        severity: 'high',
        category: 'cors',
        description: 'CORS permissivo para todos os domínios (*)',
        remediation: 'Especifique domínios explícitos no CORS',
      })
    }

    // Verificar se credenciais são permitidas com CORS aberto
    if (
      lowerHeaders['access-control-allow-credentials'] === 'true' &&
      lowerHeaders['access-control-allow-origin'] === '*'
    ) {
      findings.push({
        severity: 'critical',
        category: 'cors_credentials',
        description: 'Credenciais permitidas com CORS aberto (muito inseguro)',
        remediation: 'Nunca use allow-origin=* com allow-credentials=true',
      })
    }

    return findings
  }

  /**
   * Audita permissões de arquivo
   */
  static auditFilePermissions(filename: string): SecurityFinding[] {
    const findings: SecurityFinding[] = []
    const sensitiveFiles = ['.env', '.env.local', '.env.production', 'config.json', 'secrets.json']

    if (sensitiveFiles.some((f) => filename.endsWith(f))) {
      findings.push({
        severity: 'critical',
        category: 'file_exposure',
        description: `Arquivo sensível pode estar exposto: ${filename}`,
        remediation: 'Adicione a .gitignore e verifique o git history',
      })
    }

    return findings
  }

  /**
   * Valida headers de segurança HTTP
   */
  static validateSecurityHeaders(headers: Record<string, string>): SecurityFinding[] {
    const findings: SecurityFinding[] = []
    const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))

    // Content-Security-Policy
    if (!lowerHeaders['content-security-policy']) {
      findings.push({
        severity: 'high',
        category: 'missing_header',
        description: 'Content-Security-Policy header não configurado',
        remediation: 'Implemente CSP para prevenir XSS',
      })
    }

    // X-Frame-Options
    if (!lowerHeaders['x-frame-options']) {
      findings.push({
        severity: 'high',
        category: 'missing_header',
        description: 'X-Frame-Options header não configurado',
        remediation: 'Use X-Frame-Options: DENY ou SAMEORIGIN',
      })
    }

    // X-Content-Type-Options
    if (!lowerHeaders['x-content-type-options']) {
      findings.push({
        severity: 'medium',
        category: 'missing_header',
        description: 'X-Content-Type-Options header não configurado',
        remediation: 'Use X-Content-Type-Options: nosniff',
      })
    }

    // Strict-Transport-Security (HTTPS only)
    if (!lowerHeaders['strict-transport-security']) {
      findings.push({
        severity: 'medium',
        category: 'missing_header',
        description: 'HSTS header não configurado',
        remediation: 'Use Strict-Transport-Security com max-age apropriado',
      })
    }

    return findings
  }

  /**
   * Gera relatório de segurança
   */
  static generateReport(): {
    summary: { total: number; critical: number; high: number; medium: number; low: number }
    findings: SecurityFinding[]
  } {
    const summary = {
      total: this.findings.length,
      critical: this.findings.filter((f) => f.severity === 'critical').length,
      high: this.findings.filter((f) => f.severity === 'high').length,
      medium: this.findings.filter((f) => f.severity === 'medium').length,
      low: this.findings.filter((f) => f.severity === 'low').length,
    }

    return {
      summary,
      findings: this.findings,
    }
  }

  /**
   * Limpa findings (reset)
   */
  static reset(): void {
    this.findings = []
  }
}
