import { TestBed } from '@angular/core/testing';
import { provideStore, Store } from '@ngrx/store';
import { BlobService } from '@shopping-list/core/blobs';
import {
  CrdtSnapshot,
  ensureList,
  readSnapshot,
  YDocService,
} from '@shopping-list/core/crdt';
import { SyncRegistry } from '@shopping-list/core/sync';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';
import { firstValueFrom, Subject } from 'rxjs';
import * as Y from 'yjs';

import { provideShopping } from './provide-shopping';
import {
  DEFAULT_LIST_ID,
  selectListName,
  selectLoaded,
} from './shopping.feature';

const NOW = 1_764_000_000_000;

describe('provideShopping', () => {
  let doc: Y.Doc;
  let snapshots: Subject<CrdtSnapshot>;
  let registries: number;

  /**
   * Le registre de synchronisation n'est injecté nulle part ailleurs : le
   * compter est la seule façon de vérifier que l'amorçage l'a bien instancié.
   */
  class FauxRegistre {
    constructor() {
      registries++;
    }
  }

  beforeEach(() => {
    registries = 0;
    snapshots = new Subject<CrdtSnapshot>();
  });

  /** @returns le store d'une application câblée par `provideShopping`. */
  function bootstrap(seed: (doc: Y.Doc) => void = () => undefined): Store {
    doc = new Y.Doc({ gc: true });
    seed(doc);

    TestBed.configureTestingModule({
      providers: [
        provideTestI18n(),
        provideStore(),
        {
          provide: YDocService,
          useValue: {
            snapshot$: snapshots,
            deviceName: 'Téléphone d’Evan',
            deviceId: 'device-A',
            transact: (mutate: (d: Y.Doc) => void) => mutate(doc),
          },
        },
        { provide: SyncRegistry, useClass: FauxRegistre },
        // Les effects de maintenance injectent le stockage des photos, qui
        // ouvrirait IndexedDB — absent de jsdom.
        { provide: BlobService, useValue: { collectGarbage: () => undefined } },
        provideShopping(),
      ],
    });

    // Injecter finalise le module de test, ce qui joue les initialiseurs.
    return TestBed.inject(Store);
  }

  it('crée la liste par défaut sous un nom traduit', () => {
    bootstrap();

    expect(readSnapshot(doc).lists[DEFAULT_LIST_ID].name).toBe('Nos courses');
  });

  it('garde le nom d’une liste déjà créée ailleurs', () => {
    // C'est ce qui permet d'amorcer *avant* de brancher la synchronisation :
    // `ensureList` est idempotent, donc un document arrivé d'IndexedDB ou de
    // GitHub garde le nom que le foyer a choisi.
    bootstrap((d) => ensureList(d, DEFAULT_LIST_ID, 'Chez Mamie', NOW));

    expect(readSnapshot(doc).lists[DEFAULT_LIST_ID].name).toBe('Chez Mamie');
  });

  it('branche la synchronisation', () => {
    bootstrap();

    expect(registries).toBe(1);
  });

  it('reflète dans le store chaque photographie du document', async () => {
    // De bout en bout : la tranche est enregistrée, l'effect de projection est
    // branché, et rien d'autre n'a besoin d'être appelé pour peupler l'état.
    const store = bootstrap();
    expect(await firstValueFrom(store.select(selectLoaded))).toBe(false);

    snapshots.next(readSnapshot(doc));

    expect(await firstValueFrom(store.select(selectListName))).toBe(
      'Nos courses',
    );
    expect(await firstValueFrom(store.select(selectLoaded))).toBe(true);
  });
});
