import { HealthCheckService, setupDefaultChecks } from '@services/HealthCheckService';

describe('HealthCheckService', () => {
  let service: HealthCheckService;

  beforeEach(() => {
    service = new HealthCheckService();
  });

  test('should register health check', () => {
    service.registerCheck('test', async () => ({
      status: 'pass',
      message: 'OK',
    }));

    const result = service.getCheckResult('test');
    expect(result).not.toBeNull();
    expect(result?.message).toBe('Not checked yet');
  });

  test('should run health checks', async () => {
    service.registerCheck('test1', async () => ({
      status: 'pass',
      message: 'Check 1 passed',
    }));

    service.registerCheck('test2', async () => ({
      status: 'pass',
      message: 'Check 2 passed',
    }));

    const status = await service.runChecks();

    expect(status.status).toBe('healthy');
    expect(status.checks.test1.status).toBe('pass');
    expect(status.checks.test2.status).toBe('pass');
  });

  test('should detect failing checks', async () => {
    service.registerCheck('failing', async () => ({
      status: 'fail',
      message: 'Check failed',
    }));

    const status = await service.runChecks();

    expect(status.status).toBe('unhealthy');
    expect(status.checks.failing.status).toBe('fail');
  });

  test('should detect degraded status', async () => {
    service.registerCheck('warning', async () => ({
      status: 'warn',
      message: 'Check warning',
    }));

    const status = await service.runChecks();

    expect(status.status).toBe('degraded');
  });

  test('should track consecutive failures', async () => {
    let count = 0;

    service.registerCheck('flaky', async () => {
      count++;
      return count <= 2
        ? { status: 'fail', message: 'Failed' }
        : { status: 'pass', message: 'Passed' };
    });

    await service.runChecks();
    let result = service.getCheckResult('flaky');
    expect(result?.consecutiveFailures).toBe(1);

    await service.runChecks();
    result = service.getCheckResult('flaky');
    expect(result?.consecutiveFailures).toBe(2);

    await service.runChecks();
    result = service.getCheckResult('flaky');
    expect(result?.consecutiveFailures).toBe(0);
  });

  test('should provide status with metadata', async () => {
    service.registerCheck('check1', async () => ({ status: 'pass', message: 'OK' }));
    service.registerCheck('check2', async () => ({ status: 'pass', message: 'OK' }));

    const status = await service.runChecks();

    expect(status.metadata.totalChecks).toBe(2);
    expect(status.metadata.passingChecks).toBe(2);
    expect(status.metadata.failingChecks).toBe(0);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  test('should reset checks', () => {
    service.registerCheck('test', async () => ({ status: 'pass', message: 'OK' }));
    service.reset();

    const result = service.getCheckResult('test');
    expect(result).toBeNull();
  });
});

describe('Default Health Checks', () => {
  let service: HealthCheckService;

  beforeEach(() => {
    service = new HealthCheckService();
    setupDefaultChecks();
  });

  test('should have memory check', async () => {
    const status = await service.runChecks();

    expect(status.checks.memory).toBeDefined();
    expect(['pass', 'warn', 'fail']).toContain(status.checks.memory.status);
  });

  test('should have CPU check', async () => {
    const status = await service.runChecks();

    expect(status.checks.cpu).toBeDefined();
    expect(['pass', 'warn']).toContain(status.checks.cpu.status);
  });

  test('should have uptime check', async () => {
    const status = await service.runChecks();

    expect(status.checks.uptime).toBeDefined();
    expect(status.checks.uptime.status).toBe('pass');
  });
});
