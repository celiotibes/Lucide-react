/**
 * Claude Code Bridge Service
 * Integration bridge between React app and Claude Code MCP servers
 */

import type { MCPToolCall, ToolExecutionResult, MCPServer } from '../types/mcp'

export class ClaudeCodeBridge {
  private availableServers: MCPServer[] = []
  private toolCallHistory: MCPToolCall[] = []

  constructor() {
    this.initializeServers()
  }

  /**
   * Inicializar servidores MCP disponíveis
   */
  private initializeServers(): void {
    this.availableServers = [
      {
        id: 'legal-data-hunter',
        name: 'Legal Data Hunter',
        description: 'Multi-jurisdictional legal research',
        version: '1.0.0',
        status: 'initializing',
        lastStatusCheck: new Date(),
        capabilities: ['search_statutes', 'search_case_law', 'search_doctrine', 'analyze_petition'],
        tools: [],
        timeout: 30000,
        maxRetries: 3,
        currentRetries: 0,
      },
      {
        id: 'pubmed',
        name: 'PubMed',
        description: 'Academic article research',
        version: '1.0.0',
        status: 'initializing',
        lastStatusCheck: new Date(),
        capabilities: ['search_articles', 'get_metadata', 'related_articles'],
        tools: [],
        timeout: 30000,
        maxRetries: 3,
        currentRetries: 0,
      },
      {
        id: 'google-drive',
        name: 'Google Drive',
        description: 'Document storage and management',
        version: '1.0.0',
        status: 'initializing',
        lastStatusCheck: new Date(),
        capabilities: ['search_files', 'upload_documents', 'share_files'],
        tools: [],
        timeout: 30000,
        maxRetries: 2,
        currentRetries: 0,
      },
    ]
  }

  /**
   * Chamar ferramenta MCP
   * Esta é a principal interface entre React e Claude Code
   */
  async callMCPTool(
    serverId: string,
    toolName: string,
    parameters: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const toolCall: MCPToolCall = {
      callId,
      serverId,
      toolName,
      toolId: `${serverId}:${toolName}`,
      parameters,
      status: 'pending',
      startedAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
    }

    this.toolCallHistory.push(toolCall)

    try {
      // Simular chamada ao MCP (em produção, seria via WebSocket ou HTTP)
      const result = await this._executeToolWithRetry(toolCall)

      toolCall.status = 'completed'
      toolCall.result = result
      toolCall.completedAt = new Date()
      toolCall.executionTimeMs = result.metadata?.executionTime || 0

      return result
    } catch (error) {
      const errorResult: ToolExecutionResult = {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          trace: error instanceof Error ? error.stack : undefined,
        },
      }

      toolCall.status = 'failed'
      toolCall.error = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      }
      toolCall.completedAt = new Date()

      return errorResult
    }
  }

  /**
   * Executar ferramenta com retry automático
   */
  private async _executeToolWithRetry(
    toolCall: MCPToolCall,
  ): Promise<ToolExecutionResult> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= toolCall.maxRetries; attempt++) {
      try {
        toolCall.status = 'executing'
        toolCall.retryCount = attempt

        // Simular delay crescente para retry (backoff exponencial)
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        // Aqui seria feita a chamada real ao MCP
        // Por enquanto, retorna um resultado simulado
        return {
          success: true,
          data: {
            message: `Mock result from ${toolCall.toolName}`,
            parameters: toolCall.parameters,
          },
          metadata: {
            executionTime: Math.random() * 1000,
          },
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')

        // Se foi o último attempt, não tentar novamente
        if (attempt === toolCall.maxRetries) {
          throw lastError
        }

        // Verificar se é erro retentável
        const isRetryable = this._isRetryableError(lastError)
        if (!isRetryable) {
          throw lastError
        }
      }
    }

    throw lastError || new Error('Unknown error')
  }

  /**
   * Verificar se erro é retentável
   */
  private _isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      'TIMEOUT',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      '429', // Rate limit
      '503', // Service unavailable
      '504', // Gateway timeout
    ]

    return retryablePatterns.some(pattern => error.message.includes(pattern))
  }

  /**
   * Obter lista de ferramentas disponíveis
   */
  async getAvailableTools(): Promise<string[]> {
    const tools: string[] = []

    for (const server of this.availableServers) {
      if (server.status === 'connected') {
        tools.push(...server.tools.map(t => `${server.id}:${t.name}`))
      }
    }

    return tools
  }

  /**
   * Obter status dos servidores
   */
  async getServerStatus(serverId?: string): Promise<MCPServer[]> {
    if (serverId) {
      return this.availableServers.filter(s => s.id === serverId)
    }

    return this.availableServers
  }

  /**
   * Verificar conectividade de servidor
   */
  async checkServerHealth(serverId: string): Promise<boolean> {
    const server = this.availableServers.find(s => s.id === serverId)
    if (!server) return false

    try {
      // Simular health check
      const isHealthy = Math.random() > 0.1 // 90% de chance de sucesso

      if (isHealthy) {
        server.status = 'connected'
        server.currentRetries = 0
      } else {
        server.status = 'error'
        server.currentRetries++
      }

      server.lastStatusCheck = new Date()
      return isHealthy
    } catch (error) {
      server.status = 'error'
      server.errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return false
    }
  }

  /**
   * Obter histórico de chamadas
   */
  getToolCallHistory(limit = 50): MCPToolCall[] {
    return this.toolCallHistory.slice(-limit)
  }

  /**
   * Limpar histórico
   */
  clearToolCallHistory(): void {
    this.toolCallHistory = []
  }

  /**
   * Obter estatísticas de uso
   */
  getUsageStats(): {
    totalCalls: number
    successfulCalls: number
    failedCalls: number
    averageExecutionTime: number
  } {
    const successful = this.toolCallHistory.filter(c => c.status === 'completed')
    const failed = this.toolCallHistory.filter(c => c.status === 'failed')

    const totalTime = successful.reduce((sum, c) => sum + (c.executionTimeMs || 0), 0)
    const avgTime = successful.length > 0 ? totalTime / successful.length : 0

    return {
      totalCalls: this.toolCallHistory.length,
      successfulCalls: successful.length,
      failedCalls: failed.length,
      averageExecutionTime: avgTime,
    }
  }

  /**
   * Chamar múltiplas ferramentas em paralelo
   */
  async callMultipleTools(
    calls: Array<{
      serverId: string
      toolName: string
      parameters: Record<string, unknown>
    }>,
  ): Promise<ToolExecutionResult[]> {
    const promises = calls.map(call => this.callMCPTool(call.serverId, call.toolName, call.parameters))

    return Promise.allSettled(promises).then(results =>
      results.map((result) => {
        if (result.status === 'fulfilled') {
          return result.value
        } else {
          return {
            success: false,
            error: {
              code: 'PROMISE_REJECTED',
              message: result.reason?.message || 'Promise rejected',
            },
          }
        }
      }),
    )
  }

  /**
   * Monitorar saúde de servidores periodicamente
   */
  startHealthMonitoring(intervalMs = 30000): ReturnType<typeof setInterval> {
    return setInterval(() => {
      this.availableServers.forEach(server => {
        this.checkServerHealth(server.id)
      })
    }, intervalMs)
  }
}

/**
 * Singleton instance
 */
export const claudeCodeBridge = new ClaudeCodeBridge()

/**
 * Helper para integração rápida
 */
export async function callLegalSearch(query: string, jurisdiction: string): Promise<unknown> {
  return claudeCodeBridge.callMCPTool('legal-data-hunter', 'search', {
    query,
    jurisdiction,
  })
}

export async function callAcademicSearch(keywords: string[]): Promise<unknown> {
  return claudeCodeBridge.callMCPTool('pubmed', 'search', {
    keywords,
  })
}

export async function callGoogleDriveSearch(query: string): Promise<unknown> {
  return claudeCodeBridge.callMCPTool('google-drive', 'search_files', {
    query,
  })
}
