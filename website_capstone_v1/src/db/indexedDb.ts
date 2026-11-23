const DB_NAME = 'medalert_db';
const DB_VERSION = 1;

type StoreName = 'users' | 'profiles' | 'dailyLogs' | 'mlSnapshots' | 'meta';

const STORES: StoreName[] = ['users', 'profiles', 'dailyLogs', 'mlSnapshots', 'meta'];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export async function initIndexedDB(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  db.close();
}

export async function setCollection<T>(storeName: StoreName, key: string, data: T): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.put(data, key));
}

export async function getCollection<T>(storeName: StoreName, key: string): Promise<T | null> {
  const result = await withStore<T | undefined>(storeName, 'readonly', (store) => store.get(key));
  return result ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await withStore('meta', 'readwrite', (store) => store.put(value as IDBValidKey, key));
}

export async function getMeta(key: string): Promise<string | null> {
  const result = await withStore<string | undefined>('meta', 'readonly', (store) => store.get(key));
  return result ?? null;
}
