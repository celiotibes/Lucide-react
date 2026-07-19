import { useEffect, useState } from 'react'
import { budgetTracking } from '../services/budgetTracking'
import { notificationService } from '../services/notificationService'

export interface BudgetAlertState {
  status: string
  percentageUsed: number
  spent: number
  budget: number
  projected: number
}

/**
 * FASE 8: Hook para alertas de orçamento
 * Monitora spend vs budget e exibe notificações
 */
export function useBudgetAlerts() {
  const [budgetState, setBudgetState] = useState<BudgetAlertState | null>(null)

  useEffect(() => {
    let lastAlertedStatus = sessionStorage.getItem('lastBudgetAlertStatus') || ''

    const checkInterval = setInterval(() => {
      const status = budgetTracking.getStatus()

      setBudgetState({
        status: status.status,
        percentageUsed: status.percentageUsed,
        spent: status.spent,
        budget: status.budget,
        projected: status.projectedEnd,
      })

      // Alert only on status change
      if (status.status !== lastAlertedStatus) {
        let message = ''
        let notificationType: 'info' | 'warning' | 'error' = 'info'

        if (status.status === 'over_budget') {
          message = `⚠️ Budget exceeded! Spent $${status.spent}/${status.budget} (${status.percentageUsed}%)`
          notificationType = 'error'
        } else if (status.status === 'critical') {
          message = `🔴 Critical budget level: ${status.percentageUsed}% used ($${status.spent}/$${status.budget})`
          notificationType = 'error'
        } else if (status.status === 'warning') {
          message = `🟡 Budget warning: ${status.percentageUsed}% used ($${status.spent}/$${status.budget})`
          notificationType = 'warning'
        } else {
          message = `✅ Budget back to normal: ${status.percentageUsed}% used ($${status.spent}/$${status.budget})`
          notificationType = 'info'
        }

        notificationService.show(message, notificationType, status.status === 'over_budget' ? 0 : 7000)
        lastAlertedStatus = status.status
        sessionStorage.setItem('lastBudgetAlertStatus', status.status)
      }
    }, 60000) // Check every minute

    return () => clearInterval(checkInterval)
  }, [])

  return budgetState
}
