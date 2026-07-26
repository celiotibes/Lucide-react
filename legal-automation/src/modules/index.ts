// src/modules/index.ts
// Central export point for all modules

// Phase 1 - Critical Modules
export * from './pki';
export * from './ged';
export * from './timesheet';

// Phase 2 - AI, Mobile, Alerts
export * from './ai';
export * from './mobile';
export * from './alerts';

// Phase 3 - Calendar, Reports, Portal
export * from './calendar';
export * from './reports';
export * from './portal';

// Module registration for Express app
import { Router } from 'express';
import { Database } from '@/database';
import { setupPKIRoutes } from './pki';
import { setupGEDRoutes } from './ged';
import { setupTimesheetRoutes } from './timesheet';
import { setupAIRoutes } from './ai';
import { setupMobileRoutes } from './mobile';
import { setupAlertsRoutes } from './alerts';
import { setupCalendarRoutes } from './calendar';
import { setupReportsRoutes } from './reports';
import { setupPortalRoutes } from './portal';

/**
 * Register all modules with Express
 */
export function registerModules(router: Router, db: Database): void {
  console.log('[Modules] Registering Phase 1, 2 & 3 modules...');

  // Phase 1 Modules
  router.use('/pki', setupPKIRoutes(db));
  console.log('[Modules] ✓ PKI module registered');

  router.use('/ged', setupGEDRoutes(db));
  console.log('[Modules] ✓ GED module registered');

  router.use('/timesheet', setupTimesheetRoutes(db));
  console.log('[Modules] ✓ Timesheet module registered');

  // Phase 2 Modules
  router.use('/ai', setupAIRoutes(db));
  console.log('[Modules] ✓ AI module registered');

  router.use('/mobile', setupMobileRoutes(db));
  console.log('[Modules] ✓ Mobile module registered');

  router.use('/alerts', setupAlertsRoutes(db));
  console.log('[Modules] ✓ Alerts module registered');

  // Phase 3 Modules
  router.use('/calendar', setupCalendarRoutes(db));
  console.log('[Modules] ✓ Calendar module registered');

  router.use('/reports', setupReportsRoutes(db));
  console.log('[Modules] ✓ Reports module registered');

  router.use('/portal', setupPortalRoutes(db));
  console.log('[Modules] ✓ Portal module registered');

  console.log('[Modules] All Phase 1, 2 & 3 modules registered successfully');
}
