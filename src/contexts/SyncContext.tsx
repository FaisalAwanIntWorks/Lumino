import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SyncProgress {
  processed: number;
  remaining: number;
  total: number;
  created: number;
  updated: number;
  failed: number;
}

interface SyncJob {
  type: 'rings';
  status: 'running' | 'completed' | 'error';
  progress: SyncProgress | null;
  startTime: number;
  retryFailed: boolean;
}

interface SyncContextValue {
  activeJobs: SyncJob[];
  isAnySyncRunning: boolean;
  startRingSync: (clientId: string, retryFailed?: boolean) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncContext() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be inside SyncProvider');
  return ctx;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [activeJobs, setActiveJobs] = useState<SyncJob[]>([]);
  const runningRef = useRef<Set<string>>(new Set());

  const updateJob = useCallback((type: 'rings', updates: Partial<SyncJob>) => {
    setActiveJobs(prev => prev.map(j => j.type === type ? { ...j, ...updates } : j));
  }, []);

  const removeJob = useCallback((type: 'rings') => {
    setActiveJobs(prev => prev.filter(j => j.type !== type));
    runningRef.current.delete(type);
  }, []);

  const sendNotification = useCallback(async (clientId: string, title: string, message: string) => {
    try {
      await supabase.from('client_notifications' as any).insert({
        client_id: clientId,
        category: 'system',
        title,
        message,
        metadata: { source: 'shopify_sync' },
      });
    } catch (e) {
      console.error('Failed to send notification:', e);
    }
  }, []);

  const runSync = useCallback(async (
    type: 'rings',
    clientId: string,
    retryFailed: boolean,
    fnName: string,
  ) => {
    if (runningRef.current.has(type)) {
      toast.error('Ring sync already running');
      return;
    }
    runningRef.current.add(type);

    const job: SyncJob = {
      type,
      status: 'running',
      progress: null,
      startTime: Date.now(),
      retryFailed: retryFailed,
    };
    setActiveJobs(prev => [...prev.filter(j => j.type !== type), job]);

    const batchSize = 15;
    const MAX_BATCH_RETRIES = 3;
    const MAX_OUTER_RETRIES = 5;
    let hasMore = true;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let outerRetries = 0;

    while (hasMore && outerRetries <= MAX_OUTER_RETRIES) {
      try {
        while (hasMore) {
          let batchRetries = 0;
          let batchData: any = null;

          while (batchRetries < MAX_BATCH_RETRIES) {
            try {
              const { data, error } = await supabase.functions.invoke(fnName, {
                body: { clientId, batchSize, retryFailedOnly: retryFailed },
              });
              if (error) throw error;
              if (!data.success) throw new Error(data.error || 'Sync failed');
              batchData = data;
              break;
            } catch (err: any) {
              batchRetries++;
              if (batchRetries >= MAX_BATCH_RETRIES) throw err;
              await new Promise(r => setTimeout(r, batchRetries * 10000));
            }
          }

          totalCreated += batchData.created || 0;
          totalUpdated += batchData.updated || 0;
          totalFailed += batchData.failed || 0;
          hasMore = batchData.hasMore;
          outerRetries = 0;

          updateJob(type, {
            progress: {
              processed: batchData.total - batchData.remaining,
              remaining: batchData.remaining,
              total: batchData.total,
              created: totalCreated,
              updated: totalUpdated,
              failed: totalFailed,
            },
          });
        }
        break;
      } catch (error: any) {
        outerRetries++;
        if (outerRetries > MAX_OUTER_RETRIES) {
          toast.error('Ring sync stopped after multiple failures');
          updateJob(type, { status: 'error' });
          await sendNotification(clientId, 'Ring Sync Failed', `Sync stopped after multiple retries. ${totalCreated + totalUpdated} synced, ${totalFailed} failed.`);
          setTimeout(() => removeJob(type), 10000);
          return;
        }
        await new Promise(r => setTimeout(r, outerRetries * 15000));
        hasMore = true;
      }
    }

    const total = totalCreated + totalUpdated;
    if (total > 0) toast.success(`${total} rings synced to Shopify`);
    if (totalFailed > 0) toast.warning(`${totalFailed} rings failed to sync`);

    updateJob(type, { status: 'completed' });
    await sendNotification(
      clientId,
      'Ring Sync Complete',
      `${total} products synced${totalFailed > 0 ? `, ${totalFailed} failed` : ''}.`
    );
    setTimeout(() => removeJob(type), 5000);
  }, [updateJob, removeJob, sendNotification]);

  const startRingSync = useCallback((clientId: string, retryFailed = false) => {
    runSync('rings', clientId, retryFailed, 'shopify-push-catalog');
  }, [runSync]);

  const isAnySyncRunning = activeJobs.some(j => j.status === 'running');

  return (
    <SyncContext.Provider value={{ activeJobs, isAnySyncRunning, startRingSync }}>
      {children}
    </SyncContext.Provider>
  );
}
