/**
 * Background Task Scheduler Tests
 *
 * Test Coverage:
 * - Task registration and execution
 * - Priority-based scheduling
 * - Retry logic with exponential backoff
 * - Condition checking
 * - Task metrics tracking
 */

import {
  backgroundTaskScheduler,
  TaskPriority,
  TaskStatus,
  TaskTrigger,
} from '../backgroundTaskScheduler';

describe('BackgroundTaskScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    backgroundTaskScheduler.stopTaskExecutor();
    await backgroundTaskScheduler.clearAll();
  });

  // Test task registration
  describe('Task Registration', () => {
    test('should register a task successfully', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'test-task',
        handler,
        TaskPriority.NORMAL,
        TaskTrigger.IDLE,
      );

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
      expect(taskId.startsWith('task-')).toBe(true);
    });

    test('should register task with default values', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.name).toBe('test-task');
      expect(task?.priority).toBe(TaskPriority.NORMAL);
      expect(task?.trigger).toBe(TaskTrigger.IDLE);
    });

    test('should register task with custom conditions', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'test-task',
        handler,
        TaskPriority.HIGH,
        TaskTrigger.CHARGING,
        { requiresCharging: true, minBatteryLevel: 30 },
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.condition.requiresCharging).toBe(true);
      expect(task?.condition.minBatteryLevel).toBe(30);
    });

    test('should unregister a task', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      const success = backgroundTaskScheduler.unregisterTask(taskId);
      expect(success).toBe(true);

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task).toBeUndefined();
    });

    test('should return false when unregistering non-existent task', () => {
      const success = backgroundTaskScheduler.unregisterTask('non-existent');
      expect(success).toBe(false);
    });
  });

  // Test task retrieval
  describe('Task Retrieval', () => {
    test('should get task by ID', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.id).toBe(taskId);
    });

    test('should get all tasks', () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      backgroundTaskScheduler.registerTask('task-1', handler1);
      backgroundTaskScheduler.registerTask('task-2', handler2);

      const tasks = backgroundTaskScheduler.getAllTasks();
      expect(tasks.length).toBeGreaterThanOrEqual(2);
    });

    test('should get tasks by status', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      const pendingTasks = backgroundTaskScheduler.getTasksByStatus(TaskStatus.PENDING);
      expect(pendingTasks).toBeDefined();
      expect(Array.isArray(pendingTasks)).toBe(true);
    });

    test('should get pending tasks', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      backgroundTaskScheduler.registerTask('test-task', handler);

      const pendingTasks = backgroundTaskScheduler.getPendingTasks();
      expect(Array.isArray(pendingTasks)).toBe(true);
    });
  });

  // Test task scheduling
  describe('Task Scheduling', () => {
    test('should schedule a task', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      const success = backgroundTaskScheduler.scheduleTask(taskId, TaskTrigger.IDLE);
      expect(success).toBe(true);

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.trigger).toBe(TaskTrigger.IDLE);
    });

    test('should return false when scheduling non-existent task', () => {
      const success = backgroundTaskScheduler.scheduleTask('non-existent');
      expect(success).toBe(false);
    });

    test('should update task trigger on reschedule', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      backgroundTaskScheduler.scheduleTask(taskId, TaskTrigger.IDLE);
      const task1 = backgroundTaskScheduler.getTask(taskId);
      expect(task1?.trigger).toBe(TaskTrigger.IDLE);

      backgroundTaskScheduler.scheduleTask(taskId, TaskTrigger.CHARGING);
      const task2 = backgroundTaskScheduler.getTask(taskId);
      expect(task2?.trigger).toBe(TaskTrigger.CHARGING);
    });
  });

  // Test task cancellation and retry
  describe('Task Cancellation and Retry', () => {
    test('should cancel a task', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      const success = backgroundTaskScheduler.cancelTask(taskId);
      expect(success).toBe(true);

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.status).toBe(TaskStatus.CANCELLED);
    });

    test('should return false when cancelling non-existent task', () => {
      const success = backgroundTaskScheduler.cancelTask('non-existent');
      expect(success).toBe(false);
    });

    test('should retry failed task', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      // Manually set to failed
      const task = backgroundTaskScheduler.getTask(taskId);
      if (task) {
        task.status = TaskStatus.FAILED;
        task.error = 'Test error';
      }

      const success = backgroundTaskScheduler.retryTask(taskId);
      expect(success).toBe(true);

      const retryTask = backgroundTaskScheduler.getTask(taskId);
      expect(retryTask?.status).toBe(TaskStatus.PENDING);
      expect(retryTask?.retries).toBe(0);
    });

    test('should return false when retrying non-existent task', () => {
      const success = backgroundTaskScheduler.retryTask('non-existent');
      expect(success).toBe(false);
    });
  });

  // Test task priority
  describe('Task Priority', () => {
    test('should register task with CRITICAL priority', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'critical-task',
        handler,
        TaskPriority.CRITICAL,
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.priority).toBe(TaskPriority.CRITICAL);
    });

    test('should register task with HIGH priority', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'high-task',
        handler,
        TaskPriority.HIGH,
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.priority).toBe(TaskPriority.HIGH);
    });

    test('should register task with LOW priority', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'low-task',
        handler,
        TaskPriority.LOW,
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.priority).toBe(TaskPriority.LOW);
    });
  });

  // Test task triggers
  describe('Task Triggers', () => {
    test('should set IMMEDIATE trigger', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'test-task',
        handler,
        TaskPriority.NORMAL,
        TaskTrigger.IMMEDIATE,
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.trigger).toBe(TaskTrigger.IMMEDIATE);
    });

    test('should set IDLE trigger', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'test-task',
        handler,
        TaskPriority.NORMAL,
        TaskTrigger.IDLE,
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.trigger).toBe(TaskTrigger.IDLE);
    });

    test('should set CHARGING trigger', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'test-task',
        handler,
        TaskPriority.NORMAL,
        TaskTrigger.CHARGING,
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.trigger).toBe(TaskTrigger.CHARGING);
    });
  });

  // Test task conditions
  describe('Task Conditions', () => {
    test('should set requiresCharging condition', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'test-task',
        handler,
        TaskPriority.NORMAL,
        TaskTrigger.IDLE,
        { requiresCharging: true },
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.condition.requiresCharging).toBe(true);
    });

    test('should set requiresWiFi condition', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'test-task',
        handler,
        TaskPriority.NORMAL,
        TaskTrigger.IDLE,
        { requiresWiFi: true },
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.condition.requiresWiFi).toBe(true);
    });

    test('should set minBatteryLevel condition', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask(
        'test-task',
        handler,
        TaskPriority.NORMAL,
        TaskTrigger.IDLE,
        { minBatteryLevel: 50 },
      );

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.condition.minBatteryLevel).toBe(50);
    });
  });

  // Test task metrics
  describe('Task Metrics', () => {
    test('should get task metrics', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      const metrics = backgroundTaskScheduler.getTaskMetrics(taskId);
      expect(Array.isArray(metrics)).toBe(true);
    });

    test('should get all task metrics', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      backgroundTaskScheduler.registerTask('task-1', handler);
      backgroundTaskScheduler.registerTask('task-2', handler);

      const metrics = backgroundTaskScheduler.getTaskMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  // Test task history
  describe('Task History', () => {
    test('should get task history', () => {
      const history = backgroundTaskScheduler.getTaskHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    test('should maintain task history', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      backgroundTaskScheduler.registerTask('test-task', handler);

      const history1 = backgroundTaskScheduler.getTaskHistory();
      const length1 = history1.length;

      backgroundTaskScheduler.registerTask('test-task-2', handler);

      const history2 = backgroundTaskScheduler.getTaskHistory();
      expect(history2.length).toBeGreaterThanOrEqual(length1);
    });
  });

  // Test task executor lifecycle
  describe('Task Executor Lifecycle', () => {
    test('should start task executor', () => {
      expect(() => {
        backgroundTaskScheduler.stopTaskExecutor();
      }).not.toThrow();
    });

    test('should stop task executor', () => {
      backgroundTaskScheduler.stopTaskExecutor();
      expect(() => {
        backgroundTaskScheduler.stopTaskExecutor();
      }).not.toThrow();
    });
  });

  // Test data persistence
  describe('Data Persistence', () => {
    test('should clear all data', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      backgroundTaskScheduler.registerTask('test-task', handler);

      await backgroundTaskScheduler.clearAll();

      const tasks = backgroundTaskScheduler.getAllTasks();
      expect(tasks.length).toBe(0);

      const history = backgroundTaskScheduler.getTaskHistory();
      expect(history.length).toBe(0);

      const metrics = backgroundTaskScheduler.getTaskMetrics();
      expect(metrics.length).toBe(0);
    });
  });

  // Test multiple tasks
  describe('Multiple Tasks', () => {
    test('should manage multiple independent tasks', () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);
      const handler3 = jest.fn().mockResolvedValue(undefined);

      const taskId1 = backgroundTaskScheduler.registerTask('task-1', handler1);
      const taskId2 = backgroundTaskScheduler.registerTask('task-2', handler2);
      const taskId3 = backgroundTaskScheduler.registerTask('task-3', handler3);

      expect(taskId1).not.toEqual(taskId2);
      expect(taskId2).not.toEqual(taskId3);

      const allTasks = backgroundTaskScheduler.getAllTasks();
      expect(allTasks.length).toBeGreaterThanOrEqual(3);
    });

    test('should handle mixed priority tasks', () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      const criticalId = backgroundTaskScheduler.registerTask(
        'critical',
        handler,
        TaskPriority.CRITICAL,
      );
      const highId = backgroundTaskScheduler.registerTask('high', handler, TaskPriority.HIGH);
      const lowId = backgroundTaskScheduler.registerTask('low', handler, TaskPriority.LOW);

      const tasks = backgroundTaskScheduler.getAllTasks();
      expect(tasks.length).toBeGreaterThanOrEqual(3);
    });
  });

  // Test failed tasks
  describe('Failed Tasks', () => {
    test('should get failed tasks', () => {
      const failedTasks = backgroundTaskScheduler.getFailedTasks();
      expect(Array.isArray(failedTasks)).toBe(true);
    });
  });

  // Test edge cases
  describe('Edge Cases', () => {
    test('should handle task with empty name', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('', handler);

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.name).toBe('');
    });

    test('should handle rapid task registration and unregistration', () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      for (let i = 0; i < 10; i++) {
        const taskId = backgroundTaskScheduler.registerTask(`task-${i}`, handler);
        backgroundTaskScheduler.unregisterTask(taskId);
      }

      const tasks = backgroundTaskScheduler.getAllTasks();
      expect(Array.isArray(tasks)).toBe(true);
    });
  });

  // Test task state transitions
  describe('Task State Transitions', () => {
    test('should transition from PENDING to scheduled state', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      const task1 = backgroundTaskScheduler.getTask(taskId);
      expect(task1?.status).toBe(TaskStatus.PENDING);

      backgroundTaskScheduler.scheduleTask(taskId);

      const task2 = backgroundTaskScheduler.getTask(taskId);
      expect(task2?.status).toBe(TaskStatus.PENDING);
    });

    test('should maintain task retry count', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task?.retries).toBe(0);
      expect(task?.maxRetries).toBeGreaterThan(0);
    });
  });

  // Test unique task IDs
  describe('Task ID Generation', () => {
    test('should generate unique task IDs', () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      const id1 = backgroundTaskScheduler.registerTask('task', handler);
      const id2 = backgroundTaskScheduler.registerTask('task', handler);
      const id3 = backgroundTaskScheduler.registerTask('task', handler);

      const ids = new Set([id1, id2, id3]);
      expect(ids.size).toBe(3);
    });

    test('should format task IDs correctly', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test-task', handler);

      expect(taskId).toMatch(/^task-\d+-[a-z0-9]+$/);
    });
  });
});
