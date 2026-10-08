/**
 * Integration Tests: Sync Service
 * Tests synchronization logic with mocked API and database
 */

import { SyncService } from '../../src/services/SyncService';
import { Database } from '../../src/database/Database';
import { ApiClient } from '../../src/services/ApiClient';

jest.mock('../../src/services/ApiClient');
jest.mock('../../src/database/Database');

describe('SyncService Integration Tests', () => {
  let syncService: SyncService;
  let mockApiClient: jest.Mocked<ApiClient>;
  let mockDatabase: jest.Mocked<Database>;

  beforeEach(() => {
    mockApiClient = new ApiClient() as jest.Mocked<ApiClient>;
    mockDatabase = new Database() as jest.Mocked<Database>;
    syncService = new SyncService(mockApiClient, mockDatabase);
  });

  describe('Sync Push (Upload to Server)', () => {
    it('should sync pending captures to server', async () => {
      const pendingCaptures = [
        { id: '1', description: 'Capture 1', amount: 100, synced: false },
        { id: '2', description: 'Capture 2', amount: 200, synced: false },
      ];

      mockDatabase.getPendingCaptures.mockResolvedValue(pendingCaptures);
      mockApiClient.syncCaptures.mockResolvedValue({ success: true, synced: 2 });

      const result = await syncService.pushChanges();

      expect(result.synced).toBe(2);
      expect(mockApiClient.syncCaptures).toHaveBeenCalledWith(pendingCaptures);
      expect(mockDatabase.markCapturesSynced).toHaveBeenCalledWith(['1', '2']);
    });

    it('should handle sync push conflicts', async () => {
      const conflictingCapture = { id: '1', version: 1, serverVersion: 2 };

      mockDatabase.getConflictingCaptures.mockResolvedValue([conflictingCapture]);
      mockApiClient.resolveConflict.mockResolvedValue({ version: 3, resolved: true });

      const result = await syncService.resolveConflicts();

      expect(result.resolved).toBe(true);
      expect(mockApiClient.resolveConflict).toHaveBeenCalled();
    });

    it('should retry failed syncs with exponential backoff', async () => {
      mockApiClient.syncCaptures.mockRejectedValueOnce(new Error('Network error'));
      mockApiClient.syncCaptures.mockResolvedValueOnce({ success: true, synced: 1 });

      const result = await syncService.pushChangesWithRetry(2);

      expect(result.synced).toBe(1);
      expect(mockApiClient.syncCaptures).toHaveBeenCalledTimes(2);
    });
  });

  describe('Sync Pull (Download from Server)', () => {
    it('should fetch and apply server changes', async () => {
      const serverChanges = [
        { id: 'remote-1', description: 'Remote Capture', amount: 300 },
      ];

      mockApiClient.getRemoteChanges.mockResolvedValue(serverChanges);
      mockDatabase.applyRemoteChanges.mockResolvedValue(true);

      const result = await syncService.pullChanges();

      expect(result.applied).toBe(true);
      expect(mockDatabase.applyRemoteChanges).toHaveBeenCalledWith(serverChanges);
    });

    it('should handle conflict detection during pull', async () => {
      const conflictingChange = { id: '1', description: 'Conflict', version: 3 };
      mockApiClient.getRemoteChanges.mockResolvedValue([conflictingChange]);
      mockDatabase.hasLocalChanges.mockResolvedValue(true);

      const result = await syncService.pullChanges();

      expect(result.conflicts).toBeDefined();
      expect(result.conflicts?.length).toBeGreaterThan(0);
    });
  });

  describe('Full Sync (Bidirectional)', () => {
    it('should complete full bidirectional sync', async () => {
      mockDatabase.getPendingCaptures.mockResolvedValue([{ id: '1', synced: false }]);
      mockApiClient.syncCaptures.mockResolvedValue({ success: true, synced: 1 });
      mockApiClient.getRemoteChanges.mockResolvedValue([]);

      const result = await syncService.fullSync();

      expect(result.pushed).toBe(1);
      expect(result.pulled).toBe(0);
      expect(result.success).toBe(true);
    });

    it('should handle bidirectional conflicts gracefully', async () => {
      mockDatabase.getPendingCaptures.mockResolvedValue([{ id: '1', version: 1 }]);
      mockApiClient.syncCaptures.mockRejectedValue(new Error('Conflict detected'));
      mockApiClient.getRemoteChanges.mockResolvedValue([{ id: '1', version: 2 }]);

      const result = await syncService.fullSync();

      expect(result.conflicts).toBeDefined();
      expect(result.success).toBe(false);
    });
  });

  describe('Offline Support', () => {
    it('should queue changes when offline', async () => {
      syncService.setOnline(false);

      const queued = await syncService.queueCapture({ description: 'Offline', amount: 50 });

      expect(queued).toBe(true);
      expect(mockApiClient.syncCaptures).not.toHaveBeenCalled();
      expect(mockDatabase.saveCapture).toHaveBeenCalled();
    });

    it('should sync queued changes when online', async () => {
      const queuedCaptures = [{ id: '1', synced: false }];
      mockDatabase.getPendingCaptures.mockResolvedValue(queuedCaptures);

      syncService.setOnline(false);
      await syncService.queueCapture({ description: 'Test', amount: 50 });

      syncService.setOnline(true);
      const result = await syncService.syncPendingChanges();

      expect(result.synced).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockApiClient.syncCaptures.mockRejectedValue(new Error('Network timeout'));

      const result = await syncService.pushChanges();

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Network');
    });

    it('should handle server errors', async () => {
      mockApiClient.syncCaptures.mockRejectedValue({
        response: { status: 500, data: { error: 'Server error' } },
      });

      const result = await syncService.pushChanges();

      expect(result.error).toBeDefined();
    });

    it('should validate sync data integrity', async () => {
      const invalidCapture = { id: '', amount: -100 };
      mockDatabase.getPendingCaptures.mockResolvedValue([invalidCapture]);

      const result = await syncService.validateSync();

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });
});
