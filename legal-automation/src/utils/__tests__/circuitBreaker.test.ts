import { CircuitBreaker, CircuitState } from '@utils/circuitBreaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100,
    });
  });

  test('should start in CLOSED state', () => {
    const state = breaker.getState();
    expect(state.state).toBe(CircuitState.CLOSED);
  });

  test('should allow requests in CLOSED state', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await breaker.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalled();
  });

  test('should transition to OPEN after failure threshold', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(fn);
      } catch {
        // Expected
      }
    }

    const state = breaker.getState();
    expect(state.state).toBe(CircuitState.OPEN);
  });

  test('should reject requests when OPEN', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(fn);
      } catch {
        // Expected
      }
    }

    await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
  });

  test('should reset', () => {
    breaker.reset();

    const state = breaker.getState();
    expect(state.state).toBe(CircuitState.CLOSED);
    expect(state.failureCount).toBe(0);
  });
});
