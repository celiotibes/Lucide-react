/**
 * Performance Testing Utilities
 * Helper functions for measuring and monitoring app performance
 */

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
}

export interface MemoryDelta {
  absoluteGrowth: number;
  percentageGrowth: number;
  beforeMemory: number;
  afterMemory: number;
}

export interface PerformanceMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  memory: MemoryDelta;
  fps?: number;
  cpuUsage?: number;
}

/**
 * Measure current memory usage
 */
export async function measureMemory(): Promise<number> {
  if (global.gc) {
    global.gc();
  }

  const memUsage = process.memoryUsage();
  return memUsage.heapUsed;
}

/**
 * Calculate memory delta between two measurements
 */
export function getMemoryDelta(before: number, after: number): MemoryDelta {
  const absoluteGrowth = after - before;
  const percentageGrowth = (absoluteGrowth / before) * 100;

  return {
    absoluteGrowth,
    percentageGrowth,
    beforeMemory: before,
    afterMemory: after,
  };
}

/**
 * Measure execution time of a function
 */
export async function measureExecutionTime(
  fn: () => Promise<void>,
  name?: string
): Promise<PerformanceMetrics> {
  const beforeMemory = await measureMemory();
  const startTime = performance.now();

  await fn();

  const endTime = performance.now();
  const afterMemory = await measureMemory();

  const metrics: PerformanceMetrics = {
    startTime,
    endTime,
    duration: endTime - startTime,
    memory: getMemoryDelta(beforeMemory, afterMemory),
  };

  if (name) {
    console.log(`[Performance] ${name}: ${metrics.duration.toFixed(2)}ms`);
  }

  return metrics;
}

/**
 * Monitor memory over time
 */
export async function monitorMemoryOverTime(
  duration: number,
  interval: number = 1000
): Promise<MemoryMetrics[]> {
  const measurements: MemoryMetrics[] = [];
  const startTime = Date.now();

  while (Date.now() - startTime < duration) {
    const memUsage = process.memoryUsage();
    measurements.push({
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
    });

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return measurements;
}

/**
 * Calculate statistics from performance measurements
 */
export function calculateStats(measurements: number[]): {
  min: number;
  max: number;
  avg: number;
  median: number;
  stdDev: number;
} {
  const sorted = [...measurements].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;

  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  const variance =
    measurements.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
    measurements.length;
  const stdDev = Math.sqrt(variance);

  return { min, max, avg, median, stdDev };
}

/**
 * Assert performance metrics are within acceptable bounds
 */
export function assertPerformance(
  metrics: PerformanceMetrics,
  threshold: { duration?: number; memoryGrowth?: number }
): boolean {
  if (threshold.duration && metrics.duration > threshold.duration) {
    throw new Error(
      `Performance threshold exceeded: ${metrics.duration.toFixed(2)}ms > ${threshold.duration}ms`
    );
  }

  if (
    threshold.memoryGrowth &&
    metrics.memory.percentageGrowth > threshold.memoryGrowth
  ) {
    throw new Error(
      `Memory growth threshold exceeded: ${metrics.memory.percentageGrowth.toFixed(2)}% > ${threshold.memoryGrowth}%`
    );
  }

  return true;
}

/**
 * Simulate network latency
 */
export async function simulateNetworkLatency(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Track FPS during animation
 */
export function trackFrameRate(duration: number = 1000): Promise<number> {
  return new Promise(resolve => {
    let frameCount = 0;
    const startTime = performance.now();

    function countFrame() {
      frameCount++;
      const elapsed = performance.now() - startTime;

      if (elapsed < duration) {
        requestAnimationFrame(countFrame);
      } else {
        const fps = (frameCount / elapsed) * 1000;
        resolve(fps);
      }
    }

    requestAnimationFrame(countFrame);
  });
}

/**
 * Benchmark a function with multiple iterations
 */
export async function benchmark(
  fn: () => Promise<void>,
  iterations: number = 100
): Promise<{
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
}> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const metrics = await measureExecutionTime(fn);
    times.push(metrics.duration);
  }

  return {
    totalTime: times.reduce((a, b) => a + b, 0),
    averageTime: times.reduce((a, b) => a + b, 0) / iterations,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
  };
}

/**
 * Check if performance has regressed
 */
export function checkRegression(current: number, baseline: number, threshold: number = 0.1): boolean {
  const regression = (current - baseline) / baseline;
  return regression > threshold;
}
