/**
 * Business Intelligence Module
 * Exportação centralizada de serviços e workers de BI
 */

// Services
export { KPICalculator, createKPICalculator } from './services/kpi-calculator';

// Workers
export { default as syncFinancialReportingWorker } from './workers/sync-financial-reporting';

// Transformers
export {
  FinancialTransformer,
  createFinancialTransformer,
} from './utils/transformers/financial-transformer';
