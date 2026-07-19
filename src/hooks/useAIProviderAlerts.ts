import { useEffect } from 'react'
import { aiProviderMonitoring } from '../services/aiProviderMonitoring'
import { notificationService } from '../services/notificationService'

/**
 * FASE 7.4: Hook para consumir alertas do monitoring e exibir como toasts
 * Converte eventos críticos em notificações visuais
 */
export function useAIProviderAlerts() {
  // Monitor para novos alertas críticos
  useEffect(() => {
    let lastCheckTime = Date.now()

    const checkInterval = setInterval(() => {
      const health = aiProviderMonitoring.getAllProvidersHealth()
      const now = Date.now()

      // Verificar cada provider para degradação
      for (const provider of Object.values(health)) {
        const status = provider.status
        if (status === 'unhealthy' || status === 'degraded') {
          const qualityPercent = Math.round(provider.avgQuality)
          const message = `${provider.provider}: ${status} (${qualityPercent}% quality)`
          const notificationType = status === 'unhealthy' ? 'error' : 'warning'

          // Não notificar se vimos isso recentemente
          const key = `notif_${provider.provider}_${status}`
          const lastNotif = sessionStorage.getItem(key)
          if (!lastNotif || now - parseInt(lastNotif) > 30000) {
            notificationService.show(message, notificationType, 8000)
            sessionStorage.setItem(key, now.toString())
          }
        }
      }

      lastCheckTime = now
    }, 10000) // Check every 10 seconds

    return () => clearInterval(checkInterval)
  }, [])
}
