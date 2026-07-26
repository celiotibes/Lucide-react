// src/modules/index.ts
// Central export point for all modules

// Phase 1 - Critical Modules
export * from './pki';
export * from './ged';
export * from './timesheet';

// Module registration for Express app
import { Router } from 'express';
import { Database } from '@/database';
import { setupPKIRoutes } from './pki';
import { setupGEDRoutes } from './ged';
import { setupTimesheetRoutes } from './timesheet';

/**
 * Register all modules with Express
 */
export function registerModules(router: Router, db: Database): void {
  console.log('[Modules] Registering Phase 1 modules...');

  // PKI Module
  router.use(setupPKIRoutes(db));
  console.log('[Modules] ✓ PKI module registered');

  // GED Module
  router.use(setupGEDRoutes(db));
  console.log('[Modules] ✓ GED module registered');

  // Timesheet Module
  router.use(setupTimesheetRoutes(db));
  console.log('[Modules] ✓ Timesheet module registered');

  console.log('[Modules] All Phase 1 modules registered successfully');
}
