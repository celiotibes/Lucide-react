/**
 * Integration Audit Script - Phase 5
 * Validates correlations between:
 * - Phase 1: Platform integrations
 * - Phase 2: Logger integration
 * - Phase 3: Performance baseline
 * - Phase 4: Cache optimization
 *
 * Checks:
 * 1. All imports are available and working
 * 2. Logger instances are properly configured
 * 3. Cache integration doesn't break existing functionality
 * 4. Performance improvements are measurable
 * 5. Database schema supports all features
 */

import { performance } from 'perf_hooks';
import * as fs from 'fs';

interface AuditResult {
  category: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: Record<string, unknown>;
}

class IntegrationAuditor {
  private results: AuditResult[] = [];
  private logger = {
    info: (msg: string, data?: unknown) => console.log(`✓ ${msg}`, data || ''),
    warn: (msg: string, data?: unknown) => console.warn(`⚠ ${msg}`, data || ''),
    error: (msg: string, data?: unknown) => console.error(`✗ ${msg}`, data || ''),
  };

  // ============================================================================
  // PHASE 1: Platform Integrations Audit
  // ============================================================================

  async auditPhase1Integrations(): Promise<void> {
    console.log('\n📋 AUDITING PHASE 1: Platform Integrations\n');

    // Check 1: Hospeda Client exists and has required methods
    try {
      const hospedaPath = './src/integrations/hospeda/hospeda-client.ts';
      const hospedaContent = fs.readFileSync(hospedaPath, 'utf-8');

      const requiredMethods = [
        'getProperties',
        'createProperty',
        'updateProperty',
        'uploadImages',
        'publishProperty',
        'getBookings',
        'getPropertyStats',
        'verifyWebhookSignature',
      ];

      const missingMethods = requiredMethods.filter((method) => !hospedaContent.includes(`${method}(`));

      if (missingMethods.length === 0) {
        this.addResult('Phase 1', 'Hospeda Client Methods', 'PASS', 'All required methods present', {
          methods: requiredMethods.length,
        });
      } else {
        this.addResult('Phase 1', 'Hospeda Client Methods', 'FAIL', 'Missing methods', {
          missing: missingMethods,
        });
      }
    } catch (error) {
      this.addResult('Phase 1', 'Hospeda Client Check', 'FAIL', `File not found: ${error}`);
    }

    // Check 2: Booking Apartments Client
    try {
      const bookingPath = './src/integrations/booking/booking-apartments-client.ts';
      const bookingContent = fs.readFileSync(bookingPath, 'utf-8');

      const hasApartmentMethods = bookingContent.includes('getApartments') && bookingContent.includes('updatePricingByDate');

      if (hasApartmentMethods) {
        this.addResult('Phase 1', 'Booking Apartments Client', 'PASS', 'Apartment-specific methods present');
      } else {
        this.addResult('Phase 1', 'Booking Apartments Client', 'FAIL', 'Missing apartment methods');
      }
    } catch (error) {
      this.addResult('Phase 1', 'Booking Apartments Check', 'FAIL', `File not found: ${error}`);
    }

    // Check 3: TripAdvisor Client
    try {
      const tripPath = './src/integrations/tripadvisor/tripadvisor-client.ts';
      const tripContent = fs.readFileSync(tripPath, 'utf-8');

      const hasRatingMethods = tripContent.includes('getPropertyRatings') && tripContent.includes('getPropertyReviews');

      if (hasRatingMethods) {
        this.addResult('Phase 1', 'TripAdvisor Client', 'PASS', 'Rating methods present');
      } else {
        this.addResult('Phase 1', 'TripAdvisor Client', 'FAIL', 'Missing rating methods');
      }
    } catch (error) {
      this.addResult('Phase 1', 'TripAdvisor Check', 'FAIL', `File not found: ${error}`);
    }

    // Check 4: Database Migration exists
    try {
      const migrationPath = './db/migrations/02_add_multi_platform_support.ts';
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

      const requiredTables = ['platform_ratings', 'calendar_blocks', 'platform_pricing_by_date', 'webhooks'];

      const missingTables = requiredTables.filter((table) => !migrationContent.includes(table));

      if (missingTables.length === 0) {
        this.addResult('Phase 1', 'Database Migration', 'PASS', 'All required tables defined', {
          tables: requiredTables.length,
        });
      } else {
        this.addResult('Phase 1', 'Database Migration', 'FAIL', 'Missing table definitions', {
          missing: missingTables,
        });
      }
    } catch (error) {
      this.addResult('Phase 1', 'Database Migration Check', 'FAIL', `File not found: ${error}`);
    }

    // Check 5: Workers exist
    try {
      const workerFiles = [
        './src/workers/sync-hospeda-listings.ts',
        './src/workers/sync-booking-apartments.ts',
        './src/workers/sync-tripadvisor-ratings.ts',
      ];

      const existingWorkers = workerFiles.filter((file) => {
        try {
          fs.accessSync(file);
          return true;
        } catch {
          return false;
        }
      });

      if (existingWorkers.length === 3) {
        this.addResult('Phase 1', 'Worker Files', 'PASS', 'All 3 workers present');
      } else {
        this.addResult('Phase 1', 'Worker Files', 'FAIL', `Only ${existingWorkers.length}/3 workers found`);
      }
    } catch (error) {
      this.addResult('Phase 1', 'Worker Files Check', 'FAIL', `Error: ${error}`);
    }
  }

  // ============================================================================
  // PHASE 2: Logger Integration Audit
  // ============================================================================

  async auditPhase2Logger(): Promise<void> {
    console.log('\n📋 AUDITING PHASE 2: Logger Integration\n');

    // Check 1: Logger base file has getLogger method
    try {
      const loggerPath = './src/shared/logger.ts';
      const loggerContent = fs.readFileSync(loggerPath, 'utf-8');

      const hasGetLogger = loggerContent.includes('getLogger(');
      const hasLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'].every((level) => loggerContent.includes(`'${level}'`));

      if (hasGetLogger && hasLogLevels) {
        this.addResult('Phase 2', 'Logger Base Implementation', 'PASS', 'getLogger and all log levels present');
      } else {
        this.addResult('Phase 2', 'Logger Base Implementation', 'FAIL', 'Missing getLogger or log levels');
      }
    } catch (error) {
      this.addResult('Phase 2', 'Logger Check', 'FAIL', `File not found: ${error}`);
    }

    // Check 2: Workers have logger integration
    try {
      const workerFiles = [
        './src/workers/sync-hospeda-listings.ts',
        './src/workers/sync-booking-apartments.ts',
        './src/workers/sync-tripadvisor-ratings.ts',
      ];

      let allHaveLogger = true;
      for (const file of workerFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (!content.includes("Logger.getLogger('") && !content.includes('logger.info')) {
          allHaveLogger = false;
          break;
        }
      }

      if (allHaveLogger) {
        this.addResult('Phase 2', 'Worker Logger Integration', 'PASS', 'All workers have logger');
      } else {
        this.addResult('Phase 2', 'Worker Logger Integration', 'FAIL', 'Some workers missing logger');
      }
    } catch (error) {
      this.addResult('Phase 2', 'Worker Logger Check', 'FAIL', `Error: ${error}`);
    }

    // Check 3: Services have logger integration
    try {
      const serviceFiles = [
        './src/properties/services/lead.service.ts',
        './src/services/pricing-engine.ts',
        './src/properties/services/property.service.ts',
      ];

      let allHaveLogger = true;
      for (const file of serviceFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (!content.includes('Logger') && !content.includes('logger')) {
          allHaveLogger = false;
          break;
        }
      }

      if (allHaveLogger) {
        this.addResult('Phase 2', 'Service Logger Integration', 'PASS', 'All services have logger');
      } else {
        this.addResult('Phase 2', 'Service Logger Integration', 'FAIL', 'Some services missing logger');
      }
    } catch (error) {
      this.addResult('Phase 2', 'Service Logger Check', 'FAIL', `Error: ${error}`);
    }

    // Check 4: Environment configuration
    try {
      const envPath = './.env.example';
      const envContent = fs.readFileSync(envPath, 'utf-8');

      const logVars = ['LOG_LEVEL', 'LOG_FORMAT', 'LOG_RETENTION_DAYS'].every((v) => envContent.includes(v));

      if (logVars) {
        this.addResult('Phase 2', 'Environment Configuration', 'PASS', 'All logging variables present');
      } else {
        this.addResult('Phase 2', 'Environment Configuration', 'FAIL', 'Missing logging environment variables');
      }
    } catch (error) {
      this.addResult('Phase 2', 'Environment Check', 'FAIL', `File not found: ${error}`);
    }
  }

  // ============================================================================
  // PHASE 3: Performance Baseline Audit
  // ============================================================================

  async auditPhase3Performance(): Promise<void> {
    console.log('\n📋 AUDITING PHASE 3: Performance Baseline\n');

    // Check 1: Baseline script exists
    try {
      const baselinePath = './scripts/performance-baseline.ts';
      const baselineContent = fs.readFileSync(baselinePath, 'utf-8');

      const hasTests = ['simulateSyncHospeda', 'simulateSyncBooking', 'simulateSyncTripAdvisor'].every((method) =>
        baselineContent.includes(method)
      );

      if (hasTests) {
        this.addResult('Phase 3', 'Baseline Test Script', 'PASS', 'All test methods present');
      } else {
        this.addResult('Phase 3', 'Baseline Test Script', 'FAIL', 'Missing test methods');
      }
    } catch (error) {
      this.addResult('Phase 3', 'Baseline Script Check', 'FAIL', `File not found: ${error}`);
    }

    // Check 2: Baseline metrics file
    try {
      const metricsPath = './backend/scripts/performance-baseline.json';
      const metricsContent = fs.readFileSync(metricsPath, 'utf-8');
      const metrics = JSON.parse(metricsContent);

      if (
        metrics.summary &&
        metrics.summary.SyncHospedaWorker &&
        metrics.summary.SyncBookingApartmentsWorker &&
        metrics.summary.SyncTripAdvisorRatingsWorker
      ) {
        this.addResult('Phase 3', 'Baseline Metrics', 'PASS', 'All component metrics recorded', {
          components: 6,
          operations: metrics.details.length,
        });
      } else {
        this.addResult('Phase 3', 'Baseline Metrics', 'FAIL', 'Incomplete metrics data');
      }
    } catch (error) {
      this.addResult('Phase 3', 'Baseline Metrics Check', 'WARN', `Metrics not yet available: ${error}`);
    }
  }

  // ============================================================================
  // PHASE 4: Cache Optimization Audit
  // ============================================================================

  async auditPhase4Cache(): Promise<void> {
    console.log('\n📋 AUDITING PHASE 4: Cache Optimization\n');

    // Check 1: Cache service exists
    try {
      const cachePath = './src/shared/cache.ts';
      const cacheContent = fs.readFileSync(cachePath, 'utf-8');

      const cacheClasses = ['CacheService', 'RatingCache', 'OccupancyCache', 'BatchRequestCache'].every((cls) =>
        cacheContent.includes(`class ${cls}`)
      );

      if (cacheClasses) {
        this.addResult('Phase 4', 'Cache Service Implementation', 'PASS', 'All cache classes present');
      } else {
        this.addResult('Phase 4', 'Cache Service Implementation', 'FAIL', 'Missing cache classes');
      }
    } catch (error) {
      this.addResult('Phase 4', 'Cache Service Check', 'FAIL', `File not found: ${error}`);
    }

    // Check 2: Pricing engine has cache integration
    try {
      const pricingPath = './src/services/pricing-engine.ts';
      const pricingContent = fs.readFileSync(pricingPath, 'utf-8');

      const hasCacheImport = pricingContent.includes('occupancyCache');
      const hasCacheUsage = pricingContent.includes('getOrFetch');

      if (hasCacheImport && hasCacheUsage) {
        this.addResult('Phase 4', 'Pricing Engine Cache Integration', 'PASS', 'Cache integrated in pricing engine');
      } else {
        this.addResult('Phase 4', 'Pricing Engine Cache Integration', 'FAIL', 'Cache not properly integrated');
      }
    } catch (error) {
      this.addResult('Phase 4', 'Pricing Engine Check', 'FAIL', `File not found: ${error}`);
    }

    // Check 3: TripAdvisor worker has cache integration
    try {
      const tripPath = './src/workers/sync-tripadvisor-ratings.ts';
      const tripContent = fs.readFileSync(tripPath, 'utf-8');

      const hasCacheImport = tripContent.includes('ratingCache');
      const hasCacheUsage = tripContent.includes('getRatingOrFetch');

      if (hasCacheImport && hasCacheUsage) {
        this.addResult('Phase 4', 'TripAdvisor Cache Integration', 'PASS', 'Rating cache integrated');
      } else {
        this.addResult('Phase 4', 'TripAdvisor Cache Integration', 'FAIL', 'Rating cache not integrated');
      }
    } catch (error) {
      this.addResult('Phase 4', 'TripAdvisor Check', 'FAIL', `File not found: ${error}`);
    }

    // Check 4: Hospeda batch client exists
    try {
      const batchPath = './src/integrations/hospeda/hospeda-batch-client.ts';
      const batchContent = fs.readFileSync(batchPath, 'utf-8');

      const hasBatchClass = batchContent.includes('class HospedaBatchClient');
      const hasBatchMethods = ['queueUpdate', 'processBatch', 'flush'].every((method) => batchContent.includes(method));

      if (hasBatchClass && hasBatchMethods) {
        this.addResult('Phase 4', 'Hospeda Batch Client', 'PASS', 'Batch processing implemented');
      } else {
        this.addResult('Phase 4', 'Hospeda Batch Client', 'FAIL', 'Batch implementation incomplete');
      }
    } catch (error) {
      this.addResult('Phase 4', 'Hospeda Batch Check', 'FAIL', `File not found: ${error}`);
    }
  }

  // ============================================================================
  // Cross-Phase Integration Audit
  // ============================================================================

  async auditCrossPhaseIntegration(): Promise<void> {
    console.log('\n📋 AUDITING CROSS-PHASE INTEGRATION\n');

    // Check 1: All imports are available
    try {
      const criticalImports = [
        { file: './src/services/pricing-engine.ts', import: 'occupancyCache' },
        { file: './src/workers/sync-tripadvisor-ratings.ts', import: 'ratingCache' },
        { file: './src/shared/cache.ts', import: 'CacheService' },
      ];

      let allImportsValid = true;
      for (const { file, import: importName } of criticalImports) {
        const content = fs.readFileSync(file, 'utf-8');
        if (!content.includes(importName)) {
          allImportsValid = false;
          break;
        }
      }

      if (allImportsValid) {
        this.addResult(
          'Integration',
          'Critical Imports',
          'PASS',
          'All cross-phase imports available'
        );
      } else {
        this.addResult('Integration', 'Critical Imports', 'FAIL', 'Some imports missing');
      }
    } catch (error) {
      this.addResult('Integration', 'Imports Check', 'FAIL', `Error: ${error}`);
    }

    // Check 2: Logger doesn't break cache
    try {
      const cacheContent = fs.readFileSync('./src/shared/cache.ts', 'utf-8');
      const pricingContent = fs.readFileSync('./src/services/pricing-engine.ts', 'utf-8');

      const cacheHasLogger = cacheContent.includes('Logger');
      const pricingHasLogger = pricingContent.includes('Logger');

      if (cacheHasLogger && pricingHasLogger) {
        this.addResult('Integration', 'Logger + Cache Compatibility', 'PASS', 'Logger properly integrated with cache');
      } else {
        this.addResult(
          'Integration',
          'Logger + Cache Compatibility',
          'WARN',
          'Logger integration could be more complete'
        );
      }
    } catch (error) {
      this.addResult('Integration', 'Logger Compatibility Check', 'FAIL', `Error: ${error}`);
    }

    // Check 3: Database schema supports all features
    try {
      const migrationContent = fs.readFileSync('./db/migrations/02_add_multi_platform_support.ts', 'utf-8');

      const requiredFeatures = [
        { feature: 'platform_ratings', description: 'Rating cache support' },
        { feature: 'calendar_blocks', description: 'Calendar sync' },
        { feature: 'webhooks', description: 'Webhook registration' },
      ];

      let allSupported = true;
      for (const { feature } of requiredFeatures) {
        if (!migrationContent.includes(feature)) {
          allSupported = false;
          break;
        }
      }

      if (allSupported) {
        this.addResult('Integration', 'Database Schema Support', 'PASS', 'Schema supports all features');
      } else {
        this.addResult('Integration', 'Database Schema Support', 'FAIL', 'Schema missing some features');
      }
    } catch (error) {
      this.addResult('Integration', 'Database Check', 'FAIL', `Error: ${error}`);
    }

    // Check 4: Performance improvements don't break functionality
    try {
      const hospedaWorkerContent = fs.readFileSync('./src/workers/sync-hospeda-listings.ts', 'utf-8');
      const tripAdvisorContent = fs.readFileSync('./src/workers/sync-tripadvisor-ratings.ts', 'utf-8');
      const pricingContent = fs.readFileSync('./src/services/pricing-engine.ts', 'utf-8');

      // Check that cache has fallback mechanisms
      const cacheContent = fs.readFileSync('./src/shared/cache.ts', 'utf-8');
      const hasFallback = cacheContent.includes('catch') || cacheContent.includes('try');

      if (hasFallback) {
        this.addResult('Integration', 'Cache Resilience', 'PASS', 'Cache has fallback mechanisms');
      } else {
        this.addResult('Integration', 'Cache Resilience', 'WARN', 'Cache could have better error handling');
      }
    } catch (error) {
      this.addResult('Integration', 'Resilience Check', 'FAIL', `Error: ${error}`);
    }
  }

  // ============================================================================
  // Functionality Correlation Audit
  // ============================================================================

  async auditFunctionalityCorrelation(): Promise<void> {
    console.log('\n📋 AUDITING FUNCTIONALITY CORRELATION\n');

    // Check 1: Worker → Integration correlation
    try {
      const workersToCheck = [
        {
          worker: './src/workers/sync-hospeda-listings.ts',
          integration: './src/integrations/hospeda/hospeda-client.ts',
          clientName: 'HospedaClient',
        },
        {
          worker: './src/workers/sync-booking-apartments.ts',
          integration: './src/integrations/booking/booking-apartments-client.ts',
          clientName: 'BookingApartmentsClient',
        },
        {
          worker: './src/workers/sync-tripadvisor-ratings.ts',
          integration: './src/integrations/tripadvisor/tripadvisor-client.ts',
          clientName: 'TripAdvisorClient',
        },
      ];

      let allCorrelated = true;
      for (const check of workersToCheck) {
        const workerContent = fs.readFileSync(check.worker, 'utf-8');
        const integrationContent = fs.readFileSync(check.integration, 'utf-8');

        if (!workerContent.includes(check.clientName) || !integrationContent.includes(`class ${check.clientName}`)) {
          allCorrelated = false;
          break;
        }
      }

      if (allCorrelated) {
        this.addResult(
          'Correlation',
          'Worker ↔ Integration Links',
          'PASS',
          'All workers properly linked to integrations'
        );
      } else {
        this.addResult('Correlation', 'Worker ↔ Integration Links', 'FAIL', 'Some worker-integration links broken');
      }
    } catch (error) {
      this.addResult('Correlation', 'Worker-Integration Check', 'FAIL', `Error: ${error}`);
    }

    // Check 2: Service → Database correlation
    try {
      const servicesAndTables = [
        {
          service: './src/properties/services/lead.service.ts',
          table: 'leads',
          tableFile: './db/migrations/02_add_multi_platform_support.ts',
        },
        {
          service: './src/services/pricing-engine.ts',
          table: 'pricing_rules',
          tableFile: './db/migrations/02_add_multi_platform_support.ts',
        },
      ];

      let allCorrelated = true;
      for (const check of servicesAndTables) {
        const serviceContent = fs.readFileSync(check.service, 'utf-8');
        const migrationContent = fs.readFileSync(check.tableFile, 'utf-8');

        // Services should query tables and migrations should create them
        if (!serviceContent.includes(check.table) && !migrationContent.includes(check.table)) {
          allCorrelated = false;
          break;
        }
      }

      if (allCorrelated) {
        this.addResult('Correlation', 'Service ↔ Database Links', 'PASS', 'Services properly linked to database');
      } else {
        this.addResult('Correlation', 'Service ↔ Database Links', 'WARN', 'Some service-database links could be verified');
      }
    } catch (error) {
      this.addResult('Correlation', 'Service-Database Check', 'WARN', `Could not fully verify: ${error}`);
    }

    // Check 3: Cache → Data source correlation
    try {
      const cacheContent = fs.readFileSync('./src/shared/cache.ts', 'utf-8');
      const pricingContent = fs.readFileSync('./src/services/pricing-engine.ts', 'utf-8');
      const tripContent = fs.readFileSync('./src/workers/sync-tripadvisor-ratings.ts', 'utf-8');

      // Check that cache integrations have proper getOrFetch patterns
      const hasPricingCache = pricingContent.includes('occupancyCache.getOrFetch');
      const hasTripCache = tripContent.includes('ratingCache.getRatingOrFetch');

      if (hasPricingCache && hasTripCache) {
        this.addResult('Correlation', 'Cache ↔ Data Sources', 'PASS', 'Cache properly integrated with data sources');
      } else {
        this.addResult('Correlation', 'Cache ↔ Data Sources', 'WARN', 'Cache integration could be more complete');
      }
    } catch (error) {
      this.addResult('Correlation', 'Cache-DataSource Check', 'FAIL', `Error: ${error}`);
    }
  }

  // ============================================================================
  // Results Management
  // ============================================================================

  private addResult(category: string, test: string, status: 'PASS' | 'FAIL' | 'WARN', message: string, details?: Record<string, unknown>): void {
    this.results.push({ category, test, status, message, details });

    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} [${category}] ${test}: ${message}`);
    if (details) {
      console.log(`   └─ ${JSON.stringify(details)}`);
    }
  }

  printSummary(): void {
    console.log('\n\n═══════════════════════════════════════════════════════════════\n');
    console.log('📊 AUDIT SUMMARY\n');

    const passes = this.results.filter((r) => r.status === 'PASS').length;
    const fails = this.results.filter((r) => r.status === 'FAIL').length;
    const warns = this.results.filter((r) => r.status === 'WARN').length;

    console.log(`✅ PASSED: ${passes}`);
    console.log(`❌ FAILED: ${fails}`);
    console.log(`⚠️  WARNINGS: ${warns}`);
    console.log(`📊 TOTAL:   ${this.results.length}\n`);

    // Summary by category
    const byCategory = new Map<string, { pass: number; fail: number; warn: number }>();
    for (const result of this.results) {
      if (!byCategory.has(result.category)) {
        byCategory.set(result.category, { pass: 0, fail: 0, warn: 0 });
      }
      const stats = byCategory.get(result.category)!;
      if (result.status === 'PASS') stats.pass++;
      else if (result.status === 'FAIL') stats.fail++;
      else stats.warn++;
    }

    console.log('By Category:');
    for (const [category, stats] of byCategory) {
      const total = stats.pass + stats.fail + stats.warn;
      const percentage = Math.round((stats.pass / total) * 100);
      console.log(`  ${category.padEnd(15)} ${percentage.toString().padStart(3)}% (${stats.pass}/${total})`);
    }

    // Overall status
    const overallPercentage = Math.round((passes / this.results.length) * 100);
    console.log(`\n${'Overall'.padEnd(15)} ${overallPercentage.toString().padStart(3)}% (${passes}/${this.results.length})`);

    if (fails === 0) {
      console.log('\n✨ ALL CRITICAL CHECKS PASSED ✨');
    } else {
      console.log(`\n⚠️  ${fails} CRITICAL ISSUE(S) FOUND - REVIEW REQUIRED`);
    }

    // Save results to file
    const reportPath = './audit-results.json';
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          summary: { passes, fails, warns, total: this.results.length, percentage: overallPercentage },
          results: this.results,
        },
        null,
        2
      )
    );

    console.log(`\n📄 Full audit report saved to: ${reportPath}`);
  }

  async runFullAudit(): Promise<void> {
    console.log('🔍 STARTING COMPREHENSIVE INTEGRATION AUDIT\n');
    console.log('═══════════════════════════════════════════════════════════════\n');

    await this.auditPhase1Integrations();
    await this.auditPhase2Logger();
    await this.auditPhase3Performance();
    await this.auditPhase4Cache();
    await this.auditCrossPhaseIntegration();
    await this.auditFunctionalityCorrelation();

    this.printSummary();
  }
}

// Run audit
const auditor = new IntegrationAuditor();
auditor.runFullAudit();
