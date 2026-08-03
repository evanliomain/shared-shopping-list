/**
 * IndexedDB en mémoire, parce que jsdom n'en fournit aucune.
 *
 * On n'implémente que ce que le stockage de réglages utilise — une base, un
 * magasin, `get`/`put`/`delete` — mais avec la **chronologie** de la vraie API :
 * les gestionnaires sont posés après l'appel, donc rien ne se déclenche avant le
 * tour de boucle suivant. Un faux synchrone laisserait passer un `onsuccess`
 * jamais branché.
 */

type Handler = (() => void) | null;

// Le stockage de réglages est le seul client de ce double : ses noms sont donc
// connus d'avance, et c'est ce qui permet de semer une base déjà pourvue.
const DB_NAME = 'shopping-list-settings';
const STORE_NAME = 'kv';

interface StoredDatabase {
  version: number;
  readonly stores: Map<string, Map<IDBValidKey, unknown>>;
}

class FakeRequest<T> {
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
  result: T | undefined;
  error: DOMException | null = null;
}

export interface FakeIndexedDb {
  /** Connexions ouvertes et pas encore refermées. */
  openConnections(): number;
  /** Magasins créés pendant une montée de version. */
  readonly created: string[];
  /** La prochaine ouverture de base échouera. */
  failNextOpen(): void;
  /** La prochaine lecture ou écriture échouera. */
  failNextRequest(): void;
  restore(): void;
}

export interface FakeIndexedDbOptions {
  /**
   * Réglages déjà rangés. Leur présence implique un magasin déjà créé, donc une
   * base à faire monter de version plutôt qu'à initialiser.
   */
  readonly entries?: readonly (readonly [IDBValidKey, unknown])[];
}

export function installFakeIndexedDb(
  options: FakeIndexedDbOptions = {},
): FakeIndexedDb {
  const databases = new Map<string, StoredDatabase>();
  const failing = { open: false, request: false };
  const created: string[] = [];
  let connections = 0;

  if (undefined !== options.entries) {
    // Version 0 : la base existe et porte déjà son magasin, mais reste en deçà
    // de celle que le code demande. C'est le seul montage qui fait entrer
    // `onupgradeneeded` sur un magasin présent.
    databases.set(DB_NAME, {
      version: 0,
      stores: new Map([[STORE_NAME, new Map(options.entries)]]),
    });
  }

  function later<T>(request: FakeRequest<T>, run: () => T): void {
    queueMicrotask(() => {
      if (failing.request) {
        failing.request = false;
        request.error = new DOMException('requête refusée', 'UnknownError');
        request.onerror?.();
        return;
      }
      request.result = run();
      request.onsuccess?.();
    });
  }

  class FakeObjectStore {
    constructor(private readonly data: Map<IDBValidKey, unknown>) {}

    get(key: IDBValidKey): FakeRequest<unknown> {
      const request = new FakeRequest<unknown>();
      later(request, () => this.data.get(key));
      return request;
    }

    put(value: unknown, key: IDBValidKey): FakeRequest<IDBValidKey> {
      const request = new FakeRequest<IDBValidKey>();
      later(request, () => {
        this.data.set(key, value);
        return key;
      });
      return request;
    }

    delete(key: IDBValidKey): FakeRequest<undefined> {
      const request = new FakeRequest<undefined>();
      later(request, () => {
        this.data.delete(key);
        return undefined;
      });
      return request;
    }
  }

  class FakeDatabase {
    private closed = false;

    constructor(private readonly stored: StoredDatabase) {
      connections++;
    }

    get objectStoreNames(): { contains(name: string): boolean } {
      return { contains: (name) => this.stored.stores.has(name) };
    }

    createObjectStore(name: string): FakeObjectStore {
      created.push(name);
      const data = new Map<IDBValidKey, unknown>();
      this.stored.stores.set(name, data);
      return new FakeObjectStore(data);
    }

    /** Le mode est ignoré : il n'y a ici ni isolation ni concurrence à simuler. */
    transaction(name: string): { objectStore(store: string): FakeObjectStore } {
      const data = this.stored.stores.get(name);
      if (undefined === data) {
        throw new DOMException(`magasin inconnu : ${name}`, 'NotFoundError');
      }
      return { objectStore: () => new FakeObjectStore(data) };
    }

    close(): void {
      if (this.closed) {
        return;
      }
      this.closed = true;
      connections--;
    }
  }

  const factory = {
    open(name: string, version: number): FakeRequest<FakeDatabase> {
      const request = new FakeRequest<FakeDatabase>();

      queueMicrotask(() => {
        if (failing.open) {
          failing.open = false;
          request.error = new DOMException('base indisponible', 'UnknownError');
          request.onerror?.();
          return;
        }

        const stored: StoredDatabase = databases.get(name) ?? {
          version: 0,
          stores: new Map(),
        };
        databases.set(name, stored);

        request.result = new FakeDatabase(stored);
        if (stored.version < version) {
          stored.version = version;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });

      return request;
    },
  };

  const holder = globalThis as unknown as Record<string, unknown>;
  const previous = holder['indexedDB'];
  holder['indexedDB'] = factory;

  return {
    openConnections: () => connections,
    created,
    failNextOpen: () => {
      failing.open = true;
    },
    failNextRequest: () => {
      failing.request = true;
    },
    restore: () => {
      holder['indexedDB'] = previous;
    },
  };
}
