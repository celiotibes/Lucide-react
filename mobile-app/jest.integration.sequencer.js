/**
 * Jest Test Sequencer for Security Integration Tests
 * Ensures tests run in logical order for better isolation and performance
 *
 * Order:
 * 1. TokenManager - Foundation for authentication
 * 2. SecureStorageService - Storage backend for TokenManager
 * 3. CertificatePinning - Network security
 * 4. DataValidationService - Input validation
 * 5. End-to-end flows - Integration of all services
 */

const Sequencer = require('@jest/test-sequencer').default;

class IntegrationTestSequencer extends Sequencer {
  sort(tests) {
    const sortPriority = {
      'tokenManager.integration.test.ts': 0,
      'secureStorageService.integration.test.ts': 1,
      'apiClient.integration.test.ts': 2,
      'dataValidationService.integration.test.ts': 3,
      'securityFlow.integration.test.ts': 4,
    };

    return tests.sort((testA, testB) => {
      // Extract filename
      const fileA = testA.path.split('/').pop();
      const fileB = testB.path.split('/').pop();

      // Get priority or use default
      const priorityA = sortPriority[fileA] ?? 999;
      const priorityB = sortPriority[fileB] ?? 999;

      // Sort by priority
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // If same priority, sort alphabetically
      return fileA.localeCompare(fileB);
    });
  }
}

module.exports = IntegrationTestSequencer;
