/**
 * Load Testing Script for Legal Automation Platform
 * Tests polling service with 100+ concurrent petitions
 *
 * Usage:
 *   npx ts-node src/scripts/load-test.ts --concurrency 100 --duration 300
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as Table from 'cli-table3';

interface LoadTestConfig {
  baseUrl: string;
  concurrency: number;
  duration: number; // seconds
  requestsPerSecond: number;
  authToken: string;
}

interface LoadTestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errors: Map<string, number>;
  statusCodes: Map<number, number>;
}

class LoadTester {
  private config: LoadTestConfig;
  private metrics: LoadTestMetrics;
  private responseTimes: number[] = [];

  constructor(config: LoadTestConfig) {
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      requestsPerSecond: 0,
      errors: new Map(),
      statusCodes: new Map(),
    };
  }

  /**
   * Generate mock petition data
   */
  private generateMockPetition() {
    return {
      caseNumber: `0000000-${Math.random().toString().slice(2, 12)}.2024.1.00.0000`,
      clientCPF: `${Math.floor(Math.random() * 99999999999).toString().padStart(11, '0')}`,
      clientName: `Test Client ${uuidv4().slice(0, 8)}`,
      subject: 'Load Test Petition',
      description: `This is a load test petition generated at ${new Date().toISOString()}`,
      tribunal: 'TJSC',
      judge: 'Test Judge',
      lawyerName: 'Test Lawyer',
      lawyerOAB: '12345/SC',
      defendants: [
        {
          name: 'Defendant 1',
          cpf: `${Math.floor(Math.random() * 99999999999).toString().padStart(11, '0')}`,
        },
      ],
    };
  }

  /**
   * Simulate petition submission
   */
  private async submitPetition(): Promise<{ duration: number; statusCode: number; error?: string }> {
    const startTime = Date.now();

    try {
      const petition = this.generateMockPetition();
      const response = await axios.post(
        `${this.config.baseUrl}/api/v1/petitions/submit`,
        petition,
        {
          headers: {
            Authorization: `Bearer ${this.config.authToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const duration = Date.now() - startTime;
      return { duration, statusCode: response.status };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const statusCode = error.response?.status || 0;
      const errorMessage = error.response?.data?.error || error.message;

      return {
        duration,
        statusCode,
        error: errorMessage,
      };
    }
  }

  /**
   * Simulate polling requests
   */
  private async pollPetition(petitionId: string): Promise<{ duration: number; statusCode: number; error?: string }> {
    const startTime = Date.now();

    try {
      const response = await axios.get(
        `${this.config.baseUrl}/api/v1/petitions/${petitionId}/status`,
        {
          headers: {
            Authorization: `Bearer ${this.config.authToken}`,
          },
          timeout: 10000,
        },
      );

      const duration = Date.now() - startTime;
      return { duration, statusCode: response.status };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const statusCode = error.response?.status || 0;
      const errorMessage = error.response?.data?.error || error.message;

      return {
        duration,
        statusCode,
        error: errorMessage,
      };
    }
  }

  /**
   * Simulate polling service load
   */
  private async simulatePollingLoad(): Promise<void> {
    const petitionIds: string[] = [];

    console.log('\n📝 Phase 1: Submitting test petitions...');
    const submitStartTime = Date.now();

    // Submit initial batch of petitions
    for (let i = 0; i < this.config.concurrency; i++) {
      const result = await this.submitPetition();
      this.recordMetric(result);

      // Simulate petition ID from response
      petitionIds.push(`test-petition-${i}-${uuidv4()}`);

      // Rate limiting to avoid overwhelming the server
      if (i % Math.floor(this.config.requestsPerSecond / 5) === 0) {
        await this.sleep(200);
      }
    }

    console.log(`✅ Submitted ${petitionIds.length} petitions in ${((Date.now() - submitStartTime) / 1000).toFixed(2)}s`);

    // Start polling load
    console.log('\n🔄 Phase 2: Simulating polling load...');
    const pollStartTime = Date.now();
    let pollCount = 0;

    while (Date.now() - pollStartTime < this.config.duration * 1000) {
      const pollTasks: Promise<any>[] = [];

      // Issue concurrent poll requests
      for (let i = 0; i < this.config.concurrency; i++) {
        pollTasks.push(
          (async () => {
            const result = await this.pollPetition(petitionIds[i % petitionIds.length]);
            this.recordMetric(result);
            pollCount++;
          })(),
        );
      }

      await Promise.all(pollTasks);

      // Calculate sleep time to maintain target RPS
      const elapsed = Date.now() - pollStartTime;
      const targetRequests = (elapsed / 1000) * this.config.requestsPerSecond;
      if (this.metrics.totalRequests > targetRequests) {
        await this.sleep(100);
      }
    }

    console.log(`✅ Completed ${pollCount} poll requests in ${((Date.now() - pollStartTime) / 1000).toFixed(2)}s`);
  }

  /**
   * Record metric for a request
   */
  private recordMetric(result: { duration: number; statusCode: number; error?: string }): void {
    this.metrics.totalRequests++;
    this.responseTimes.push(result.duration);

    if (result.statusCode >= 200 && result.statusCode < 300) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Track status codes
    const count = this.metrics.statusCodes.get(result.statusCode) || 0;
    this.metrics.statusCodes.set(result.statusCode, count + 1);

    // Track errors
    if (result.error) {
      const errorCount = this.metrics.errors.get(result.error) || 0;
      this.metrics.errors.set(result.error, errorCount + 1);
    }

    // Update response time metrics
    this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, result.duration);
    this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, result.duration);
  }

  /**
   * Calculate final metrics
   */
  private calculateMetrics(): void {
    if (this.responseTimes.length === 0) return;

    this.metrics.averageResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    this.metrics.requestsPerSecond = (this.metrics.totalRequests / this.config.duration).toFixed(2) as any;
  }

  /**
   * Print detailed metrics report
   */
  private printReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 LOAD TEST REPORT - Legal Automation Platform'.padEnd(80));
    console.log('='.repeat(80));

    // Summary Table
    const summaryTable = new Table({
      head: ['Metric', 'Value'],
      colWidths: [40, 40],
    });

    summaryTable.push(
      ['Total Requests', this.metrics.totalRequests],
      ['Successful Requests', this.metrics.successfulRequests],
      ['Failed Requests', `${this.metrics.failedRequests} (${((this.metrics.failedRequests / this.metrics.totalRequests) * 100).toFixed(2)}%)`],
      ['Requests/Second', this.metrics.requestsPerSecond],
      ['Duration', `${this.config.duration}s`],
      ['Concurrency', this.config.concurrency],
    );

    console.log('\n📈 SUMMARY');
    console.log(summaryTable.toString());

    // Response Times Table
    const rtTable = new Table({
      head: ['Metric', 'Value (ms)'],
      colWidths: [40, 40],
    });

    rtTable.push(
      ['Min Response Time', this.metrics.minResponseTime.toFixed(2)],
      ['Max Response Time', this.metrics.maxResponseTime.toFixed(2)],
      ['Avg Response Time', this.metrics.averageResponseTime.toFixed(2)],
      [
        'P95 Response Time',
        this.calculatePercentile(95).toFixed(2),
      ],
      [
        'P99 Response Time',
        this.calculatePercentile(99).toFixed(2),
      ],
    );

    console.log('\n⏱️  RESPONSE TIMES');
    console.log(rtTable.toString());

    // Status Codes Table
    if (this.metrics.statusCodes.size > 0) {
      const statusTable = new Table({
        head: ['Status Code', 'Count', 'Percentage'],
        colWidths: [20, 20, 40],
      });

      this.metrics.statusCodes.forEach((count, statusCode) => {
        const percentage = ((count / this.metrics.totalRequests) * 100).toFixed(2);
        statusTable.push([statusCode.toString(), count.toString(), `${percentage}%`]);
      });

      console.log('\n📊 STATUS CODES');
      console.log(statusTable.toString());
    }

    // Errors Table
    if (this.metrics.errors.size > 0) {
      const errorTable = new Table({
        head: ['Error Type', 'Count'],
        colWidths: [50, 30],
      });

      this.metrics.errors.forEach((count, error) => {
        const truncatedError = error.substring(0, 47) + (error.length > 47 ? '...' : '');
        errorTable.push([truncatedError, count.toString()]);
      });

      console.log('\n⚠️  ERRORS');
      console.log(errorTable.toString());
    }

    console.log('\n' + '='.repeat(80));
    console.log('Load test completed!'.padStart(80));
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Calculate percentile value
   */
  private calculatePercentile(percentile: number): number {
    const sorted = this.responseTimes.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Run load test
   */
  async run(): Promise<void> {
    console.log('\n🚀 Starting Load Test');
    console.log(`📍 Base URL: ${this.config.baseUrl}`);
    console.log(`👥 Concurrency: ${this.config.concurrency}`);
    console.log(`⏱️  Duration: ${this.config.duration}s`);
    console.log(`📊 Target RPS: ${this.config.requestsPerSecond}`);

    const startTime = Date.now();

    try {
      await this.simulatePollingLoad();
      this.calculateMetrics();
      this.printReport();

      const totalDuration = (Date.now() - startTime) / 1000;
      console.log(`\n✨ Total execution time: ${totalDuration.toFixed(2)}s`);
    } catch (error) {
      console.error('\n❌ Load test failed:', error);
      process.exit(1);
    }
  }
}

// Parse command line arguments
function parseArgs(): LoadTestConfig {
  const args = process.argv.slice(2);
  const config: LoadTestConfig = {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    concurrency: 100,
    duration: 300, // 5 minutes
    requestsPerSecond: 100,
    authToken: process.env.TEST_AUTH_TOKEN || 'test-token',
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    switch (key) {
      case 'concurrency':
        config.concurrency = parseInt(value);
        break;
      case 'duration':
        config.duration = parseInt(value);
        break;
      case 'rps':
        config.requestsPerSecond = parseInt(value);
        break;
      case 'url':
        config.baseUrl = value;
        break;
      case 'token':
        config.authToken = value;
        break;
    }
  }

  return config;
}

// Main execution
const config = parseArgs();
const tester = new LoadTester(config);
tester.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
