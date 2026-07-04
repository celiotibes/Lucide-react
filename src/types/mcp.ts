/**
 * MCP (Model Context Protocol) Type Definitions
 * Types for MCP server integration and tool management
 */

/**
 * Status de conexão com servidor MCP
 */
export type MCPServerStatus = 'connected' | 'disconnected' | 'error' | 'initializing' | 'timeout'

/**
 * Servidor MCP
 */
export interface MCPServer {
  id: string
  name: string
  description: string
  version: string
  status: MCPServerStatus
  lastStatusCheck: Date
  capabilities: string[]
  tools: MCPTool[]
  resources?: MCPResource[]
  baseUrl?: string
  timeout: number // em ms
  maxRetries: number
  currentRetries: number
  errorMessage?: string
}

/**
 * Ferramenta disponível em servidor MCP
 */
export interface MCPTool {
  id: string
  serverId: string
  name: string
  description: string
  inputSchema: JSONSchema
  category?: string
  tags?: string[]
  examplesUsage?: string
  lastUsedAt?: Date
  usageCount: number
}

/**
 * Recurso disponível em servidor MCP
 */
export interface MCPResource {
  id: string
  uri: string
  name: string
  description: string
  mimeType: string
}

/**
 * Schema JSON para validação de inputs
 */
export interface JSONSchema {
  type: string
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  description?: string
}

/**
 * Propriedade de schema JSON
 */
export interface JSONSchemaProperty {
  type: string | string[]
  description?: string
  enum?: (string | number)[]
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
}

/**
 * Chamada de ferramenta MCP
 */
export interface MCPToolCall {
  callId: string
  serverId: string
  toolName: string
  toolId: string

  parameters: Record<string, unknown>

  status: 'pending' | 'executing' | 'completed' | 'failed'

  result?: unknown
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }

  executionTimeMs?: number
  startedAt?: Date
  completedAt?: Date

  retryCount: number
  maxRetries: number
}

/**
 * Resultado de execução de ferramenta
 */
export interface ToolExecutionResult {
  success: boolean
  data?: unknown
  error?: {
    code: string
    message: string
    trace?: string
  }
  metadata?: {
    executionTime: number
    cacheHit?: boolean
    resourceUsage?: {
      cpuMs?: number
      memoryMb?: number
    }
  }
}

/**
 * Sessão de uso de MCP
 */
export interface MCPSession {
  sessionId: string
  startedAt: Date
  endedAt?: Date

  servers: MCPServer[]
  toolCalls: MCPToolCall[]

  totalCallsExecuted: number
  successfulCalls: number
  failedCalls: number

  notes?: string
}

/**
 * Histórico de uso de ferramenta
 */
export interface ToolUsageHistory {
  toolId: string
  toolName: string
  serverId: string

  lastUsedAt: Date
  usageCount: number
  successCount: number
  failureCount: number

  averageExecutionTimeMs: number
  maxExecutionTimeMs: number
  minExecutionTimeMs: number

  commonErrors?: {
    errorCode: string
    count: number
  }[]
}

/**
 * Integração de MCP com Claude Code
 */
export interface MCPIntegration {
  integrationId: string
  mcp: MCPServer
  integrationType: 'skill' | 'plugin' | 'connector'

  enabledSkills?: string[]
  enabledPlugins?: string[]

  configuration: Record<string, unknown>

  isActive: boolean
  activatedAt: Date

  usage: {
    callsThisMonth: number
    callsThisWeek: number
    lastCallAt: Date
  }
}

/**
 * Configuração de MCP no settings.json
 */
export interface MCPConfig {
  enabled: boolean
  servers: {
    id: string
    name: string
    enabled: boolean
    configFile?: string
    timeout?: number
    retries?: number
  }[]
}

/**
 * Resultado agregado de múltiplas chamadas MCP
 */
export interface AggregatedMCPResult {
  resultId: string
  toolCalls: MCPToolCall[]
  combinedResult: unknown
  executionSummary: {
    totalCalls: number
    successfulCalls: number
    failedCalls: number
    totalExecutionTimeMs: number
  }
  aggregationMethod?: 'merge' | 'first_success' | 'combine' | 'custom'
}

/**
 * Cache de resultados MCP
 */
export interface MCPResultCache {
  cacheKey: string
  serverId: string
  toolName: string
  parameters: Record<string, unknown>

  result: unknown
  timestamp: Date
  expiresAt: Date

  hitCount: number
  isFresh: boolean
}

/**
 * Configuração de retry e timeout para MCP
 */
export interface MCPRetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  jitterMs: number
  retryableErrors: string[]
}

/**
 * Status de saúde de MCP
 */
export interface MCPHealth {
  serverId: string
  isHealthy: boolean
  statusCode: number
  responseTimeMs: number
  lastCheckAt: Date

  issues?: {
    type: 'connection' | 'timeout' | 'resource_limit' | 'authentication' | 'rate_limit'
    severity: 'critical' | 'warning' | 'info'
    message: string
  }[]
}

/**
 * Monitoramento de MCP
 */
export interface MCPMonitoring {
  serverId: string
  timeWindow: {
    startDate: Date
    endDate: Date
  }

  metrics: {
    totalRequests: number
    successRate: number // 0-1
    averageLatencyMs: number
    p95LatencyMs: number
    p99LatencyMs: number

    errorRate: number // 0-1
    topErrors?: {
      code: string
      count: number
      percentage: number
    }[]

    throughput: number // requests per second
    peakThroughput: number

    cacheHitRate: number // 0-1
  }

  resourceUsage?: {
    cpuPercentage: number
    memoryMb: number
    connectionCount: number
  }

  recommendations?: string[]
}
