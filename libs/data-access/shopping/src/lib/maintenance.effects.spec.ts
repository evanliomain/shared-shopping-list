import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { BlobService } from '@shopping-list/core/blobs';
import { Product, ProductId } from '@shopping-list/core/crdt';
import { BehaviorSubject, Observable } from 'rxjs';

import { collectOrphanBlobs } from './maintenance.effects';
import { selectCatalog, selectLoaded } from './shopping.feature';

const MAINTENANCE_DELAY_MS = 5000;

function product(id: string, imageRef: Product['imageRef']): Product {
  return {
    id: id as ProductId,
    label: id,
    description: '',
    defaultQty: '',
    category: 'cremerie',
    imageRef,
    usage: {},
    lastUsedAt: 0,
    archivedAt: null,
  };
}

function catalogOf(...products: Product[]): Record<ProductId, Product> {
  return Object.fromEntries(products.map((p) => [p.id, p]));
}

describe('collectOrphanBlobs', () => {
  let loaded: BehaviorSubject<boolean>;
  let catalog: BehaviorSubject<Record<ProductId, Product>>;
  let collected: ReadonlySet<string>[];

  beforeEach(() => {
    vi.useFakeTimers();

    loaded = new BehaviorSubject(false);
    catalog = new BehaviorSubject<Record<ProductId, Product>>({});
    collected = [];

    // Faux store : l'effect ne lit que ces deux selectors, et un vrai store
    // demanderait d'amorcer tout le CRDT pour ne rien vérifier de plus.
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
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  function run(): void {
    TestBed.runInInjectionContext(() =>
      (
        collectOrphanBlobs as unknown as () => Observable<unknown>
      )().subscribe(),
    );
  }

  it('ne touche à rien tant que le catalogue n’est pas chargé', () => {
    // Le garde-fou essentiel : avant le premier snapshot le catalogue est
    // vide, et un ménage lancé là effacerait *toutes* les photos.
    catalog.next(catalogOf(product('p1', 'blob:aaaa')));

    run();
    vi.advanceTimersByTime(MAINTENANCE_DELAY_MS * 10);

    expect(collected).toEqual([]);
  });

  it('ne touche à rien si le catalogue chargé est vide', () => {
    run();
    loaded.next(true);
    vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

    expect(collected).toEqual([]);
  });

  it('attend son délai avant de faire le ménage', () => {
    catalog.next(catalogOf(product('p1', 'blob:aaaa')));

    run();
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

    run();
    loaded.next(true);
    vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

    expect([...collected[0]]).toEqual(['aaaa']);
  });

  it('garde la photo d’un produit archivé', () => {
    // Le désarchivage doit rétablir la fiche avec son image : le ménage lit le
    // catalogue brut, pas les vues qui masquent les archives.
    catalog.next(
      catalogOf({ ...product('archivé', 'blob:bbbb'), archivedAt: 1 }),
    );

    run();
    loaded.next(true);
    vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);

    expect([...collected[0]]).toEqual(['bbbb']);
  });

  it('ne fait qu’une passe par session', () => {
    catalog.next(catalogOf(product('p1', 'blob:aaaa')));

    run();
    loaded.next(true);
    vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);
    loaded.next(false);
    loaded.next(true);
    vi.advanceTimersByTime(MAINTENANCE_DELAY_MS * 10);

    expect(collected).toHaveLength(1);
  });
});
