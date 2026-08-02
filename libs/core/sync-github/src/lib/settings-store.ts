/**
 * Petit stockage clé-valeur sur IndexedDB.
 *
 * Pourquoi pas `localStorage` : il est synchrone et bloque le fil principal, et
 * la configuration est lue au démarrage, juste au moment où l'on veut afficher
 * la liste au plus vite. IndexedDB est déjà ouvert de toute façon pour le CRDT.
 *
 * Ce n'est pas un coffre-fort : le jeton y est en clair. C'est acceptable pour
 * la portée en jeu — un PAT limité à `Contents` sur un unique dépôt privé de
 * liste de courses — et ça ne doit pas être étendu au-delà.
 */
const DB_NAME = 'shopping-list-settings';
const STORE_NAME = 'kv';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
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

export async function readSetting<T>(key: string): Promise<T | null> {
  const value = await transact<T | undefined>('readonly', (store) =>
    store.get(key),
  );
  return value ?? null;
}

export async function writeSetting<T>(key: string, value: T): Promise<void> {
  await transact('readwrite', (store) => store.put(value, key));
}

export async function deleteSetting(key: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(key));
}
