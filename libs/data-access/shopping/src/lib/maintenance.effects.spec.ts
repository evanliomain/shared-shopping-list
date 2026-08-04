import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { BlobService } from '@shopping-list/core/blobs';
import {
  addItem,
  createProduct,
  DEFAULT_PURGE_AFTER_MS,
  ensureList,
  Product,
  ProductId,
  readSnapshot,
  removeItem,
  YDocService,
} from '@shopping-list/core/crdt';
import { BehaviorSubject, Observable } from 'rxjs';
import * as Y from 'yjs';

import {
  collectOrphanBlobs,
  purgeExpiredTombstones,
} from './maintenance.effects';
import {
  DEFAULT_LIST_ID,
  selectCatalog,
  selectLoaded,
} from './shopping.feature';

const MAINTENANCE_DELAY_MS = 5000;

function product(
  id: string,
  imageRef: Product['imageRef'],
  bankImageRef: Product['bankImageRef'] = null,
): Product {
  return {
    id: id as ProductId,
    label: id,
    description: '',
    defaultQty: '',
    category: 'cremerie',
    imageRef,
    bankImageRef,
    usage: {},
    lastUsedAt: 0,
    archivedAt: null,
  };
}

function catalogOf(...products: Product[]): Record<ProductId, Product> {
  return Object.fromEntries(products.map((p) => [p.id, p]));
}

/** Un effect fonctionnel est une fabrique : l'appeler rend son observable. */
type FunctionalEffect = unknown;

describe('effects de maintenance', () => {
  let loaded: BehaviorSubject<boolean>;
  let catalog: BehaviorSubject<Record<ProductId, Product>>;
  let collected: ReadonlySet<string>[];
  let doc: Y.Doc;

  beforeEach(() => {
    vi.useFakeTimers();

    loaded = new BehaviorSubject(false);
    catalog = new BehaviorSubject<Record<ProductId, Product>>({});
    collected = [];
    doc = new Y.Doc({ gc: true });

    // Faux store : les effects ne lisent que ces deux selectors, et un vrai
    // store demanderait d'amorcer tout le CRDT pour ne rien vérifier de plus.
    const store = {
      select: (selector: unknown): Observable<unknown> =>
        selector === selectLoaded ? loaded : catalog,
    };

    const blobs = {
      collectGarbage: (reachable: ReadonlySet<string>): Promise<number> => {
        collected.push(reachable);
        return Promise.resolve(0);
      },
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: BlobService, useValue: blobs },
        {
          provide: YDocService,
          useValue: { transact: (fn: (d: Y.Doc) => void) => fn(doc) },
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  function run(effect: FunctionalEffect): void {
    TestBed.runInInjectionContext(() =>
      (effect as () => Observable<unknown>)().subscribe(),
    );
  }

  describe('collectOrphanBlobs', () => {
    it('ne touche à rien tant que le catalogue n’est pas chargé', () => {
      // Le garde-fou essentiel : avant le premier snapshot le catalogue est
      // vide, et un ménage lancé là effacerait *toutes* les photos.
      catalog.next(catalogOf(product('p1', 'blob:aaaa')));

      run(collectOrphanBlobs);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS * 10);

      expect(collected).toEqual([]);
    });

    it('ne touche à rien si le catalogue chargé est vide', () => {
      run(collectOrphanBlobs);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

      expect(collected).toEqual([]);
    });

    it('attend son délai avant de faire le ménage', () => {
      catalog.next(catalogOf(product('p1', 'blob:aaaa')));

      run(collectOrphanBlobs);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS - 1);
      expect(collected).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(collected).toHaveLength(1);
    });

    it('ne retient que les empreintes de photos, pas les emoji', () => {
      catalog.next(
        catalogOf(
          product('avec-photo', 'blob:aaaa'),
          product('avec-emoji', 'emoji:🍦'),
          product('sans-rien', null),
        ),
      );

      run(collectOrphanBlobs);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

      expect([...collected[0]]).toEqual(['aaaa']);
    });

    it('garde l’image de banque qu’on a retirée de l’affichage', () => {
      // Elle n'est pas affichée — c'est tout son intérêt — mais on doit pouvoir
      // la remettre. L'effacer ferait que « remettre l'image » rendrait un cadre
      // vide, une semaine après le retrait et sans que rien ne l'annonce.
      catalog.next(catalogOf(product('retirée', 'emoji:🛒', 'blob:cccc')));

      run(collectOrphanBlobs);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

      expect([...collected[0]]).toEqual(['cccc']);
    });

    it('garde les deux images d’un produit qui a photo et image de banque', () => {
      catalog.next(catalogOf(product('les-deux', 'blob:aaaa', 'blob:cccc')));

      run(collectOrphanBlobs);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

      expect([...collected[0]].sort()).toEqual(['aaaa', 'cccc']);
    });

    it('garde la photo d’un produit archivé', () => {
      // Le désarchivage doit rétablir la fiche avec son image : le ménage lit
      // le catalogue brut, pas les vues qui masquent les archives.
      catalog.next(
        catalogOf({ ...product('archivé', 'blob:bbbb'), archivedAt: 1 }),
      );

      run(collectOrphanBlobs);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

      expect([...collected[0]]).toEqual(['bbbb']);
    });

    it('ne fait qu’une passe par session', () => {
      catalog.next(catalogOf(product('p1', 'blob:aaaa')));

      run(collectOrphanBlobs);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);
      loaded.next(false);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS * 10);

      expect(collected).toHaveLength(1);
    });
  });

  describe('purgeExpiredTombstones', () => {
    /** @returns l'identifiant de la ligne retirée il y a plus de trente jours */
    function docWithAnExpiredTombstone(): string {
      const now = Date.now();
      ensureList(doc, DEFAULT_LIST_ID, 'Maison', now);
      const lait = createProduct(doc, { label: 'Lait' }, now);
      const itemId = addItem(doc, {
        listId: DEFAULT_LIST_ID,
        productId: lait,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now,
      });
      removeItem(
        doc,
        DEFAULT_LIST_ID,
        itemId,
        now - DEFAULT_PURGE_AFTER_MS - 1,
      );

      return itemId;
    }

    function itemsOf(): string[] {
      return Object.keys(readSnapshot(doc).lists[DEFAULT_LIST_ID]?.items ?? {});
    }

    it('efface une ligne retirée depuis assez longtemps', () => {
      const itemId = docWithAnExpiredTombstone();
      expect(itemsOf()).toContain(itemId);

      run(purgeExpiredTombstones);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

      expect(itemsOf()).not.toContain(itemId);
    });

    it('ne purge rien tant que le document n’est pas chargé', () => {
      const itemId = docWithAnExpiredTombstone();

      run(purgeExpiredTombstones);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS * 10);

      expect(itemsOf()).toContain(itemId);
    });

    it('laisse le catalogue tranquille', () => {
      // C'est l'historique : c'est précisément ce qu'on veut conserver.
      docWithAnExpiredTombstone();

      run(purgeExpiredTombstones);
      loaded.next(true);
      vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

      expect(Object.keys(readSnapshot(doc).catalog)).toHaveLength(1);
    });
  });
});
