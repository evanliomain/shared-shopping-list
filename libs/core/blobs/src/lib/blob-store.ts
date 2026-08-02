/**
 * Stockage local des images, adressé par contenu.
 *
 * Une entrée n'est jamais modifiée, seulement créée : son nom **est** son
 * empreinte. Trois conséquences qui simplifient tout le reste :
 *
 *  - aucun conflit d'écriture possible entre deux appareils ;
 *  - un cache local valable indéfiniment, sans invalidation ;
 *  - deux produits illustrés par la même photo ne la stockent qu'une fois.
 */
const DB_NAME = 'shopping-list-blobs';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

export interface StoredBlob {
  readonly hash: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
  readonly storedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(
        db.transaction(STORE_NAME, mode).objectStore(STORE_NAME),
      );
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function readBlob(hash: string): Promise<StoredBlob | null> {
  const stored = await transact<StoredBlob | undefined>('readonly', (store) =>
    store.get(hash),
  );
  return stored ?? null;
}

export async function writeBlob(
  hash: string,
  bytes: Uint8Array,
  mime: string,
  now: number,
): Promise<void> {
  await transact('readwrite', (store) =>
    store.put({ hash, mime, bytes, storedAt: now } satisfies StoredBlob),
  );
}

export async function hasBlob(hash: string): Promise<boolean> {
  const count = await transact<number>('readonly', (store) =>
    store.count(hash),
  );
  return 0 < count;
}

export async function listBlobHashes(): Promise<string[]> {
  const keys = await transact<IDBValidKey[]>('readonly', (store) =>
    store.getAllKeys(),
  );
  return keys.map(String);
}

export async function deleteBlob(hash: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(hash));
}
