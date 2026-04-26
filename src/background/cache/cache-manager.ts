import type { CacheEntry, CacheStats, CacheSiteStat } from '../../shared/types';

const DB_NAME = 'fuzzy-translate-cache';
const DB_VERSION = 1;
const STORE_NAME = 'translations';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function doTransaction<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

interface StoredEntry extends CacheEntry {
  key: string;
}

/** Get a cache entry. Returns null if not found or expired. */
export async function cacheGet(key: string): Promise<CacheEntry | null> {
  try {
    const entry = await doTransaction<StoredEntry | undefined>(
      'readonly',
      (store) => store.get(key)
    );

    if (!entry) return null;

    // Check expiry
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      // Expired — delete asynchronously, return null
      cacheDelete(key).catch(() => {});
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

/** Store a cache entry. */
export async function cacheSet(key: string, entry: CacheEntry): Promise<void> {
  const stored: StoredEntry = { ...entry, key };
  await doTransaction('readwrite', (store) => store.put(stored));
}

/** Delete a specific cache entry. */
export async function cacheDelete(key: string): Promise<void> {
  await doTransaction('readwrite', (store) => store.delete(key));
}

/** Clear all cache entries. */
export async function cacheClear(): Promise<void> {
  await doTransaction('readwrite', (store) => store.clear());
}

/** Aggregate cache stats: total count/bytes + per-host breakdown. */
export async function cacheStats(): Promise<CacheStats> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    const entries = await new Promise<StoredEntry[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as StoredEntry[]);
      req.onerror = () => reject(req.error);
    });
    tx.oncomplete = () => db.close();

    const bySite = new Map<string, CacheSiteStat>();
    let totalBytes = 0;
    for (const e of entries) {
      const size = (e.translation?.length || 0) * 2; // rough UTF-16 byte estimate
      totalBytes += size;
      const host = e.hostname || '(unknown)';
      const stat = bySite.get(host) || { hostname: host, count: 0, bytes: 0, lastAccessed: 0 };
      stat.count++;
      stat.bytes += size;
      if (e.createdAt > stat.lastAccessed) stat.lastAccessed = e.createdAt;
      bySite.set(host, stat);
    }
    const siteList = Array.from(bySite.values()).sort((a, b) => b.bytes - a.bytes);
    return { totalCount: entries.length, totalBytes, bySite: siteList };
  } catch {
    return { totalCount: 0, totalBytes: 0, bySite: [] };
  }
}

/** Clear all entries belonging to a specific hostname. */
export async function cacheClearByHost(hostname: string): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.openCursor();
  let deleted = 0;
  return new Promise((resolve, reject) => {
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const entry = cursor.value as StoredEntry;
        if ((entry.hostname || '(unknown)') === hostname) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => { db.close(); resolve(deleted); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Clear all expired entries. Called daily via chrome.alarms. */
export async function cacheClearExpired(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('expiresAt');
  const now = Date.now();

  // Get all entries with expiresAt <= now (and > 0)
  const range = IDBKeyRange.bound(1, now);
  const request = index.openCursor(range);

  return new Promise((resolve, reject) => {
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
