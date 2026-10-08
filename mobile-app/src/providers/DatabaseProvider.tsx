import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { Database } from '@nozbe/watermelondb';
import {
  initializeDatabase,
  getDatabase as getDatabaseInstance,
} from '../database';
import { MigrationManager } from '../database/migrations';
import { HealthChecker, HealthStatus } from '../utils/health-check';
import { logger } from '../utils/logger';

interface DatabaseContextType {
  database: Database | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  healthStatus: HealthStatus | null;
  refreshHealth: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [database, setDatabase] = useState<Database | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);

  useEffect(() => {
    const initDB = async () => {
      try {
        setIsLoading(true);
        logger.info('Database initialization starting...');

        const db = await initializeDatabase();
        setDatabase(db);

        // Run migrations
        const migrationManager = new MigrationManager(db);
        await migrationManager.initialize();
        await migrationManager.runPendingMigrations();

        // Check health
        const healthChecker = new HealthChecker(db);
        const status = await healthChecker.check();
        setHealthStatus(status);

        logger.info('Database initialized successfully', {
          recordCount: status.database.recordCount,
        });
        setIsInitialized(true);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Database initialization failed', error);
        setError(error);
      } finally {
        setIsLoading(false);
      }
    };

    initDB();
  }, []);

  const refreshHealth = async () => {
    if (!database) return;

    try {
      const healthChecker = new HealthChecker(database);
      const status = await healthChecker.check();
      setHealthStatus(status);

      if (status.overall === 'unhealthy') {
        logger.warn('Database health is unhealthy', status);
        await healthChecker.repair();
      }
    } catch (err) {
      logger.error('Health check failed', err);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ErrorScreen error={error} />
      </View>
    );
  }

  return (
    <DatabaseContext.Provider
      value={{
        database,
        isInitialized,
        isLoading: false,
        error: null,
        healthStatus,
        refreshHealth,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
};

const ErrorScreen: React.FC<{ error: Error }> = ({ error }) => {
  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
        Database Error
      </Text>
      <Text style={{ fontSize: 14, color: '#666' }}>{error.message}</Text>
    </View>
  );
};

export const useDatabase = (): DatabaseContextType => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};

export const useDatabaseInstance = (): Database => {
  const { database } = useDatabase();
  if (!database) {
    throw new Error('Database not initialized');
  }
  return database;
};
