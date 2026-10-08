/**
 * Performance Monitoring Utilities
 * Track render times, memory usage, and FPS
 */

interface PerformanceMark {
  name: string;
  timestamp: number;
  duration?: number;
}

interface PerformanceMetrics {
  renderTime: number;
  fps: number;
  memoryUsage: number;
}

class PerformanceMonitor {
  private marks: Map<string, PerformanceMark> = new Map();
  private metrics: PerformanceMetrics[] = [];
  private frameCount = 0;
  private lastFrameTime = Date.now();
  private enabled = __DEV__; // Only in development

  /**
   * Start measuring a performance metric
   */
  startMeasure(name: string): void {
    if (!this.enabled) return;

    const mark: PerformanceMark = {
      name,
      timestamp: performance.now(),
    };
    this.marks.set(name, mark);
  }

  /**
   * End measuring and log the duration
   */
  endMeasure(name: string): number {
    if (!this.enabled) return 0;

    const mark = this.marks.get(name);
    if (!mark) {
      console.warn(`Performance mark "${name}" not found`);
      return 0;
    }

    const duration = performance.now() - mark.timestamp;
    mark.duration = duration;

    if (duration > 16.67) {
      // Longer than 60fps frame time
      console.warn(
        `Performance: ${name} took ${duration.toFixed(2)}ms (threshold: 16.67ms)`
      );
    }

    return duration;
  }

  /**
   * Get duration of a measure
   */
  getDuration(name: string): number {
    const mark = this.marks.get(name);
    return mark?.duration ?? 0;
  }

  /**
   * Clear all marks
   */
  clearMarks(): void {
    this.marks.clear();
  }

  /**
   * Track FPS
   */
  trackFrame(): void {
    if (!this.enabled) return;

    this.frameCount++;
    const now = Date.now();
    const elapsed = now - this.lastFrameTime;

    if (elapsed >= 1000) {
      const fps = this.frameCount;
      if (fps < 60) {
        console.warn(`Performance: Low FPS detected: ${fps}fps`);
      }
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
  }

  /**
   * Get a summary of all marks
   */
  getSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    this.marks.forEach((mark) => {
      if (mark.duration) {
        summary[mark.name] = mark.duration;
      }
    });
    return summary;
  }

  /**
   * Log performance summary
   */
  logSummary(): void {
    if (!this.enabled) return;

    const summary = this.getSummary();
    console.log('Performance Summary:', summary);
  }

  /**
   * Create a performance mark span
   */
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();

    this.startMeasure(name);
    try {
      return await fn();
    } finally {
      this.endMeasure(name);
    }
  }

  /**
   * Create a synchronous performance mark span
   */
  measure<T>(name: string, fn: () => T): T {
    if (!this.enabled) return fn();

    this.startMeasure(name);
    try {
      return fn();
    } finally {
      this.endMeasure(name);
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * HOC to wrap a component with performance monitoring
 */
export function withPerformanceMonitoring<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
): React.FC<P> {
  return (props: P) => {
    const measureName = `render-${componentName}`;

    React.useEffect(() => {
      performanceMonitor.startMeasure(measureName);
      return () => {
        performanceMonitor.endMeasure(measureName);
      };
    });

    return <Component {...props} />;
  };
}
