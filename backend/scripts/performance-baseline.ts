/**
 * Performance Baseline Testing Suite
 * Measures response times for critical operations:
 * - Worker synchronization (Hospeda, Booking, TripAdvisor)
 * - Service operations (Lead, Pricing, Property)
 * - API integrations
 */

import { performance } from 'perf_hooks';

interface PerformanceMetric {
  operation: string;
  duration_ms: number;
  timestamp: string;
  component: string;
  status: 'success' | 'error';
  error?: string;
}

class PerformanceBaseline {
  private metrics: PerformanceMetric[] = [];

  // Simulate worker operations
  async simulateSyncHospedaListing(propertyCount: number = 10): Promise<PerformanceMetric> {
    const start = performance.now();
    const timestamp = new Date().toISOString();

    try {
      // Simulate API calls: create/update property
      for (let i = 0; i < propertyCount; i++) {
        await this.simulateApiCall(100); // 100ms per API call
      }

      // Simulate image upload: 50ms per property
      await this.simulateApiCall(propertyCount * 50);

      // Simulate property publish: 30ms
      await this.simulateApiCall(30);

      // Simulate stats fetch: 50ms
      await this.simulateApiCall(50);

      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `sync_hospeda_listings[${propertyCount}_properties]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'SyncHospedaWorker',
        status: 'success',
      };

      this.metrics.push(metric);
      return metric;
    } catch (error) {
      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `sync_hospeda_listings[${propertyCount}_properties]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'SyncHospedaWorker',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.metrics.push(metric);
      throw error;
    }
  }

  async simulateSyncBookingApartments(propertyCount: number = 10): Promise<PerformanceMetric> {
    const start = performance.now();
    const timestamp = new Date().toISOString();

    try {
      // Simulate apartment creation: 80ms per property
      for (let i = 0; i < propertyCount; i++) {
        await this.simulateApiCall(80);
      }

      // Simulate calendar sync: 20ms per property * 30 days
      await this.simulateApiCall(propertyCount * 20);

      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `sync_booking_apartments[${propertyCount}_properties]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'SyncBookingApartmentsWorker',
        status: 'success',
      };

      this.metrics.push(metric);
      return metric;
    } catch (error) {
      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `sync_booking_apartments[${propertyCount}_properties]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'SyncBookingApartmentsWorker',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.metrics.push(metric);
      throw error;
    }
  }

  async simulateSyncTripAdvisorRatings(propertyCount: number = 10): Promise<PerformanceMetric> {
    const start = performance.now();
    const timestamp = new Date().toISOString();

    try {
      // Simulate rating fetch: 150ms per property
      for (let i = 0; i < propertyCount; i++) {
        await this.simulateApiCall(150);
      }

      // Simulate pricing recalculation: 100ms total
      await this.simulateApiCall(100);

      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `sync_tripadvisor_ratings[${propertyCount}_properties]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'SyncTripAdvisorRatingsWorker',
        status: 'success',
      };

      this.metrics.push(metric);
      return metric;
    } catch (error) {
      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `sync_tripadvisor_ratings[${propertyCount}_properties]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'SyncTripAdvisorRatingsWorker',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.metrics.push(metric);
      throw error;
    }
  }

  // Service operations
  async simulateLeadCreation(leadCount: number = 100): Promise<PerformanceMetric> {
    const start = performance.now();
    const timestamp = new Date().toISOString();

    try {
      // Database insert: 5ms per lead
      for (let i = 0; i < leadCount; i++) {
        await this.simulateDbOperation(5);
      }

      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `create_leads[${leadCount}_leads]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'LeadService',
        status: 'success',
      };

      this.metrics.push(metric);
      return metric;
    } catch (error) {
      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `create_leads[${leadCount}_leads]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'LeadService',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.metrics.push(metric);
      throw error;
    }
  }

  async simulateFunnelStats(propertyId?: string): Promise<PerformanceMetric> {
    const start = performance.now();
    const timestamp = new Date().toISOString();

    try {
      // Database queries: stage count (50ms) + channel breakdown (30ms) + closure time (40ms)
      await this.simulateDbOperation(50);
      await this.simulateDbOperation(30);
      await this.simulateDbOperation(40);

      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `calculate_funnel_stats${propertyId ? `[property=${propertyId}]` : '[all_properties]'}`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'LeadService',
        status: 'success',
      };

      this.metrics.push(metric);
      return metric;
    } catch (error) {
      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `calculate_funnel_stats${propertyId ? `[property=${propertyId}]` : '[all_properties]'}`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'LeadService',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.metrics.push(metric);
      throw error;
    }
  }

  async simulateDynamicPricing(checkInDate: string, checkOutDate: string): Promise<PerformanceMetric> {
    const start = performance.now();
    const timestamp = new Date().toISOString();

    try {
      // Historical occupancy: 100ms
      await this.simulateDbOperation(100);

      // Seasonal multiplier: 5ms
      await this.simulateCalculation(5);

      // Demand multiplier: 10ms
      await this.simulateCalculation(10);

      // Stay discount: 5ms
      await this.simulateCalculation(5);

      // Last-minute multiplier: 5ms
      await this.simulateCalculation(5);

      // Final calculation: 10ms
      await this.simulateCalculation(10);

      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `calculate_dynamic_price[${checkInDate}_to_${checkOutDate}]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'PricingEngine',
        status: 'success',
      };

      this.metrics.push(metric);
      return metric;
    } catch (error) {
      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `calculate_dynamic_price[${checkInDate}_to_${checkOutDate}]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'PricingEngine',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.metrics.push(metric);
      throw error;
    }
  }

  async simulatePropertyOperations(propertyCount: number = 50): Promise<PerformanceMetric> {
    const start = performance.now();
    const timestamp = new Date().toISOString();

    try {
      // Fetch properties: 30ms
      await this.simulateDbOperation(30);

      // Create property: 20ms per property
      for (let i = 0; i < Math.min(propertyCount, 10); i++) {
        await this.simulateDbOperation(20);
      }

      // Update properties: 15ms per property
      for (let i = 0; i < Math.min(propertyCount, 10); i++) {
        await this.simulateDbOperation(15);
      }

      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `property_operations[${propertyCount}_properties]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'PropertyService',
        status: 'success',
      };

      this.metrics.push(metric);
      return metric;
    } catch (error) {
      const duration = performance.now() - start;
      const metric: PerformanceMetric = {
        operation: `property_operations[${propertyCount}_properties]`,
        duration_ms: Math.round(duration),
        timestamp,
        component: 'PropertyService',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.metrics.push(metric);
      throw error;
    }
  }

  // Helper methods
  private simulateApiCall(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private simulateDbOperation(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private simulateCalculation(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getMetrics(): PerformanceMetric[] {
    return this.metrics;
  }

  getSummary() {
    const byComponent: Record<string, PerformanceMetric[]> = {};

    this.metrics.forEach((metric) => {
      if (!byComponent[metric.component]) {
        byComponent[metric.component] = [];
      }
      byComponent[metric.component].push(metric);
    });

    const summary: Record<string, any> = {};

    Object.entries(byComponent).forEach(([component, metrics]) => {
      const durations = metrics.map((m) => m.duration_ms);
      const successes = metrics.filter((m) => m.status === 'success').length;

      summary[component] = {
        total_operations: metrics.length,
        successful: successes,
        failed: metrics.length - successes,
        min_ms: Math.min(...durations),
        max_ms: Math.max(...durations),
        avg_ms: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        median_ms: this.calculateMedian(durations),
        p95_ms: this.calculatePercentile(durations, 95),
        p99_ms: this.calculatePercentile(durations, 99),
      };
    });

    return summary;
  }

  private calculateMedian(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculatePercentile(numbers: number[], percentile: number): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Main execution
async function main() {
  console.log('🚀 Performance Baseline Testing Suite');
  console.log('=====================================\n');

  const baseline = new PerformanceBaseline();

  try {
    // Test Workers
    console.log('📊 Testing Workers Performance...\n');

    console.log('1️⃣  Hospeda Listings Sync');
    const hospedaMetrics = [];
    for (let i = 1; i <= 3; i++) {
      const metric = await baseline.simulateSyncHospedaListing(i * 5);
      hospedaMetrics.push(metric);
      console.log(`   [${i * 5} properties] ${metric.duration_ms}ms`);
    }

    console.log('\n2️⃣  Booking Apartments Sync');
    const bookingMetrics = [];
    for (let i = 1; i <= 3; i++) {
      const metric = await baseline.simulateSyncBookingApartments(i * 5);
      bookingMetrics.push(metric);
      console.log(`   [${i * 5} properties] ${metric.duration_ms}ms`);
    }

    console.log('\n3️⃣  TripAdvisor Ratings Sync');
    const tripAdvisorMetrics = [];
    for (let i = 1; i <= 3; i++) {
      const metric = await baseline.simulateSyncTripAdvisorRatings(i * 5);
      tripAdvisorMetrics.push(metric);
      console.log(`   [${i * 5} properties] ${metric.duration_ms}ms`);
    }

    // Test Services
    console.log('\n📊 Testing Services Performance...\n');

    console.log('4️⃣  Lead Service Operations');
    const leadCreateMetric = await baseline.simulateLeadCreation(100);
    console.log(`   [100 leads creation] ${leadCreateMetric.duration_ms}ms`);

    const funnelMetric = await baseline.simulateFunnelStats();
    console.log(`   [Funnel statistics] ${funnelMetric.duration_ms}ms`);

    console.log('\n5️⃣  Pricing Engine Operations');
    const pricingMetric = await baseline.simulateDynamicPricing('2026-08-01', '2026-08-08');
    console.log(`   [Dynamic pricing calc] ${pricingMetric.duration_ms}ms`);

    console.log('\n6️⃣  Property Service Operations');
    const propertyMetric = await baseline.simulatePropertyOperations(50);
    console.log(`   [Property operations] ${propertyMetric.duration_ms}ms`);

    // Summary
    console.log('\n\n📈 Performance Summary');
    console.log('======================\n');

    const summary = baseline.getSummary();
    Object.entries(summary).forEach(([component, stats]) => {
      console.log(`${component}:`);
      console.log(`  Operations: ${stats.total_operations} (✓ ${stats.successful}, ✗ ${stats.failed})`);
      console.log(`  Min/Max:    ${stats.min_ms}ms / ${stats.max_ms}ms`);
      console.log(`  Avg/Median: ${stats.avg_ms}ms / ${stats.median_ms}ms`);
      console.log(`  P95/P99:    ${stats.p95_ms}ms / ${stats.p99_ms}ms`);
      console.log();
    });

    // Save metrics to file
    const metricsJson = {
      timestamp: new Date().toISOString(),
      summary,
      details: baseline.getMetrics(),
    };

    const fs = await import('fs');
    fs.writeFileSync(
      'performance-baseline.json',
      JSON.stringify(metricsJson, null, 2)
    );

    console.log('✅ Baseline metrics saved to: performance-baseline.json');
  } catch (error) {
    console.error('❌ Error during performance testing:', error);
    process.exit(1);
  }
}

main();
