/**
 * Performance Tests: Memory Leak Detection
 * Monitors memory usage for potential leaks in critical operations
 */

import { measureMemory, getMemoryDelta } from '../utils/performance-utils';
import { SyncService } from '../../src/services/SyncService';
import { Database } from '../../src/database/Database';

describe('Memory Leak Detection', () => {
  let initialMemory: number;
  let syncService: SyncService;

  beforeEach(async () => {
    initialMemory = await measureMemory();
  });

  afterEach(async () => {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  it('should not leak memory on repeated captures', async () => {
    const iterations = 100;
    const captures = [];

    for (let i = 0; i < iterations; i++) {
      captures.push({
        id: `capture-${i}`,
        description: `Test Capture ${i}`,
        amount: Math.random() * 1000,
      });
    }

    const beforeMemory = await measureMemory();

    // Simulate capture operations
    for (const capture of captures) {
      await syncService.queueCapture(capture);
    }

    const afterMemory = await measureMemory();
    const delta = getMemoryDelta(beforeMemory, afterMemory);

    // Memory growth should be < 10% per 100 captures
    expect(delta.percentageGrowth).toBeLessThan(10);
    expect(delta.absoluteGrowth).toBeLessThan(10 * 1024 * 1024); // 10 MB
  });

  it('should not leak memory on repeated syncs', async () => {
    const syncIterations = 10;

    const beforeMemory = await measureMemory();

    for (let i = 0; i < syncIterations; i++) {
      await syncService.fullSync();
    }

    const afterMemory = await measureMemory();
    const delta = getMemoryDelta(beforeMemory, afterMemory);

    // Memory should stabilize after first sync
    expect(delta.percentageGrowth).toBeLessThan(15);
  });

  it('should properly clean up event listeners', async () => {
    const database = new Database();

    const beforeMemory = await measureMemory();
    const listeners = [];

    // Register listeners
    for (let i = 0; i < 50; i++) {
      const listener = () => {};
      database.on('change', listener);
      listeners.push(listener);
    }

    // Unregister listeners
    listeners.forEach(listener => {
      database.off('change', listener);
    });

    const afterMemory = await measureMemory();
    const delta = getMemoryDelta(beforeMemory, afterMemory);

    // Should cleanup properly
    expect(delta.percentageGrowth).toBeLessThan(5);
  });

  it('should not leak memory on large file operations', async () => {
    const largeData = new Array(1000000).fill('x').join('');

    const beforeMemory = await measureMemory();

    // Simulate processing large file
    let processed = largeData;
    for (let i = 0; i < 5; i++) {
      processed = Buffer.from(processed).toString('base64');
      processed = Buffer.from(processed, 'base64').toString('utf-8');
    }

    const afterMemory = await measureMemory();
    const delta = getMemoryDelta(beforeMemory, afterMemory);

    // Temporary memory spikes are OK, but should be cleaned up
    expect(delta.percentageGrowth).toBeLessThan(25);
  });

  it('should monitor heap size stability', async () => {
    const heapSnapshots = [];

    for (let i = 0; i < 5; i++) {
      const memory = await measureMemory();
      heapSnapshots.push(memory);

      // Perform operations
      for (let j = 0; j < 10; j++) {
        await syncService.fullSync();
      }

      if (global.gc) {
        global.gc();
      }
    }

    // Check for monotonic growth (increasing memory trend)
    const diffs = heapSnapshots.slice(1).map((val, idx) => val - heapSnapshots[idx]);
    const growingTrend = diffs.filter(d => d > 0).length;

    // At least 50% should be stable/decreasing
    expect(growingTrend).toBeLessThan(diffs.length * 0.5);
  });

  it('should handle rapid allocation/deallocation', async () => {
    const beforeMemory = await measureMemory();

    for (let i = 0; i < 100; i++) {
      const temp = new Array(10000).fill(Math.random());
      temp.length = 0; // Clear array
    }

    const afterMemory = await measureMemory();
    const delta = getMemoryDelta(beforeMemory, afterMemory);

    expect(delta.percentageGrowth).toBeLessThan(20);
  });
});
