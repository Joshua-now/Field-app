import { useState, useEffect, useCallback } from 'react';

interface QueueItem {
  id: number;
  url: string;
  method: string;
  body: string;
  timestamp: number;
}

interface OfflineState {
  isOnline: boolean;
  queueCount: number;
  queueItems: QueueItem[];
  isSyncing: boolean;
}

export function useOffline() {
  const [state, setState] = useState<OfflineState>({
    isOnline: navigator.onLine,
    queueCount: 0,
    queueItems: [],
    isSyncing: false
  });

  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      syncNow();
    };
    
    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'QUEUE_STATUS') {
        setState(prev => ({
          ...prev,
          queueCount: event.data.count,
          queueItems: event.data.items
        }));
      }
      
      if (event.data.type === 'SYNC_COMPLETE') {
        setState(prev => ({
          ...prev,
          queueCount: event.data.remaining,
          isSyncing: false
        }));
      }
      
      if (event.data.type === 'ITEM_QUEUED') {
        refreshQueueStatus();
      }
      
      if (event.data.type === 'SYNC_SUCCESS' || event.data.type === 'SYNC_FAILED') {
        refreshQueueStatus();
      }
      
      if (event.data.type === 'QUEUE_CLEARED') {
        setState(prev => ({
          ...prev,
          queueCount: 0,
          queueItems: [],
          isSyncing: false
        }));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    refreshQueueStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);

  const refreshQueueStatus = useCallback(() => {
    navigator.serviceWorker?.controller?.postMessage({ type: 'GET_QUEUE_STATUS' });
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    
    setState(prev => ({ ...prev, isSyncing: true }));
    
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      try {
        await (registration as any).sync.register('sync-offline-queue');
      } catch {
        navigator.serviceWorker?.controller?.postMessage({ type: 'SYNC_NOW' });
      }
    } else {
      navigator.serviceWorker?.controller?.postMessage({ type: 'SYNC_NOW' });
    }
  }, []);

  const clearQueue = useCallback(() => {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_QUEUE' });
  }, []);

  return {
    ...state,
    syncNow,
    clearQueue,
    refreshQueueStatus
  };
}
