/**
 * useMcpTools Hook
 * Custom hook for Claude Code MCP server integration
 */

import { useState, useCallback, useEffect } from 'react'
import { claudeCodeBridge } from '../services/claudeCodeBridge'
import type { MCPServer, MCPToolCall, ToolExecutionResult } from '../types/mcp'

interface UseMcpToolsState {
  servers: MCPServer[]
  availableTools: string[]
  loading: boolean
  error: string | null
  lastToolCall?: MCPToolCall
}

interface UseMcpToolsMonitoring {
  totalCallsThisSession: number
  successfulCalls: number
  failedCalls: number
  averageExecutionTimeMs: number
  callHistory: MCPToolCall[]
}

/**
 * Hook para integração com Claude Code MCP Servers
 */
export function useMcpTools() {
  const [state, setState] = useState<UseMcpToolsState>({
    servers: [],
    availableTools: [],
    loading: false,
    error: null,
  })

  const [monitoring, setMonitoring] = useState<UseMcpToolsMonitoring>({
    totalCallsThisSession: 0,
    successfulCalls: 0,
    failedCalls: 0,
    averageExecutionTimeMs: 0,
    callHistory: [],
  })

  /**
   * Inicializar - carregar servidores MCP disponíveis
   */
  const initialize = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const servers = await claudeCodeBridge.getServerStatus()
      const tools = await claudeCodeBridge.getAvailableTools()

      setState(prev => ({
        ...prev,
        servers,
        availableTools: tools,
        loading: false,
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setState(prev => ({ ...prev, loading: false, error: errorMessage }))
    }
  }, [])

  /**
   * Chamar ferramenta MCP
   */
  const callTool = useCallback(
    async (
      serverId: string,
      toolName: string,
      parameters: Record<string, unknown>,
    ): Promise<ToolExecutionResult> => {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const result = await claudeCodeBridge.callMCPTool(serverId, toolName, parameters)

        // Atualizar estado com resultado
        setState(prev => ({
          ...prev,
          loading: false,
        }))

        // Atualizar histórico e monitoramento
        const history = claudeCodeBridge.getToolCallHistory()
        const stats = claudeCodeBridge.getUsageStats()

        setMonitoring({
          totalCallsThisSession: stats.totalCalls,
          successfulCalls: stats.successfulCalls,
          failedCalls: stats.failedCalls,
          averageExecutionTimeMs: stats.averageExecutionTime,
          callHistory: history,
        })

        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setState(prev => ({ ...prev, loading: false, error: errorMessage }))
        throw error
      }
    },
    [],
  )

  /**
   * Chamar múltiplas ferramentas em paralelo
   */
  const callMultipleTools = useCallback(
    async (
      calls: Array<{
        serverId: string
        toolName: string
        parameters: Record<string, unknown>
      }>,
    ): Promise<ToolExecutionResult[]> => {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const results = await claudeCodeBridge.callMultipleTools(calls)

        setState(prev => ({ ...prev, loading: false }))

        // Atualizar histórico
        const history = claudeCodeBridge.getToolCallHistory()
        const stats = claudeCodeBridge.getUsageStats()

        setMonitoring({
          totalCallsThisSession: stats.totalCalls,
          successfulCalls: stats.successfulCalls,
          failedCalls: stats.failedCalls,
          averageExecutionTimeMs: stats.averageExecutionTime,
          callHistory: history,
        })

        return results
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setState(prev => ({ ...prev, loading: false, error: errorMessage }))
        throw error
      }
    },
    [],
  )

  /**
   * Verificar saúde de servidor
   */
  const checkServerHealth = useCallback(async (serverId: string): Promise<boolean> => {
    try {
      const isHealthy = await claudeCodeBridge.checkServerHealth(serverId)
      const servers = await claudeCodeBridge.getServerStatus()
      setState(prev => ({ ...prev, servers }))
      return isHealthy
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setState(prev => ({ ...prev, error: errorMessage }))
      return false
    }
  }, [])

  /**
   * Verificar saúde de todos os servidores
   */
  const checkAllServersHealth = useCallback(async () => {
    const results: { [serverId: string]: boolean } = {}

    for (const server of state.servers) {
      results[server.id] = await checkServerHealth(server.id)
    }

    return results
  }, [state.servers, checkServerHealth])

  /**
   * Limpar histórico
   */
  const clearHistory = useCallback(() => {
    claudeCodeBridge.clearToolCallHistory()
    setMonitoring({
      totalCallsThisSession: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageExecutionTimeMs: 0,
      callHistory: [],
    })
  }, [])

  /**
   * Inicializar ao montar componente
   */
  useEffect(() => {
    initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Iniciar monitoramento de saúde
   */
  useEffect(() => {
    const interval = claudeCodeBridge.startHealthMonitoring(30000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  return {
    // State
    servers: state.servers,
    availableTools: state.availableTools,
    loading: state.loading,
    error: state.error,

    // Monitoring
    totalCalls: monitoring.totalCallsThisSession,
    successfulCalls: monitoring.successfulCalls,
    failedCalls: monitoring.failedCalls,
    averageExecutionTime: monitoring.averageExecutionTimeMs,
    callHistory: monitoring.callHistory,

    // Methods
    initialize,
    callTool,
    callMultipleTools,
    checkServerHealth,
    checkAllServersHealth,
    clearHistory,

    // Helpers
    isServerHealthy: (serverId: string) =>
      state.servers.find(s => s.id === serverId)?.status === 'connected',
    getServerStatus: (serverId: string) =>
      state.servers.find(s => s.id === serverId),
    hasAvailableTools: state.availableTools.length > 0,
    getToolsForServer: (serverId: string) =>
      state.availableTools.filter(t => t.startsWith(`${serverId}:`)),
  }
}
