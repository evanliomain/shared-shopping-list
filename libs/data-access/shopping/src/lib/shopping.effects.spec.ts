import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import {
  archiveProduct,
  CrdtSnapshot,
  createProduct,
  ensureList,
  ListItem,
  Product,
  ProductId,
  readSnapshot,
  YDocService,
} from '@shopping-list/core/crdt';
import { Observable, Subject } from 'rxjs';
import * as Y from 'yjs';

import { catalogActions, crdtActions, listActions } from './shopping.actions';
import {
  projectSnapshot,
  writeCatalogIntents,
  writeListIntents,
} from './shopping.effects';
import { DEFAULT_LIST_ID } from './shopping.feature';

const NOW = 1_764_000_000_000;
const LIST_NAME = 'Nos courses';
const DEVICE_NAME = 'Téléphone d’Evan';
const DEVICE_ID = 'device-A';

/** Un effect fonctionnel est une fabrique : l'appeler rend son observable. */
type FunctionalEffect = unknown;

describe('effects de la tranche « courses »', () => {
  let doc: Y.Doc;
  let actions: Subject<Action>;
  let snapshots: Subject<CrdtSnapshot>;

  beforeEach(() => {
    // Les effects horodatent avec `Date.now()` : une horloge figée rend les
    // dates écrites dans le document vérifiables.
    vi.useFakeTimers({ now: NOW });

    doc = new Y.Doc({ gc: true });
    ensureList(doc, DEFAULT_LIST_ID, LIST_NAME, NOW);

    actions = new Subject<Action>();
    snapshots = new Subject<CrdtSnapshot>();

    TestBed.configureTestingModule({
      providers: [
        { provide: Actions, useValue: actions },
        {
          provide: YDocService,
          useValue: {
            snapshot$: snapshots,
            deviceName: DEVICE_NAME,
            deviceId: DEVICE_ID,
            transact: (mutate: (d: Y.Doc) => void) => mutate(doc),
          },
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  /** @returns tout ce que l'effect a émis, dans l'ordre. */
  function run(effect: FunctionalEffect): unknown[] {
    const emitted: unknown[] = [];
    TestBed.runInInjectionContext(() =>
      (effect as () => Observable<unknown>)().subscribe((value) =>
        emitted.push(value),
      ),
    );
    return emitted;
  }

  function items(): ListItem[] {
    return Object.values(readSnapshot(doc).lists[DEFAULT_LIST_ID].items);
  }

  function catalog(): Product[] {
    return Object.values(readSnapshot(doc).catalog);
  }

  function itemFor(productId: ProductId): ListItem {
    const found = items().find((item) => item.productId === productId);
    if (undefined === found) {
      throw new Error(`Aucune ligne pour ${productId}`);
    }
    return found;
  }

  /** Met un produit dans la liste par le chemin normal : l'intention. */
  function addToList(label: string): ProductId {
    const productId = createProduct(doc, { label }, NOW);
    actions.next(listActions.produitAjouté({ productId }));
    return productId;
  }

  describe('projectSnapshot', () => {
    it('annonce au store chaque nouvelle photographie du document', () => {
      const emitted = run(projectSnapshot);
      const snapshot = readSnapshot(doc);

      snapshots.next(snapshot);

      expect(emitted).toEqual([crdtActions.snapshotProduit({ snapshot })]);
    });

    it('ne distingue pas un changement local d’un changement distant', () => {
      // Les deux emprunteront ce même chemin : il n'y a qu'un producteur d'état,
      // et c'est ce qui rend le flux unidirectionnel.
      const emitted = run(projectSnapshot);

      snapshots.next(readSnapshot(doc));
      createProduct(doc, { label: 'Lait' }, NOW);
      snapshots.next(readSnapshot(doc));

      expect(emitted).toHaveLength(2);
      expect(
        (emitted[1] as ReturnType<typeof crdtActions.snapshotProduit>).snapshot
          .catalog,
      ).not.toEqual({});
    });
  });

  describe('writeListIntents', () => {
    it('met un produit du catalogue dans la liste, signé de l’appareil', () => {
      run(writeListIntents);
      const lait = addToList('Lait');

      expect(itemFor(lait)).toMatchObject({
        addedBy: DEVICE_NAME,
        createdAt: NOW,
        checked: false,
        removedAt: null,
      });
    });

    it('laisse passer les intentions qui ne le concernent pas', () => {
      // Sans le filtrage par type, la branche par défaut du switch — « vider la
      // liste » — s'appliquerait à n'importe quelle action traversant le store.
      run(writeListIntents);
      const lait = addToList('Lait');

      actions.next(catalogActions.produitArchivé({ productId: lait }));

      expect(itemFor(lait).removedAt).toBeNull();
    });

    it('crée le produit et l’ajoute d’un seul geste', () => {
      // C'est ce geste unique qui alimente l'historique réutilisable : sans la
      // création, rien ne serait proposé la semaine suivante.
      run(writeListIntents);

      actions.next(
        listActions.produitCrééEtAjouté({ draft: { label: 'Lait' } }),
      );

      expect(catalog()).toMatchObject([
        {
          label: 'Lait',
          description: '',
          category: 'cremerie',
          imageRef: 'emoji:🥛',
        },
      ]);
      expect(items()).toHaveLength(1);
      expect(items()[0].productId).toBe(catalog()[0].id);
    });

    it('devine le rayon sur le libellé et la description réunis', () => {
      // « Pain » seul proposerait la baguette : c'est la description qui fait
      // reconnaître le mot-clé complet, donc le bon emoji.
      run(writeListIntents);

      actions.next(
        listActions.produitCrééEtAjouté({
          draft: { label: 'Pain', description: 'au chocolat' },
        }),
      );

      expect(catalog()).toMatchObject([
        { category: 'boulangerie', imageRef: 'emoji:🥐' },
      ]);
    });

    it('respecte le rayon et l’image choisis à la main', () => {
      // La proposition n'est qu'une proposition : un choix explicite l'emporte,
      // sinon corriger un rangement ne servirait à rien.
      run(writeListIntents);

      actions.next(
        listActions.produitCrééEtAjouté({
          draft: {
            label: 'Lait',
            category: 'divers',
            imageRef: 'emoji:🎁',
          },
        }),
      );

      expect(catalog()).toMatchObject([
        { category: 'divers', imageRef: 'emoji:🎁' },
      ]);
    });

    it('coche et décoche un article', () => {
      run(writeListIntents);
      const lait = addToList('Lait');
      const itemId = itemFor(lait).id;

      actions.next(listActions.articleCoché({ itemId, checked: true }));
      expect(itemFor(lait).checked).toBe(true);

      actions.next(listActions.articleCoché({ itemId, checked: false }));
      expect(itemFor(lait).checked).toBe(false);
    });

    it('retire un article en posant un tombstone, puis le restaure', () => {
      // Retirer n'efface pas : c'est ce qui rend l'annulation possible et ce qui
      // reste réconciliable face à une édition concurrente.
      run(writeListIntents);
      const lait = addToList('Lait');
      const itemId = itemFor(lait).id;

      actions.next(listActions.articleRetiré({ itemId }));
      expect(itemFor(lait).removedAt).toBe(NOW);

      actions.next(listActions.articleRestauré({ itemId }));
      expect(itemFor(lait).removedAt).toBeNull();
    });

    it('modifie la quantité d’une ligne', () => {
      run(writeListIntents);
      const lait = addToList('Lait');
      const itemId = itemFor(lait).id;

      actions.next(listActions.quantitéModifiée({ itemId, qty: '2 L' }));
      expect(itemFor(lait).qty).toBe('2 L');

      actions.next(listActions.quantitéModifiée({ itemId, qty: null }));
      expect(itemFor(lait).qty).toBeNull();
    });

    it('modifie la note d’une ligne', () => {
      run(writeListIntents);
      const lait = addToList('Lait');
      const itemId = itemFor(lait).id;

      actions.next(listActions.noteModifiée({ itemId, note: 'demi-écrémé' }));
      expect(itemFor(lait).note).toBe('demi-écrémé');

      actions.next(listActions.noteModifiée({ itemId, note: null }));
      expect(itemFor(lait).note).toBeNull();
    });

    it('ne vide que les articles cochés', () => {
      run(writeListIntents);
      const lait = addToList('Lait');
      const pain = addToList('Pain');
      actions.next(
        listActions.articleCoché({ itemId: itemFor(lait).id, checked: true }),
      );

      actions.next(listActions.articlesCochésVidés());

      expect(itemFor(lait).removedAt).toBe(NOW);
      expect(itemFor(pain).removedAt).toBeNull();
    });

    it('vide la liste sans rien oublier du catalogue', () => {
      // C'est toute la différence avec l'historique : recommencer une liste ne
      // doit pas faire perdre ce qu'on achète d'habitude.
      run(writeListIntents);
      addToList('Lait');
      addToList('Pain');

      actions.next(listActions.listeVidée());

      expect(items().map((item) => item.removedAt)).toEqual([NOW, NOW]);
      expect(catalog()).toHaveLength(2);
    });
  });

  describe('writeCatalogIntents', () => {
    it('applique une correction de fiche', () => {
      run(writeCatalogIntents);
      const productId = createProduct(doc, { label: 'Lait' }, NOW);

      actions.next(
        catalogActions.produitModifié({
          productId,
          patch: { label: 'Lait entier', defaultQty: '2 L' },
        }),
      );

      expect(catalog()).toMatchObject([
        { label: 'Lait entier', defaultQty: '2 L' },
      ]);
    });

    it('remplace l’image d’un produit', () => {
      run(writeCatalogIntents);
      const productId = createProduct(doc, { label: 'Lait' }, NOW);

      actions.next(
        catalogActions.imageModifiée({ productId, imageRef: 'blob:aaaa' }),
      );

      expect(catalog()[0].imageRef).toBe('blob:aaaa');
    });

    it('archive puis désarchive sans rien perdre de l’usage', () => {
      run(writeCatalogIntents);
      const productId = createProduct(doc, { label: 'Bougie' }, NOW);

      actions.next(catalogActions.produitArchivé({ productId }));
      expect(catalog()[0].archivedAt).toBe(NOW);

      actions.next(catalogActions.produitDésarchivé({ productId }));
      expect(catalog()[0].archivedAt).toBeNull();
    });

    it('laisse passer les intentions qui ne le concernent pas', () => {
      // Sans le filtrage par type, la branche par défaut du switch —
      // « désarchiver » — s'appliquerait à n'importe quelle action.
      run(writeCatalogIntents);
      const productId = createProduct(doc, { label: 'Bougie' }, NOW);
      archiveProduct(doc, productId, NOW);

      actions.next(listActions.produitAjouté({ productId }));

      expect(catalog()[0].archivedAt).toBe(NOW);
    });
  });
});
