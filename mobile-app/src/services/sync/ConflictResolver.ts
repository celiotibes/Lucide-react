import { logger } from '../../utils/logger';

export type ConflictStrategy = 'client-wins' | 'server-wins' | 'merge' | 'manual';

export interface ConflictInfo {
  entityId: string;
  entityType: string;
  clientVersion: any;
  serverVersion: any;
  clientTimestamp: number;
  serverTimestamp: number;
  strategy: ConflictStrategy;
}

export interface ResolvedConflict {
  entityId: string;
  resolvedVersion: any;
  strategy: ConflictStrategy;
  timestamp: number;
}

export class ConflictResolver {
  private strategy: ConflictStrategy = 'server-wins';
  private manualResolutions: Map<string, ResolvedConflict> = new Map();

  setStrategy(strategy: ConflictStrategy): void {
    this.strategy = strategy;
    logger.info(`Conflict resolution strategy set to: ${strategy}`);
  }

  resolve(conflict: ConflictInfo): ResolvedConflict {
    logger.info(`Resolving conflict for ${conflict.entityType} ${conflict.entityId}`);

    switch (conflict.strategy || this.strategy) {
      case 'client-wins':
        return this.resolveClientWins(conflict);
      case 'server-wins':
        return this.resolveServerWins(conflict);
      case 'merge':
        return this.resolveMerge(conflict);
      case 'manual':
        return this.resolveManual(conflict);
      default:
        return this.resolveServerWins(conflict);
    }
  }

  private resolveClientWins(conflict: ConflictInfo): ResolvedConflict {
    logger.debug('Applying client-wins strategy');
    return {
      entityId: conflict.entityId,
      resolvedVersion: conflict.clientVersion,
      strategy: 'client-wins',
      timestamp: Date.now(),
    };
  }

  private resolveServerWins(conflict: ConflictInfo): ResolvedConflict {
    logger.debug('Applying server-wins strategy');
    return {
      entityId: conflict.entityId,
      resolvedVersion: conflict.serverVersion,
      strategy: 'server-wins',
      timestamp: Date.now(),
    };
  }

  private resolveMerge(conflict: ConflictInfo): ResolvedConflict {
    logger.debug('Attempting 3-way merge');

    const merged = this.mergeVersions(
      conflict.clientVersion,
      conflict.serverVersion,
    );

    return {
      entityId: conflict.entityId,
      resolvedVersion: merged,
      strategy: 'merge',
      timestamp: Date.now(),
    };
  }

  private resolveManual(conflict: ConflictInfo): ResolvedConflict {
    const resolution = this.manualResolutions.get(conflict.entityId);
    if (!resolution) {
      logger.warn(
        `No manual resolution found for ${conflict.entityId}, falling back to server-wins`,
      );
      return this.resolveServerWins(conflict);
    }
    logger.info(`Applied manual resolution for ${conflict.entityId}`);
    return resolution;
  }

  private mergeVersions(clientVersion: any, serverVersion: any): any {
    // Simple field-by-field merge
    // For now, use latest timestamp approach
    // Can be enhanced with deep merge logic for specific entity types

    if (typeof clientVersion !== 'object' || typeof serverVersion !== 'object') {
      // Fallback to server wins for non-objects
      return serverVersion;
    }

    const merged = { ...serverVersion };

    // For accounting entities, take the most recent non-null values
    for (const key in clientVersion) {
      if (
        clientVersion[key] !== null &&
        clientVersion[key] !== undefined &&
        !this.isSystemField(key)
      ) {
        // Custom fields get merged (user data)
        if (this.isUserDataField(key)) {
          merged[key] = clientVersion[key];
        }
      }
    }

    return merged;
  }

  private isSystemField(key: string): boolean {
    return ['id', 'server_id', 'created_at', 'updated_at', 'synced_at'].includes(
      key,
    );
  }

  private isUserDataField(key: string): boolean {
    // Fields that represent user input should use client version
    return [
      'description',
      'notes',
      'category',
      'type',
      'name',
      'counterparty_name',
    ].includes(key);
  }

  registerManualResolution(
    entityId: string,
    resolution: ResolvedConflict,
  ): void {
    this.manualResolutions.set(entityId, resolution);
    logger.info(`Registered manual resolution for ${entityId}`);
  }

  clearManualResolution(entityId: string): void {
    this.manualResolutions.delete(entityId);
  }

  getManualResolutions(): ResolvedConflict[] {
    return Array.from(this.manualResolutions.values());
  }

  // Utility method for three-way merge if base version is available
  mergeWithBase(
    baseVersion: any,
    clientVersion: any,
    serverVersion: any,
  ): any {
    logger.debug('Performing 3-way merge with base version');

    const result = { ...baseVersion };

    // If both client and server changed the same field to different values
    // but the change is from the base, we need to decide

    for (const key in baseVersion) {
      const baseValue = baseVersion[key];
      const clientValue = clientVersion[key];
      const serverValue = serverVersion[key];

      if (clientValue === serverValue) {
        // No conflict
        result[key] = clientValue;
      } else if (clientValue === baseValue) {
        // Only server changed this field
        result[key] = serverValue;
      } else if (serverValue === baseValue) {
        // Only client changed this field
        result[key] = clientValue;
      } else {
        // Both changed - use server wins as default
        result[key] = serverValue;
        logger.warn(`Conflict on field ${key}, server version wins`);
      }
    }

    return result;
  }
}
