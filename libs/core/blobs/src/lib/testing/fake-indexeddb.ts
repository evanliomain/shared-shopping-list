/**
 * Un IndexedDB de papier, en mémoire.
 *
 * jsdom ne l'implémente pas, et le magasin de photos est justement la pièce à
 * vérifier : sans double, `blob-store` ne serait jamais exécuté. Ce faux ne
 * couvre que ce que `blob-store` demande — un magasin à clé unique, cinq
 * opérations — plus ce qu'un vrai navigateur fait subir au code : une base
 * qu'on n'ouvre pas, une écriture refusée, un onglet concurrent qui efface.
 */
import { StoredBlob } from '../blob-store';

const STORE_NAME = 'blobs';

export type FakeOperation =
  | 'open'
  | 'get'
  | 'put'
  | 'count'
  | 'getAllKeys'
  | 'delete';

export interface FakeIndexedDb {
  /** Entrées rangées, triées par empreinte. */
  rows(): StoredBlob[];
  /** Retire une entrée sans passer par le code testé. */
  remove(hash: string): void;
  /** Connexions refermées : une par opération, sinon la base reste verrouillée. */
  closes: number;
  /** Magasins créés pendant une montée de version. */
  readonly created: string[];
  /** Opérations à faire échouer, pour jouer un IndexedDB indisponible. */
  readonly failing: Set<FakeOperation>;
  /** Appelé avant chaque lecture : de quoi simuler un onglet concurrent. */
  onRead: ((hash: string) => void) | null;
  restore(): void;
}

export interface FakeIndexedDbOptions {
  /**
   * Entrées déjà rangées. Leur présence implique un magasin déjà créé, donc
   * une base à faire monter de version plutôt qu'à initialiser.
   */
  readonly entries?: readonly StoredBlob[];
}

export function installFakeIndexedDb(
  options: FakeIndexedDbOptions = {},
): FakeIndexedDb {
  const stores = new Map<string, Map<string, StoredBlob>>();
  let version = 0;

  if (undefined !== options.entries) {
    stores.set(
      STORE_NAME,
      new Map(options.entries.map((entry) => [entry.hash, entry])),
    );
  }

  const holder = globalThis as unknown as Record<string, unknown>;
  const previous = holder['indexedDB'];

  const fake: FakeIndexedDb = {
    rows: () =>
      [...(stores.get(STORE_NAME)?.values() ?? [])].sort((left, right) =>
        left.hash.localeCompare(right.hash),
      ),
    remove: (hash: string) => {
      stores.get(STORE_NAME)?.delete(hash);
    },
    closes: 0,
    created: [],
    failing: new Set<FakeOperation>(),
    onRead: null,
    restore: () => {
      holder['indexedDB'] = previous;
    },
  };

  function refuse(operation: FakeOperation): DOMException {
    return new DOMException(`${operation} indisponible`, 'UnknownError');
  }

  /**
   * Toute requête IndexedDB rend son résultat plus tard : le code de
   * production accroche ses gestionnaires après l'appel, jamais avant.
   */
  function settle<T>(
    operation: FakeOperation,
    compute: () => T,
  ): IDBRequest<T> {
    const request = {
      result: undefined as T,
      error: null as DOMException | null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };

    queueMicrotask(() => {
      if (fake.failing.has(operation)) {
        request.error = refuse(operation);
        request.onerror?.();
        return;
      }
      request.result = compute();
      request.onsuccess?.();
    });

    return request as unknown as IDBRequest<T>;
  }

  function objectStore(name: string): IDBObjectStore {
    const rows = (): Map<string, StoredBlob> => {
      const found = stores.get(name);
      if (undefined === found) {
        throw new DOMException(`magasin ${name} inconnu`, 'NotFoundError');
      }
      return found;
    };

    return {
      get: (key: string) =>
        settle('get', () => {
          fake.onRead?.(key);
          return rows().get(key);
        }),
      put: (value: StoredBlob) =>
        settle('put', () => {
          rows().set(value.hash, value);
          return value.hash;
        }),
      count: (key: string) => settle('count', () => (rows().has(key) ? 1 : 0)),
      getAllKeys: () => settle('getAllKeys', () => [...rows().keys()]),
      delete: (key: string) =>
        settle('delete', () => {
          rows().delete(key);
        }),
    } as unknown as IDBObjectStore;
  }

  function database(): IDBDatabase {
    return {
      objectStoreNames: { contains: (name: string) => stores.has(name) },
      createObjectStore: (name: string) => {
        stores.set(name, new Map());
        fake.created.push(name);
        return objectStore(name);
      },
      transaction: (name: string) => ({
        objectStore: () => objectStore(name),
      }),
      close: () => {
        fake.closes++;
      },
    } as unknown as IDBDatabase;
  }

  function open(name: string, requested: number): IDBOpenDBRequest {
    const request = {
      result: undefined as unknown as IDBDatabase,
      error: null as DOMException | null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onupgradeneeded: null as (() => void) | null,
    };

    queueMicrotask(() => {
      if (fake.failing.has('open')) {
        request.error = refuse('open');
        request.onerror?.();
        return;
      }

      request.result = database();
      if (version < requested) {
        version = requested;
        request.onupgradeneeded?.();
      }
      request.onsuccess?.();
    });

    return request as unknown as IDBOpenDBRequest;
  }

  holder['indexedDB'] = { open };

  return fake;
}
