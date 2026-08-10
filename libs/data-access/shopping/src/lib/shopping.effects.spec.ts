import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import {
  archiveProduct,
  CrdtSnapshot,
  createProduct,
  ensureList,
  ImageCredit,
  ListItem,
  Product,
  ProductId,
  readSnapshot,
  YDocService,
} from '@shopping-list/core/crdt';
import { ImageBankSettings } from '@shopping-list/core/image-bank';
import { Observable, Subject } from 'rxjs';
import * as Y from 'yjs';

import { AdoptedImage, ProductBankImages } from './product-bank-images.service';
import { catalogActions, crdtActions, listActions } from './shopping.actions';
import {
  createAndAddProduct,
  projectSnapshot,
  proposeBankImage,
  writeCatalogIntents,
  writeListIntents,
} from './shopping.effects';
import { DEFAULT_LIST_ID } from './shopping.feature';

const NOW = 1_764_000_000_000;
const LIST_NAME = 'Nos courses';
const DEVICE_NAME = 'Téléphone d’Evan';
const DEVICE_ID = 'device-A';

const CREDIT: ImageCredit = {
  title: 'Avocado Growing Project',
  author: 'skyseeker',
  license: 'CC BY 2.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
  sourceUrl: 'https://www.flickr.com/photos/40422902@N00/20207342',
};

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

    it('ajoute avec un compte, et l’incrémente sur un doublon', () => {
      // C'est le ＋2 de la dictée : un nombre est un compte à ajouter, pas une
      // quantité à poser — redicter le même article l'incrémente.
      run(writeListIntents);
      const yaourt = createProduct(doc, { label: 'Yaourt' }, NOW);

      actions.next(listActions.produitAjouté({ productId: yaourt, qty: 4 }));
      expect(itemFor(yaourt).qty).toBe('4');

      actions.next(listActions.produitAjouté({ productId: yaourt, qty: 2 }));
      expect(itemFor(yaourt).qty).toBe('6');
    });

    it('pose une quantité libre quand on ajoute avec une chaîne', () => {
      run(writeListIntents);
      const tomates = createProduct(doc, { label: 'Tomates' }, NOW);

      actions.next(
        listActions.produitAjouté({ productId: tomates, qty: '500 g' }),
      );

      expect(itemFor(tomates).qty).toBe('500 g');
    });

    it('laisse passer les intentions qui ne le concernent pas', () => {
      // Sans le filtrage par type, la branche par défaut du switch — « vider la
      // liste » — s'appliquerait à n'importe quelle action traversant le store.
      run(writeListIntents);
      const lait = addToList('Lait');

      actions.next(catalogActions.produitArchivé({ productId: lait }));

      expect(itemFor(lait).removedAt).toBeNull();
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

    it('enregistre l’ordre des rayons choisi', () => {
      run(writeListIntents);

      actions.next(
        listActions.rayonsRéordonnés({ order: ['cave', 'boulangerie'] }),
      );

      expect(readSnapshot(doc).lists[DEFAULT_LIST_ID].aisleOrder).toEqual([
        'cave',
        'boulangerie',
      ]);
    });
  });

  describe('createAndAddProduct', () => {
    it('crée le produit et l’ajoute d’un seul geste', () => {
      // C'est ce geste unique qui alimente l'historique réutilisable : sans la
      // création, rien ne serait proposé la semaine suivante.
      run(createAndAddProduct);

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

    it('pose la quantité sur la ligne qu’il crée', () => {
      // Dicter « quatre yaourts » sur un article encore inconnu doit créer la
      // ligne avec son compte, pas repartir à un.
      run(createAndAddProduct);

      actions.next(
        listActions.produitCrééEtAjouté({ draft: { label: 'Yaourt' }, qty: 4 }),
      );

      expect(items()[0].qty).toBe('4');
    });

    it('devine le rayon sur le libellé et la description réunis', () => {
      // « Pain » seul proposerait la baguette : c'est la description qui fait
      // reconnaître le mot-clé complet, donc le bon emoji.
      run(createAndAddProduct);

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
      run(createAndAddProduct);

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

    it('annonce l’identifiant tout neuf et l’emoji trouvé', () => {
      // C'est le seul endroit où les deux se tiennent ensemble : plus tard, il
      // faudrait retrouver le produit par son libellé — donc désigner le mauvais
      // dès qu'on ajoute deux fois le même nom.
      const emitted = run(createAndAddProduct);

      actions.next(
        listActions.produitCrééEtAjouté({ draft: { label: 'Lait' } }),
      );

      expect(emitted).toEqual([
        listActions.produitCréé({
          productId: catalog()[0].id,
          label: 'Lait',
          emojiFound: true,
        }),
      ]);
    });

    it('avoue n’avoir reconnu aucun emoji', () => {
      // C'est ce constat qui déclenchera la recherche dans la banque d'images.
      const emitted = run(createAndAddProduct);

      actions.next(
        listActions.produitCrééEtAjouté({
          draft: { label: 'Cadeau anniversaire mamie' },
        }),
      );

      expect(emitted).toMatchObject([{ emojiFound: false }]);
    });

    it('ne réclame pas d’image quand une a déjà été choisie', () => {
      // Un choix explicite ne doit pas se faire écraser par une proposition
      // automatique, même si le libellé n'est pas reconnu.
      const emitted = run(createAndAddProduct);

      actions.next(
        listActions.produitCrééEtAjouté({
          draft: { label: 'Cadeau mamie', imageRef: 'emoji:🎁' },
        }),
      );

      expect(emitted).toMatchObject([{ emojiFound: true }]);
    });

    it('ne réclame pas d’image quand le rayon a été choisi à la main', () => {
      // Ranger un article soi-même, c'est déjà en avoir décidé l'emoji.
      const emitted = run(createAndAddProduct);

      actions.next(
        listActions.produitCrééEtAjouté({
          draft: { label: 'Cadeau mamie', category: 'divers' },
        }),
      );

      expect(emitted).toMatchObject([{ emojiFound: true }]);
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

    it('attache l’image de banque, la mémorise et la crédite d’un coup', () => {
      // Les trois ensemble dans la même transaction : un crédit qui arriverait
      // dans un second delta laisserait l'autre appareil afficher l'image sans
      // savoir à qui elle est.
      run(writeCatalogIntents);
      const productId = createProduct(doc, { label: 'Avocat' }, NOW);

      actions.next(
        catalogActions.imageDeBanqueChoisie({
          productId,
          imageRef: 'blob:a3f9c2',
          credit: CREDIT,
        }),
      );

      expect(catalog()[0]).toMatchObject({
        imageRef: 'blob:a3f9c2',
        bankImageRef: 'blob:a3f9c2',
      });
      expect(readSnapshot(doc).credits).toEqual({ a3f9c2: CREDIT });
    });

    it('retire l’image de banque de l’affichage sans l’oublier', () => {
      // C'est ce qui rend le retrait réversible : l'image reste mémorisée, et
      // « remettre » n'aura rien à redemander au réseau.
      run(writeCatalogIntents);
      const productId = createProduct(doc, { label: 'Avocat' }, NOW);
      actions.next(
        catalogActions.imageDeBanqueChoisie({
          productId,
          imageRef: 'blob:a3f9c2',
          credit: CREDIT,
        }),
      );

      actions.next(
        catalogActions.imageModifiée({ productId, imageRef: 'emoji:🛒' }),
      );

      expect(catalog()[0]).toMatchObject({
        imageRef: 'emoji:🛒',
        bankImageRef: 'blob:a3f9c2',
      });
    });

    it('n’écrit pas de crédit pour une image qui n’est pas un blob', () => {
      // Un emoji n'a pas d'empreinte, donc rien à créditer. La garde protège un
      // invariant, pas un cas d'usage.
      run(writeCatalogIntents);
      const productId = createProduct(doc, { label: 'Avocat' }, NOW);

      actions.next(
        catalogActions.imageDeBanqueChoisie({
          productId,
          imageRef: 'emoji:🥑',
          credit: CREDIT,
        }),
      );

      expect(readSnapshot(doc).credits).toEqual({});
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

  describe('proposeBankImage', () => {
    /**
     * La banque de papier. `réponse` décide de ce que rend `propose` : une image
     * adoptée, rien du tout, ou une erreur — les trois cas qui arrivent en vrai.
     */
    class FausseBanque {
      demandes: string[] = [];
      réponse: AdoptedImage | null | Error = {
        imageRef: 'blob:a3f9c2',
        credit: CREDIT,
      };

      propose(label: string): Promise<AdoptedImage | null> {
        this.demandes.push(label);
        return this.réponse instanceof Error
          ? Promise.reject(this.réponse)
          : Promise.resolve(this.réponse);
      }
    }

    let banque: FausseBanque;
    let auto: WritableSignal<boolean>;

    beforeEach(() => {
      banque = new FausseBanque();
      auto = signal(true);

      TestBed.configureTestingModule({
        providers: [
          { provide: Actions, useValue: actions },
          { provide: ProductBankImages, useValue: banque },
          { provide: ImageBankSettings, useValue: { auto } },
        ],
      });
    });

    const créé = (label: string, emojiFound: boolean) =>
      listActions.produitCréé({ productId: 'p1', label, emojiFound });

    it('attache l’image trouvée au produit qui n’avait pas d’emoji', async () => {
      const emitted = run(proposeBankImage);

      actions.next(créé('Cadeau anniversaire mamie', false));
      await vi.waitFor(() => expect(emitted).toHaveLength(1));

      expect(banque.demandes).toEqual(['Cadeau anniversaire mamie']);
      expect(emitted[0]).toEqual(
        catalogActions.imageDeBanqueChoisie({
          productId: 'p1',
          imageRef: 'blob:a3f9c2',
          credit: CREDIT,
        }),
      );
    });

    it('ne cherche rien quand un emoji a reconnu le libellé', async () => {
      // L'emoji du rayon décrit déjà le produit : aller chercher une image
      // serait un appel sortant pour rien.
      const emitted = run(proposeBankImage);

      actions.next(créé('Lait', true));
      await Promise.resolve();

      expect(banque.demandes).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it('se tait quand le réglage d’appareil est éteint', async () => {
      auto.set(false);
      const emitted = run(proposeBankImage);

      actions.next(créé('Cadeau mamie', false));
      await Promise.resolve();

      expect(banque.demandes).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it('relit le réglage à chaque article, pas une fois pour toutes', async () => {
      // Couper l'automatisme au milieu des courses doit prendre effet tout de
      // suite, sans recharger l'application.
      const emitted = run(proposeBankImage);

      auto.set(false);
      actions.next(créé('Cadeau mamie', false));
      auto.set(true);
      actions.next(créé('Bougie parfumée', false));
      await vi.waitFor(() => expect(emitted).toHaveLength(1));

      expect(banque.demandes).toEqual(['Bougie parfumée']);
    });

    it('n’émet rien quand la banque ne trouve pas d’image', async () => {
      banque.réponse = null;
      const emitted = run(proposeBankImage);

      actions.next(créé('Cadeau mamie', false));
      await Promise.resolve();
      await Promise.resolve();

      expect(emitted).toEqual([]);
    });

    it('encaisse une banque en panne sans se désabonner', async () => {
      // Sans `catchError`, la première coupure réseau tuerait l'effect pour
      // toute la session : plus aucun article suivant ne recevrait d'image.
      banque.réponse = new Error('503');
      const emitted = run(proposeBankImage);

      actions.next(créé('Cadeau mamie', false));
      await vi.waitFor(() => expect(banque.demandes).toHaveLength(1));

      banque.réponse = { imageRef: 'blob:b7e401', credit: CREDIT };
      actions.next(créé('Bougie parfumée', false));
      await vi.waitFor(() => expect(emitted).toHaveLength(1));

      expect(emitted).toMatchObject([{ imageRef: 'blob:b7e401' }]);
    });
  });
});
