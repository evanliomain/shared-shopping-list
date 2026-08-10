import { provideLocationMocks } from '@angular/common/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Action, provideStore, Store } from '@ngrx/store';
import {
  addItem,
  createProduct,
  ensureList,
  ItemId,
  ProductId,
  readSnapshot,
  setItemChecked,
  setItemQty,
} from '@shopping-list/core/crdt';
import { ProviderState, SyncRegistry } from '@shopping-list/core/sync';
import {
  crdtActions,
  DEFAULT_LIST_ID,
  ProductImages,
  shoppingFeature,
} from '@shopping-list/data-access/shopping';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';
import * as Y from 'yjs';

import { FakeProductImages } from '../testing/fake-product-images';
import { ListPage } from './list-page';

const NOW = 1_764_000_000_000;
const LIST_NAME = 'Courses de la semaine';
const PHOTO = 'blob:a3f9c2d1e8b47f05';

/** GitHub tel que le registre le rapporte, sans en-cours à publier. */
const GITHUB: ProviderState = {
  id: 'github',
  labelKey: 'sync.providers.github',
  status: 'live',
  lastError: null,
  pending: 0,
};

interface Options {
  /** Ce que les autres appareils ont déjà mis dans la liste. */
  readonly seed?: (doc: Y.Doc) => void;
  /** Aucun snapshot reçu : l'écran attend encore IndexedDB. */
  readonly loaded?: boolean;
  readonly sync?: readonly ProviderState[];
  /** Ce que répond `matchMedia` — `null` : une plate-forme qui l'ignore. */
  readonly wide?: boolean | null;
}

/**
 * Requête de média simulée : jsdom répond toujours « non » et ne rejoue jamais
 * de changement, alors que c'est justement le passage d'une largeur à l'autre
 * qui monte et démonte la colonne d'historique.
 */
function stubMatchMedia(wide: boolean | null) {
  const listeners: ((event: MediaQueryListEvent) => void)[] = [];

  if (null === wide) {
    vi.stubGlobal('matchMedia', undefined);
    return { listeners };
  }

  vi.stubGlobal('matchMedia', () => ({
    matches: wide,
    addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) =>
      listeners.push(listener),
    removeEventListener: (
      _: string,
      listener: (e: MediaQueryListEvent) => void,
    ) => {
      const index = listeners.indexOf(listener);
      if (-1 !== index) {
        listeners.splice(index, 1);
      }
    },
  }));

  return { listeners };
}

async function render(options: Options = {}) {
  // `null` est une valeur à part entière ici — la plate-forme sans `matchMedia`
  // — que `??` confondrait avec l'absence d'option.
  const media = stubMatchMedia(
    undefined === options.wide ? false : options.wide,
  );

  const doc = new Y.Doc({ gc: true });
  ensureList(doc, DEFAULT_LIST_ID, LIST_NAME, NOW);
  options.seed?.(doc);

  const images = new FakeProductImages();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      provideTestI18n(),
      provideStore({ [shoppingFeature.name]: shoppingFeature.reducer }),
      { provide: ProductImages, useValue: images },
      {
        provide: SyncRegistry,
        useValue: { states: signal(options.sync ?? []) },
      },
    ],
  });

  const store = TestBed.inject(Store);
  const publish = () =>
    store.dispatch(
      crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }),
    );

  if (false !== options.loaded) {
    publish();
  }

  // La page ne parle au CRDT que par des actions, toutes interceptées par des
  // effects : les recueillir suffit à savoir ce qu'elle a demandé.
  const dispatched: Action[] = [];
  const realDispatch = store.dispatch.bind(store);
  store.dispatch = ((action: Action) => dispatched.push(action)) as never;

  const fixture = TestBed.createComponent(ListPage);
  await fixture.whenStable();

  /** Rejoue ce que ferait l'effect : le Y.Doc change, l'état suit. */
  async function sync(mutate: (doc: Y.Doc) => void): Promise<void> {
    mutate(doc);
    realDispatch(crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }));
    await fixture.whenStable();
  }

  return { fixture, dispatched, images, media, sync };
}

function types(dispatched: readonly Action[]): string[] {
  return dispatched.map((action) => action.type);
}

function text(fixture: ComponentFixture<ListPage>): string {
  return (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
}

function rows(fixture: ComponentFixture<ListPage>): HTMLElement[] {
  return [...fixture.nativeElement.querySelectorAll('sl-item-row')];
}

/** La ligne d'un article donné : l'ordre des rayons n'est pas le sujet ici. */
function row(fixture: ComponentFixture<ListPage>, label: string): HTMLElement {
  const found = rows(fixture).find(
    (item) => item.querySelector('.label')?.textContent?.trim() === label,
  );
  if (undefined === found) {
    throw new Error(`Ligne introuvable : ${label}`);
  }

  return found;
}

/** Le texte du reçu d'une ligne de la dictée, espaces normalisés. */
function receipt(fixture: ComponentFixture<ListPage>): string | null {
  const found = fixture.nativeElement.querySelector('sl-dictation .receipt');
  return null === found
    ? null
    : (found.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Le mode dictée du téléphone : bouton flottant au repos, plein écran une fois
 * ouvert. Son attribut `data-open` dit lequel des deux.
 */
function dictation(fixture: ComponentFixture<ListPage>): HTMLElement {
  const found = fixture.nativeElement.querySelector('sl-dictation');
  if (null === found) {
    throw new Error('Mode dictée introuvable');
  }

  return found;
}

/** Les boutons ＋N de la rangée de validation, dans l'ordre. */
function counts(fixture: ComponentFixture<ListPage>): HTMLButtonElement[] {
  return [...fixture.nativeElement.querySelectorAll('sl-dictation .count')];
}

/** Le champ actif : le plein écran sur téléphone, la barre permanente au bureau. */
function field(fixture: ComponentFixture<ListPage>): HTMLInputElement {
  const found = fixture.nativeElement.querySelector(
    'sl-dictation input, sl-add-bar input',
  );
  if (null === found) {
    throw new Error('Champ de saisie introuvable');
  }

  return found;
}

async function click(
  fixture: ComponentFixture<ListPage>,
  selector: string,
): Promise<void> {
  const target = fixture.nativeElement.querySelector(selector);
  if (null === target) {
    throw new Error(`Cible introuvable : ${selector}`);
  }
  target.click();
  await fixture.whenStable();
}

/** Tape dans la barre d'ajout, comme le champ le fait à chaque lettre. */
async function type(
  fixture: ComponentFixture<ListPage>,
  query: string,
): Promise<void> {
  const input = field(fixture);
  input.value = query;
  input.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}

/**
 * Défile le corps de liste. jsdom ne fait aucune mise en page : `scrollTop` n'y
 * bouge jamais tout seul, il faut le déclarer.
 */
async function scroll(
  fixture: ComponentFixture<ListPage>,
  top: number,
): Promise<void> {
  const body = fixture.nativeElement.querySelector('main');
  Object.defineProperty(body, 'scrollTop', { value: top, configurable: true });
  body.dispatchEvent(new Event('scroll'));
  await fixture.whenStable();
}

/** Trois articles, dont un déjà dans le panier. */
function courses(doc: Y.Doc): Record<string, ItemId> {
  const items: Record<string, ItemId> = {};

  for (const [label, category] of [
    ['Lait', 'cremerie'],
    ['Yaourt', 'cremerie'],
    ['Pommes', 'fruits-legumes'],
  ] as const) {
    items[label] = put(doc, createProduct(doc, { label, category }, NOW));
  }

  return items;
}

function put(doc: Y.Doc, productId: ProductId, when = NOW): ItemId {
  return addItem(doc, {
    listId: DEFAULT_LIST_ID,
    productId,
    addedBy: 'Evan',
    deviceId: 'a',
    now: when,
  });
}

describe('ListPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('en-tête', () => {
    it('affiche le nom que porte le CRDT', async () => {
      const { fixture } = await render();

      expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
        LIST_NAME,
      );
    });

    it('tient un nom par défaut le temps qu’IndexedDB réponde', async () => {
      // Un titre vide serait pire qu'un nom provisoire, et le vrai arrive au
      // premier snapshot.
      const { fixture } = await render({ loaded: false });

      expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
        'Nos courses',
      );
      expect(text(fixture)).toContain('Chargement…');
    });

    it('dit ce qui reste et le chemin déjà parcouru', async () => {
      const { fixture } = await render({
        seed: (doc) => {
          const items = courses(doc);
          setItemChecked(doc, DEFAULT_LIST_ID, items['Lait'], true);
        },
      });

      expect(text(fixture)).toContain('2 restants sur 3');

      const bar = fixture.nativeElement.querySelector('[role="progressbar"]');
      expect(bar.getAttribute('aria-valuenow')).toBe('1');
      expect(bar.getAttribute('aria-valuemax')).toBe('3');
      expect(bar.querySelector('.progress-fill')).not.toBeNull();
    });

    it('annonce le panier plein plutôt que « 0 restants »', async () => {
      const { fixture } = await render({
        seed: (doc) => {
          const items = courses(doc);
          for (const id of Object.values(items)) {
            setItemChecked(doc, DEFAULT_LIST_ID, id, true);
          }
        },
      });

      expect(text(fixture)).toContain('Tout est dans le panier');
    });

    it('ne dessine aucune progression sur une liste vide', async () => {
      // Une barre pleine ou vide sur une liste sans article ne dit rien.
      const { fixture } = await render();

      expect(fixture.nativeElement.querySelector('.progress-fill')).toBeNull();
      expect(text(fixture)).toContain('La liste est vide');
    });

    it('offre le menu même à vide, mais sans proposer de vider', async () => {
      // On a le droit d'arranger le parcours avant d'ajouter quoi que ce soit ;
      // vider, en revanche, n'a rien à faire sur une liste déjà vide.
      const { fixture } = await render();

      expect(
        fixture.nativeElement.querySelector('sl-list-menu'),
      ).not.toBeNull();

      await click(fixture, 'sl-list-menu .toggle');
      expect(
        fixture.nativeElement.querySelector('sl-list-menu .danger'),
      ).toBeNull();
    });

    it('offre de vider dès qu’il y a un article', async () => {
      const { fixture } = await render({ seed: courses });

      await click(fixture, 'sl-list-menu .toggle');
      expect(
        fixture.nativeElement.querySelector('sl-list-menu .danger'),
      ).not.toBeNull();
    });
  });

  describe('pastille de synchronisation', () => {
    function badge(fixture: ComponentFixture<ListPage>): HTMLElement {
      return fixture.nativeElement.querySelector('sl-sync-badge');
    }

    it('dit « appareil seul » quand personne n’est appairé', async () => {
      // Rien n'est en panne : il n'y a simplement personne à qui parler.
      const { fixture } = await render();

      expect(badge(fixture).getAttribute('data-status')).toBe('unpaired');
      expect(badge(fixture).getAttribute('title')).toBe('Appareil seul');
    });

    it('dit « appareil seul » aussi quand GitHub n’a pas démarré', async () => {
      const { fixture } = await render({
        sync: [{ ...GITHUB, status: 'idle' }],
      });

      expect(badge(fixture).getAttribute('data-status')).toBe('unpaired');
    });

    it('reprend l’état de GitHub et ce qui attend d’être publié', async () => {
      // C'est la pastille qu'on regarde au fond d'un rayon quand le réseau ne
      // passe plus : ce qui rassure, c'est que rien n'est perdu.
      const { fixture } = await render({
        sync: [{ ...GITHUB, status: 'offline', pending: 3 }],
      });

      expect(badge(fixture).getAttribute('data-status')).toBe('offline');
      expect(badge(fixture).getAttribute('title')).toContain(
        '3 modifs gardées',
      );
    });

    it('n’invente pas d’attente pour un canal qui n’en compte pas', async () => {
      // `pending` est facultatif : un canal purement local n'a rien à mettre en
      // attente, et l'écran doit lire zéro plutôt que « Envoi… ».
      const sansAttente: ProviderState = {
        id: 'github',
        labelKey: GITHUB.labelKey,
        status: 'live',
        lastError: null,
      };
      const { fixture } = await render({ sync: [sansAttente] });

      expect(badge(fixture).getAttribute('title')).toBe('Synchronisé');
    });
  });

  describe('mode dictée', () => {
    it('ouvre le plein écran depuis la liste', async () => {
      const { fixture } = await render({ seed: courses });
      // Au repos, le bouton flottant : le plein écran attend qu'on l'ouvre.
      expect(dictation(fixture).getAttribute('data-open')).toBe('false');

      await click(fixture, 'sl-dictation');

      expect(dictation(fixture).getAttribute('data-open')).toBe('true');
    });

    it('ouvre la dictée depuis la liste vide, où l’ajout est l’écran', async () => {
      const { fixture } = await render();

      await click(fixture, '.empty-add button');

      expect(dictation(fixture).getAttribute('data-open')).toBe('true');
    });

    it('se retire vers l’avant de la liste et revient en remontant', async () => {
      // Lire sa liste ne se fait pas avec un bouton posé sur la dernière ligne.
      const { fixture } = await render({ seed: courses });
      const fab = dictation(fixture);
      expect(fab.getAttribute('data-retracted')).toBe('false');

      await scroll(fixture, 300);
      expect(fab.getAttribute('data-retracted')).toBe('true');

      await scroll(fixture, 0);
      expect(fab.getAttribute('data-retracted')).toBe('false');
    });
  });

  describe('cocher', () => {
    it('coche un article et laisse cinq secondes pour se reprendre', async () => {
      const { fixture, dispatched } = await render({ seed: courses });

      await click(fixture, `${'sl-item-row'} .check`);

      expect(dispatched).toEqual([
        expect.objectContaining({
          type: '[Liste] Article coché',
          checked: true,
        }),
      ]);
      expect(
        fixture.nativeElement.querySelector('.undo').textContent,
      ).toContain('dans le panier');
    });

    it('renvoie l’article dans la liste depuis le bandeau', async () => {
      const { fixture, dispatched } = await render({ seed: courses });
      await click(fixture, 'sl-item-row .check');

      await click(fixture, '.undo button');

      expect(dispatched.at(-1)).toEqual(
        expect.objectContaining({
          type: '[Liste] Article coché',
          checked: false,
        }),
      );
      expect(fixture.nativeElement.querySelector('.undo')).toBeNull();
    });

    it('n’annule qu’une fois, même sur un appui redoublé', async () => {
      // Le bandeau se retire de lui-même : un second appui, sur le bouton pas
      // encore effacé, ne doit pas décocher un autre article.
      const { fixture, dispatched } = await render({ seed: courses });
      await click(fixture, 'sl-item-row .check');

      const undo = fixture.nativeElement.querySelector('.undo button');
      undo.click();
      undo.click();
      await fixture.whenStable();

      expect(types(dispatched)).toEqual([
        '[Liste] Article coché',
        '[Liste] Article coché',
      ]);
    });

    it('n’ouvre aucun bandeau quand on décoche', async () => {
      // Décocher fait revenir la ligne : c'est déjà son propre retour arrière.
      const { fixture, dispatched } = await render({
        seed: (doc) => {
          const items = courses(doc);
          setItemChecked(doc, DEFAULT_LIST_ID, items['Lait'], true);
        },
      });

      await click(fixture, '.disclosure');
      await click(fixture, '.basket sl-item-row .check');

      expect(dispatched).toEqual([
        expect.objectContaining({
          type: '[Liste] Article coché',
          checked: false,
        }),
      ]);
      expect(fixture.nativeElement.querySelector('.undo')).toBeNull();
    });

    it('vide le panier sans toucher au reste de la liste', async () => {
      const { fixture, dispatched } = await render({
        seed: (doc) => {
          const items = courses(doc);
          setItemChecked(doc, DEFAULT_LIST_ID, items['Lait'], true);
        },
      });

      await click(fixture, '.clear');

      expect(types(dispatched)).toEqual(['[Liste] Articles cochés vidés']);
    });

    it('retire un article de la liste', async () => {
      const { fixture, dispatched } = await render({ seed: courses });

      row(fixture, 'Lait').querySelector<HTMLButtonElement>('.remove').click();
      await fixture.whenStable();

      expect(types(dispatched)).toEqual(['[Liste] Article retiré']);
    });
  });

  describe('vider la liste', () => {
    it('vide après confirmation, et referme le menu', async () => {
      const { fixture, dispatched } = await render({ seed: courses });

      await click(fixture, 'sl-list-menu .toggle');
      await click(fixture, 'sl-list-menu .danger');
      expect(types(dispatched)).toEqual([]);

      await click(fixture, 'sl-list-menu .danger');

      expect(types(dispatched)).toEqual(['[Liste] Liste vidée']);
      expect(
        fixture.nativeElement.querySelector('sl-list-menu .menu'),
      ).toBeNull();
    });
  });

  describe('ajouter en dictée', () => {
    /** L'identifiant d'un produit du catalogue, retrouvé par son libellé. */
    function idOf(doc: Y.Doc, label: string): ProductId {
      const found = Object.values(readSnapshot(doc).catalog).find(
        (product) => product.label === label,
      );
      if (undefined === found) {
        throw new Error(`Produit introuvable : ${label}`);
      }
      return found.id;
    }

    it('complète le champ sur un tap de suggestion, sans ajouter', async () => {
      // Un seul point de validation dans tout l'écran — la rangée du bas.
      const { fixture, dispatched } = await render({
        seed: (doc) => createProduct(doc, { label: 'Lait demi-écrémé' }, NOW),
      });
      await click(fixture, 'sl-dictation');
      await type(fixture, 'lai');

      await click(fixture, 'sl-dictation .suggestion');

      expect(dispatched).toEqual([]);
      expect(field(fixture).value).toBe('Lait demi-écrémé');
    });

    it('valide la première suggestion avec le compte du bouton', async () => {
      const { fixture, dispatched } = await render({
        seed: (doc) => createProduct(doc, { label: 'Yaourt' }, NOW),
      });
      await click(fixture, 'sl-dictation');
      await type(fixture, 'yao');

      counts(fixture)[2].click(); // ＋4
      await fixture.whenStable();

      expect(dispatched).toEqual([
        expect.objectContaining({ type: '[Liste] Produit ajouté', qty: 4 }),
      ]);
      // Le champ repart à vide, curseur en place : l'article suivant peut partir.
      expect(field(fixture).value).toBe('');
    });

    it('vaut ＋1 à la touche Entrée', async () => {
      const { fixture, dispatched } = await render({
        seed: (doc) => createProduct(doc, { label: 'Lait' }, NOW),
      });
      await click(fixture, 'sl-dictation');
      await type(fixture, 'lai');

      field(fixture).dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
      await fixture.whenStable();

      expect(dispatched).toEqual([
        expect.objectContaining({ type: '[Liste] Produit ajouté', qty: 1 }),
      ]);
    });

    it('crée le produit que l’historique ne connaît pas', async () => {
      const { fixture, dispatched } = await render();
      await click(fixture, '.empty-add button');

      await type(fixture, '  Rutabaga  ');
      counts(fixture)[0].click(); // ＋1
      await fixture.whenStable();

      expect(dispatched).toEqual([
        expect.objectContaining({
          type: '[Liste] Produit créé et ajouté',
          draft: { label: 'Rutabaga' },
          qty: 1,
        }),
      ]);
    });

    it('n’annonce pas de création pour ce que l’historique porte déjà', async () => {
      // Sinon on fabriquerait des doublons dans l'historique, ce qui ruinerait
      // précisément ce à quoi il sert.
      const { fixture } = await render({
        seed: (doc) => createProduct(doc, { label: 'Lait' }, NOW),
      });
      await click(fixture, 'sl-dictation');

      await type(fixture, 'Lait');

      expect(fixture.nativeElement.querySelector('sl-dictation .hint')).toBeNull();
    });

    it('éteint la rangée sur une saisie d’espaces', async () => {
      const { fixture } = await render();
      await click(fixture, '.empty-add button');

      await type(fixture, '   ');

      expect(counts(fixture).every((button) => button.disabled)).toBe(true);
    });

    it('montre un reçu du dernier article dicté, annulable', async () => {
      const { fixture, dispatched, sync } = await render({
        seed: (doc) => createProduct(doc, { label: 'Lait' }, NOW),
      });
      await click(fixture, 'sl-dictation');
      await type(fixture, 'lai');
      counts(fixture)[0].click(); // ＋1
      await fixture.whenStable();

      // L'effect appliquerait l'ajout : on le rejoue pour que la liste le porte.
      await sync((doc) => put(doc, idOf(doc, 'Lait'), Date.now()));
      expect(receipt(fixture)).toContain('Lait');

      await click(fixture, 'sl-dictation .receipt .undo');

      // Un article tout juste posé, annulé, ressort de la liste.
      expect(types(dispatched)).toContain('[Liste] Article retiré');
    });

    it('annonce le compte ajouté sur un doublon', async () => {
      let itemId: ItemId = '' as ItemId;
      const { fixture, sync } = await render({
        seed: (doc) => {
          itemId = put(doc, createProduct(doc, { label: 'Œufs' }, NOW));
          setItemQty(doc, DEFAULT_LIST_ID, itemId, '4');
        },
      });
      await click(fixture, 'sl-dictation');
      await type(fixture, 'Œufs');
      counts(fixture)[1].click(); // ＋2
      await fixture.whenStable();

      // Redicter incrémente au lieu de dupliquer : 4 + 2 = 6.
      await sync((doc) => setItemQty(doc, DEFAULT_LIST_ID, itemId, '6'));

      expect(receipt(fixture)).toContain('×6');
      expect(receipt(fixture)).toContain('+2');
    });

    it('compte les articles dictés depuis l’ouverture', async () => {
      const { fixture, sync } = await render();
      await click(fixture, '.empty-add button');

      await sync((doc) => {
        put(doc, createProduct(doc, { label: 'Pain' }, NOW), Date.now());
        put(doc, createProduct(doc, { label: 'Lait' }, NOW), Date.now() + 1);
      });

      expect(
        dictation(fixture).querySelector('.counter-num')?.textContent,
      ).toBe('2');
    });

    it('n’affiche plus de reçu une fois la dictée refermée', async () => {
      const { fixture, sync } = await render({
        seed: (doc) => createProduct(doc, { label: 'Lait' }, NOW),
      });
      await click(fixture, 'sl-dictation');
      await type(fixture, 'lai');
      counts(fixture)[0].click();
      await fixture.whenStable();
      await sync((doc) => put(doc, idOf(doc, 'Lait'), Date.now()));

      await click(fixture, 'sl-dictation .done');

      expect(dictation(fixture).getAttribute('data-open')).toBe('false');
      expect(receipt(fixture)).toBeNull();
    });

    it('attend le retour du CRDT avant de montrer un reçu', async () => {
      // L'intention est partie mais la ligne n'est pas encore revenue : sans
      // ligne, pas de reçu — il est dérivé de la liste, pas de l'intention.
      const { fixture } = await render({
        seed: (doc) => createProduct(doc, { label: 'Lait' }, NOW),
      });
      await click(fixture, 'sl-dictation');
      await type(fixture, 'lai');

      counts(fixture)[0].click();
      await fixture.whenStable();

      expect(receipt(fixture)).toBeNull();
    });

    it('retrouve par le libellé la ligne d’un produit tout juste créé', async () => {
      // La création ne rend pas l'identifiant dans la frame de l'intention : le
      // reçu retrouve alors la ligne par son libellé.
      const { fixture, sync } = await render();
      await click(fixture, '.empty-add button');
      await type(fixture, 'Rutabaga');
      counts(fixture)[0].click();
      await fixture.whenStable();

      // Deux produits de même libellé, comme « Yaourt » vanille et Firen : le
      // reçu retient la ligne la plus récente.
      await sync((doc) => {
        put(doc, createProduct(doc, { label: 'Rutabaga' }, NOW), Date.now());
        put(doc, createProduct(doc, { label: 'Rutabaga' }, NOW), Date.now() + 1);
      });

      expect(receipt(fixture)).toContain('Rutabaga');
    });

    it('ramène un doublon à son compte d’avant, à l’annulation', async () => {
      let itemId: ItemId = '' as ItemId;
      const { fixture, dispatched, sync } = await render({
        seed: (doc) => {
          itemId = put(doc, createProduct(doc, { label: 'Œufs' }, NOW));
          setItemQty(doc, DEFAULT_LIST_ID, itemId, '4');
        },
      });
      await click(fixture, 'sl-dictation');
      await type(fixture, 'Œufs');
      counts(fixture)[1].click(); // ＋2
      await fixture.whenStable();
      await sync((doc) => setItemQty(doc, DEFAULT_LIST_ID, itemId, '6'));

      await click(fixture, 'sl-dictation .receipt .undo');

      expect(dispatched.at(-1)).toEqual(
        expect.objectContaining({ type: '[Liste] Quantité modifiée', qty: '4' }),
      );
    });
  });

  describe('photos', () => {
    it('demande la résolution des photos de la liste', async () => {
      const { images } = await render({
        seed: (doc) =>
          put(doc, createProduct(doc, { label: 'Lait', imageRef: PHOTO }, NOW)),
      });

      expect(images.ensured.at(-1)).toEqual([PHOTO]);
    });

    it('pose la photo sur la ligne dès qu’elle est là', async () => {
      const { fixture, images, sync } = await render({
        seed: (doc) =>
          put(doc, createProduct(doc, { label: 'Lait', imageRef: PHOTO }, NOW)),
      });
      images.url = 'blob:http://localhost/photo';

      // Un rendu de plus, comme celui qui suit l'arrivée d'un delta : la photo
      // se pose sans que la liste ait bougé.
      await sync(() => undefined);

      expect(
        row(fixture, 'Lait').querySelector('img').getAttribute('src'),
      ).toBe('blob:http://localhost/photo');
    });
  });

  describe('écran large', () => {
    it('monte l’historique en colonne et garde la barre d’ajout', async () => {
      const { fixture } = await render({ wide: true, seed: courses });

      expect(
        fixture.nativeElement.querySelector('sl-history-pane'),
      ).not.toBeNull();
      // La barre est permanente au bureau : elle n'attend pas qu'on l'ouvre, et
      // le mode dictée du téléphone n'a pas lieu d'être.
      expect(fixture.nativeElement.querySelector('sl-add-bar')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('sl-dictation')).toBeNull();
    });

    it('suit l’élargissement de la fenêtre sans recharger', async () => {
      const { fixture, media } = await render({ seed: courses });
      expect(fixture.nativeElement.querySelector('sl-history-pane')).toBeNull();

      for (const listener of media.listeners) {
        listener({ matches: true } as MediaQueryListEvent);
      }
      await fixture.whenStable();

      expect(
        fixture.nativeElement.querySelector('sl-history-pane'),
      ).not.toBeNull();
    });

    it('ajoute depuis la colonne sans vider la barre d’ajout', async () => {
      // Deux gestes distincts : ici on ajoute au passage, là-bas on compose.
      const { fixture, dispatched } = await render({
        wide: true,
        seed: (doc) => createProduct(doc, { label: 'Lait' }, NOW),
      });
      await type(fixture, 'pai');

      await click(fixture, 'sl-history-pane .add');

      expect(types(dispatched)).toEqual(['[Liste] Produit ajouté']);
      expect(
        field(fixture).value,
      ).toBe('pai');
    });

    it('ajoute une suggestion d’un tap sur la barre du bureau', async () => {
      // Au bureau, un tap sur la suggestion ajoute — pas de rangée de quantité
      // ici, c'est le geste de composition rapide.
      const { fixture, dispatched } = await render({
        wide: true,
        seed: (doc) => createProduct(doc, { label: 'Lait' }, NOW),
      });
      await type(fixture, 'lai');

      await click(fixture, 'sl-add-bar .suggestion');

      expect(types(dispatched)).toEqual(['[Liste] Produit ajouté']);
      expect(field(fixture).value).toBe('');
    });

    it('crée depuis la barre du bureau ce que l’historique ignore', async () => {
      const { fixture, dispatched } = await render({ wide: true });
      await type(fixture, '  Rutabaga  ');

      await click(fixture, 'sl-add-bar .create');

      expect(dispatched).toEqual([
        expect.objectContaining({
          type: '[Liste] Produit créé et ajouté',
          draft: { label: 'Rutabaga' },
        }),
      ]);
    });

    it('ne laisse pas d’écouteur de largeur derrière elle', async () => {
      // Sans ce retrait, chaque visite de l'écran empilerait un écouteur qui
      // écrirait dans un composant détruit.
      const { fixture, media } = await render({ wide: true });
      expect(media.listeners).toHaveLength(1);

      fixture.destroy();

      expect(media.listeners).toHaveLength(0);
    });

    it('ne suppose pas que la plate-forme sait mesurer la fenêtre', async () => {
      // Rendu hors navigateur — préparation d'une page, test d'intégration — il
      // n'y a pas de `matchMedia` : l'écran doit rester la version téléphone.
      const { fixture } = await render({ wide: null, seed: courses });

      expect(fixture.nativeElement.querySelector('sl-history-pane')).toBeNull();
      expect(
        fixture.nativeElement.querySelector('sl-dictation'),
      ).not.toBeNull();
    });
  });
});
