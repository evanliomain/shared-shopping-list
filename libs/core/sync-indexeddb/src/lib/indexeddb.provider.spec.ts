import { SyncProvider } from '@shopping-list/core/sync';
import * as Y from 'yjs';

import { INDEXEDDB_DB_NAME, IndexeddbSyncProvider } from './indexeddb.provider';

/**
 * Doublure de `y-indexeddb`.
 *
 * jsdom ne fournit aucune IndexedDB, et ce provider ne fait qu'envelopper la
 * bibliothèque : ce qui se vérifie ici, c'est le câblage — une seule base par
 * provider, l'événement « synced » relayé dans le signal d'état, la destruction
 * effective au détachement, et un refus de stockage qui ne remonte pas.
 */
const yIndexeddb = vi.hoisted(() => {
  const ouvertes: FaussePersistance[] = [];
  let refus: unknown = null;

  class FaussePersistance {
    destructions = 0;
    effacements = 0;
    private readonly ecouteurs: Array<() => void> = [];

    constructor(
      readonly base: string,
      readonly doc: unknown,
    ) {
      if (null !== refus) {
        const refuse = refus;
        refus = null;
        throw refuse;
      }
      ouvertes.push(this);
    }

    on(evenement: string, ecouteur: () => void): void {
      if ('synced' === evenement) {
        this.ecouteurs.push(ecouteur);
      }
    }

    /** Ce que fait la bibliothèque une fois le contenu stocké appliqué. */
    annonceRelecture(): void {
      for (const ecouteur of this.ecouteurs) {
        ecouteur();
      }
    }

    async destroy(): Promise<void> {
      this.destructions++;
    }

    async clearData(): Promise<void> {
      this.effacements++;
    }
  }

  return {
    FaussePersistance,
    ouvertes,
    /** La prochaine ouverture de base échouera. */
    refuseLaProchaineOuverture: (raison: unknown): void => {
      refus = raison;
    },
    oublie: (): void => {
      ouvertes.length = 0;
      refus = null;
    },
  };
});

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: yIndexeddb.FaussePersistance,
}));

describe('IndexeddbSyncProvider', () => {
  beforeEach(() => yIndexeddb.oublie());

  it('ouvre la base du document et attend sa relecture', () => {
    const provider = new IndexeddbSyncProvider();
    const doc = new Y.Doc();

    provider.connect(doc);

    // Tant que le contenu stocké n'a pas été appliqué, la liste affichée est
    // vide : l'état ne peut pas déjà annoncer « live ».
    expect(provider.status()).toBe('connecting');
    expect(yIndexeddb.ouvertes).toHaveLength(1);
    expect(yIndexeddb.ouvertes[0].base).toBe(INDEXEDDB_DB_NAME);
    expect(yIndexeddb.ouvertes[0].doc).toBe(doc);
  });

  it('passe à « live » une fois le contenu stocké appliqué', () => {
    const provider = new IndexeddbSyncProvider();
    provider.connect(new Y.Doc());

    yIndexeddb.ouvertes[0].annonceRelecture();

    expect(provider.status()).toBe('live');
    expect(provider.lastError()).toBeNull();
  });

  it('n’ouvre pas une seconde base pour un provider déjà branché', () => {
    // Deux bases sur le même nom se battraient pour les mêmes clés.
    const provider = new IndexeddbSyncProvider();
    provider.connect(new Y.Doc());
    provider.connect(new Y.Doc());

    expect(yIndexeddb.ouvertes).toHaveLength(1);
  });

  it('reste utilisable quand le stockage est refusé', () => {
    // Navigation privée, quota épuisé, IndexedDB désactivé : l'application doit
    // continuer, simplement sans persistance.
    yIndexeddb.refuseLaProchaineOuverture(new Error('quota épuisé'));
    const provider = new IndexeddbSyncProvider();

    expect(() => provider.connect(new Y.Doc())).not.toThrow();
    expect(provider.status()).toBe('error');
    expect(provider.lastError()).toBe('quota épuisé');
  });

  it('rapporte un refus qui n’est pas une Error', () => {
    yIndexeddb.refuseLaProchaineOuverture('stockage désactivé');
    const provider = new IndexeddbSyncProvider();

    provider.connect(new Y.Doc());

    expect(provider.lastError()).toBe('stockage désactivé');
  });

  it('retente l’ouverture après un refus', () => {
    // Le refus n'a laissé aucune persistance derrière lui : une reconnexion
    // ultérieure doit repartir de zéro, pas se croire déjà branchée.
    const provider = new IndexeddbSyncProvider();
    yIndexeddb.refuseLaProchaineOuverture(new Error('quota épuisé'));
    provider.connect(new Y.Doc());

    provider.connect(new Y.Doc());

    expect(yIndexeddb.ouvertes).toHaveLength(1);
    expect(provider.status()).toBe('connecting');
  });

  it('détruit la persistance en se détachant', () => {
    const provider = new IndexeddbSyncProvider();
    provider.connect(new Y.Doc());
    const persistance = yIndexeddb.ouvertes[0];

    provider.disconnect();

    expect(persistance.destructions).toBe(1);
    expect(provider.status()).toBe('idle');
  });

  it('se détache sans rien avoir ouvert', () => {
    // Le registre détache tous les canaux, y compris ceux qui n'ont jamais
    // réussi à s'ouvrir.
    const provider = new IndexeddbSyncProvider();

    expect(() => provider.disconnect()).not.toThrow();
    expect(provider.status()).toBe('idle');
  });

  it('efface les données locales', async () => {
    const provider = new IndexeddbSyncProvider();
    provider.connect(new Y.Doc());

    await provider.clear();

    expect(yIndexeddb.ouvertes[0].effacements).toBe(1);
  });

  it('n’a rien à effacer avant d’être branché', async () => {
    // « Repartir de zéro » est proposé quoi qu'il arrive, y compris quand la
    // persistance n'a jamais démarré.
    await expect(new IndexeddbSyncProvider().clear()).resolves.toBeUndefined();
  });

  it('ne tient aucun compteur d’attente', () => {
    // Être persisté localement ne veut pas dire être synchronisé avec l'autre
    // téléphone : ce canal n'a rien à mettre en attente, et l'indicateur ne
    // doit pas le compter comme distant.
    const provider: SyncProvider = new IndexeddbSyncProvider();

    expect(provider.id).toBe('indexeddb');
    expect(provider.labelKey).toBe('sync.providers.indexeddb');
    expect(provider.pending).toBeUndefined();
  });
});
