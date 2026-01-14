const CACHE_NAME = 'fieldtech-v2';
const STATIC_ASSETS = [
  '/',
  '/favicon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('fieldtech-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

async function getOfflineQueue() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction('queue', 'readonly');
      const store = tx.objectStore('queue');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function addToOfflineQueue(item) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      store.add({ ...item, timestamp: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function removeFromQueue(id) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function clearOfflineQueue() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      store.clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FieldTechOffline', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage(message);
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (event.request.method !== 'GET') {
    if (url.pathname.startsWith('/api/')) {
      const contentType = event.request.headers.get('content-type') || '';
      const isFileUpload = contentType.includes('multipart/form-data');
      
      if (isFileUpload) {
        return;
      }
      
      event.respondWith(
        fetch(event.request.clone())
          .catch(async () => {
            let body = null;
            try {
              body = await event.request.clone().text();
            } catch {
              body = null;
            }
            
            const headers = {};
            event.request.headers.forEach((value, key) => {
              if (!['content-length', 'host'].includes(key.toLowerCase())) {
                headers[key] = value;
              }
            });
            
            const queued = await addToOfflineQueue({
              url: event.request.url,
              method: event.request.method,
              body: body,
              headers: headers,
              credentials: event.request.credentials
            });
            
            if (queued) {
              notifyClients({ type: 'ITEM_QUEUED', url: event.request.url });
            }
            
            return new Response(JSON.stringify({ 
              queued: true, 
              message: 'Request saved for when you are back online' 
            }), {
              status: 202,
              headers: { 'Content-Type': 'application/json' }
            });
          })
      );
    }
    return;
  }
  
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
      return cached || fetched;
    })
  );
});

self.addEventListener('sync', async (event) => {
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  const queue = await getOfflineQueue();
  let successCount = 0;
  let failCount = 0;
  
  for (const item of queue) {
    try {
      const headers = item.headers || { 'Content-Type': 'application/json' };
      
      const response = await fetch(item.url, {
        method: item.method,
        body: item.body,
        headers: headers,
        credentials: item.credentials || 'same-origin'
      });
      
      if (response.ok) {
        await removeFromQueue(item.id);
        successCount++;
        notifyClients({ type: 'SYNC_SUCCESS', url: item.url });
      } else {
        failCount++;
        notifyClients({ type: 'SYNC_FAILED', url: item.url, status: response.status });
      }
    } catch (error) {
      failCount++;
      notifyClients({ type: 'SYNC_FAILED', url: item.url, error: error.message });
    }
  }
  
  const remaining = await getOfflineQueue();
  notifyClients({ 
    type: 'SYNC_COMPLETE', 
    remaining: remaining.length,
    successCount,
    failCount
  });
}

self.addEventListener('message', async (event) => {
  if (event.data.type === 'GET_QUEUE_STATUS') {
    const queue = await getOfflineQueue();
    event.source.postMessage({ 
      type: 'QUEUE_STATUS', 
      count: queue.length,
      items: queue.map(q => ({ id: q.id, url: q.url, method: q.method, timestamp: q.timestamp }))
    });
  }
  
  if (event.data.type === 'SYNC_NOW') {
    await syncOfflineQueue();
  }
  
  if (event.data.type === 'CLEAR_QUEUE') {
    await clearOfflineQueue();
    event.source.postMessage({ type: 'QUEUE_CLEARED' });
  }
});
