// src/modules/alerts/index.ts
export { AlertsService } from './alerts.service';
export { setupAlertsRoutes } from './routes';
export type {
  Alert,
  AlertRule,
  AlertCondition,
  DeadlineAlert,
  PredictiveAlert,
  AlertHistory,
  AlertPreference,
  AlertConfig,
} from './types';
