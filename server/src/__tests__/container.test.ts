/**
 * Testes para DI Container
 * Validar que DI funciona, repositories são mockáveis
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Container, getContainer, resetContainer, createContainer } from '../infrastructure/container.js';

describe('Dependency Injection Container', () => {
  afterEach(() => {
    resetContainer();
  });

  describe('Container registration and resolution', () => {
    it('should register and resolve a service', () => {
      const container = new Container();
      const mockService = { name: 'test' };

      container.register('testService', mockService);
      const resolved = container.resolve('testService');

      expect(resolved).toBe(mockService);
    });

    it('should register and resolve factory functions', () => {
      const container = new Container();
      let callCount = 0;

      container.register('testFactory', () => {
        callCount++;
        return { value: 'factory' };
      });

      const resolved1 = container.resolve('testFactory');
      const resolved2 = container.resolve('testFactory');

      expect(resolved1.value).toBe('factory');
      expect(resolved2.value).toBe('factory');
      expect(callCount).toBe(2); // Factory called each time
    });

    it('should support singleton registration', () => {
      const container = new Container();
      let callCount = 0;

      container.registerSingleton('singletonService', () => {
        callCount++;
        return { value: 'singleton' };
      });

      const resolved1 = container.resolve('singletonService');
      const resolved2 = container.resolve('singletonService');

      expect(resolved1).toBe(resolved2); // Same instance
      expect(callCount).toBe(1); // Factory called only once
    });

    it('should throw error when resolving non-existent service', () => {
      const container = new Container();

      expect(() => container.resolve('nonExistent')).toThrow(
        'Service "nonExistent" not found in container'
      );
    });

    it('should check service existence', () => {
      const container = new Container();

      container.register('service', { test: true });

      expect(container.has('service')).toBe(true);
      expect(container.has('nonExistent')).toBe(false);
    });

    it('should remove services', () => {
      const container = new Container();

      container.register('service', { test: true });
      expect(container.has('service')).toBe(true);

      container.remove('service');
      expect(container.has('service')).toBe(false);
    });

    it('should clear all services', () => {
      const container = new Container();

      container.register('service1', { test: true });
      container.register('service2', { test: true });

      expect(container.has('service1')).toBe(true);
      expect(container.has('service2')).toBe(true);

      container.clear();

      expect(container.has('service1')).toBe(false);
      expect(container.has('service2')).toBe(false);
    });
  });

  describe('Global container', () => {
    it('should provide global container instance', () => {
      const container1 = getContainer();
      const container2 = getContainer();

      expect(container1).toBe(container2); // Same instance
    });

    it('should reset global container', () => {
      const container1 = getContainer();
      container1.register('service', { test: true });

      resetContainer();

      const container2 = getContainer();
      expect(container2).not.toBe(container1);
      expect(container2.has('service')).toBe(false);
    });

    it('should create isolated containers', () => {
      const container1 = createContainer();
      const container2 = createContainer();
      const global = getContainer();

      container1.register('service', { value: 1 });
      container2.register('service', { value: 2 });

      expect(container1).not.toBe(container2);
      expect(container1.resolve('service').value).toBe(1);
      expect(container2.resolve('service').value).toBe(2);
      expect(global.has('service')).toBe(false);
    });
  });

  describe('Mockable repositories pattern', () => {
    it('should support repository mocking for testing', () => {
      const container = new Container();

      // Mock repository
      const mockRepository = {
        findById: async (id: number) => ({ id, name: 'Mocked' }),
        findAll: async () => [{ id: 1, name: 'Item 1' }],
        save: async (entity: any) => entity,
        delete: async (id: number) => true,
        exists: async (id: number) => true,
        count: async () => 1,
      };

      container.register('userRepository', mockRepository);

      const repo = container.resolve('userRepository');
      expect(repo).toBe(mockRepository);
    });

    it('should support dependency chain mocking', () => {
      const container = new Container();

      // Mock database
      const mockDb = {
        prepare: () => ({
          get: () => null,
          all: () => [],
          run: () => ({ changes: 0 }),
        }),
      };

      // Mock repository that depends on db
      const mockRepo = {
        findById: async (id: number) => null,
        count: async () => 0,
      };

      container.register('db', mockDb);
      container.register('userRepository', () => mockRepo);

      const db = container.resolve('db');
      const repo = container.resolve('userRepository');

      expect(db).toBe(mockDb);
      expect(repo).toBe(mockRepo);
    });

    it('should support partial mocking with original dependencies', () => {
      const container = new Container();

      const realService = {
        getValue: () => 'real-value',
      };

      // Partial mock that wraps real service
      const mockService = {
        getValue: () => 'mocked-value',
        getRealValue: () => realService.getValue(),
      };

      container.register('service', mockService);

      const service = container.resolve('service');
      expect(service.getValue()).toBe('mocked-value');
      expect(service.getRealValue()).toBe('real-value');
    });
  });

  describe('Complex dependency scenarios', () => {
    it('should handle multiple dependent services', () => {
      const container = new Container();

      container.registerSingleton('logger', () => ({
        log: (msg: string) => console.log(msg),
      }));

      container.registerSingleton('cache', () => ({
        get: (key: string) => null,
        set: (key: string, value: any) => {},
      }));

      container.registerSingleton('db', () => ({
        query: () => [],
      }));

      container.registerSingleton('userRepository', () => {
        const logger = container.resolve('logger');
        const cache = container.resolve('cache');
        const db = container.resolve('db');

        return {
          findAll: async () => {
            logger.log('Finding all users');
            return db.query();
          },
        };
      });

      const repo = container.resolve('userRepository');
      expect(repo).toHaveProperty('findAll');
    });

    it('should support transitive dependency resolution', () => {
      const container = new Container();

      container.register('dependency1', { value: 'dep1' });

      container.registerSingleton('dependency2', () => ({
        value: 'dep2',
        dep1: container.resolve('dependency1'),
      }));

      container.registerSingleton('service', () => ({
        dep2: container.resolve('dependency2'),
      }));

      const service = container.resolve('service');
      expect(service.dep2.value).toBe('dep2');
      expect(service.dep2.dep1.value).toBe('dep1');
    });
  });
});
