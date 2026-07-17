'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface RealtimeUpdate {
  table: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  timestamp: Date;
  count: number;
}

interface RealtimeContextType {
  isConnected: boolean;
  lastUpdate?: RealtimeUpdate;
  updates: RealtimeUpdate[];
  hasNewData: boolean;
  clearNewData: () => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<RealtimeUpdate | undefined>();
  const [updates, setUpdates] = useState<RealtimeUpdate[]>([]);
  const [hasNewData, setHasNewData] = useState(false);

  const clearNewData = useCallback(() => {
    setHasNewData(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    // Monitor tabelas importantes
    const tablesToMonitor = [
      'fact_apontamento',
      'fact_faturamento',
      'fact_despesa',
      'fact_recebimento',
    ];

    // Subscribe to changes (Supabase Realtime)
    const subscriptions = tablesToMonitor.map((table) =>
      supabase
        .channel(`public:${table}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: table,
          },
          (payload: any) => {
            const update: RealtimeUpdate = {
              table,
              action: payload.eventType.toUpperCase() as 'INSERT' | 'UPDATE' | 'DELETE',
              timestamp: new Date(),
              count: 1,
            };

            setLastUpdate(update);
            setUpdates((prev) => [update, ...prev.slice(0, 9)]); // Keep last 10
            setHasNewData(true);
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED');
        })
    );

    return () => {
      subscriptions.forEach((sub) => {
        if (sub) supabase.removeChannel(sub);
      });
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ isConnected, lastUpdate, updates, hasNewData, clearNewData }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (context === undefined) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return context;
}
