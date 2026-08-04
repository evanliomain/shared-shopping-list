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

/** Les pastilles annulables de la feuille d'ajout, dans l'ordre affiché. */
function chips(fixture: ComponentFixture<ListPage>): string[] {
  return [...fixture.nativeElement.querySelectorAll('sl-add-bar .chip')].map(
    (chip: HTMLElement) => (chip.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
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
  const field = fixture.nativeElement.querySelector('sl-add-bar input');
  field.value = query;
  field.dispatchEvent(new Event('input'));
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

    it('ne propose pas de vider une liste déjà vide', async () => {
      const { fixture } = await render();

      expect(fixture.nativeElement.querySelector('sl-list-menu')).toBeNull();
    });

    it('offre le menu de liste dès qu’il y a un article', async () => {
      const { fixture } = await render({ seed: courses });

      expect(
        fixture.nativeElement.querySelector('sl-list-menu'),
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

  describe('bouton flottant', () => {
    it('ouvre la feuille d’ajout depuis la liste', async () => {
      const { fixture } = await render({ seed: courses });
      expect(fixture.nativeElement.querySelector('sl-add-bar')).toBeNull();

      await click(fixture, 'sl-add-button button');

      expect(fixture.nativeElement.querySelector('sl-add-bar')).not.toBeNull();
    });

    it('ouvre la feuille depuis la liste vide, où l’ajout est l’écran', async () => {
      const { fixture } = await render();

      await click(fixture, '.empty-add button');

      expect(fixture.nativeElement.querySelector('sl-add-bar')).not.toBeNull();
    });

    it('se retire vers l’avant de la liste et revient en remontant', async () => {
      // Lire sa liste ne se fait pas avec un bouton posé sur la dernière ligne.
      const { fixture } = await render({ seed: courses });
      const fab = fixture.nativeElement.querySelector('sl-add-button');
      expect(fab.getAttribute('data-retracted')).toBe('false');

      await scroll(fixture, 300);
      expect(fab.getAttribute('data-retracted')).toBe('true');

      await scroll(fixture, 0);
      expect(fab.getAttribute('data-retracted')).toBe('false');
    });

    it('s’efface pendant la saisie, la feuille portant déjà le geste', async () => {
      const { fixture } = await render({ seed: courses });

      await click(fixture, 'sl-add-button button');

      expect(
        fixture.nativeElement
          .querySelector('sl-add-button')
          .getAttribute('data-retracted'),
      ).toBe('true');
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

  describe('ajouter', () => {
    it('propose l’historique et l’ajoute sans rien retaper', async () => {
      const { fixture, dispatched } = await render({
        seed: (doc) => createProduct(doc, { label: 'Lait' }, NOW),
      });
      await click(fixture, '.empty-add button');
      await type(fixture, 'lai');

      await click(fixture, 'sl-add-bar .suggestion');

      expect(types(dispatched)).toEqual(['[Liste] Produit ajouté']);
      // La saisie repart à vide, panneau ouvert : on enchaîne l'article suivant.
      expect(
        fixture.nativeElement.querySelector('sl-add-bar input').value,
      ).toBe('');
    });

    it('crée le produit que l’historique ne connaît pas', async () => {
      const { fixture, dispatched } = await render();
      await click(fixture, '.empty-add button');

      await type(fixture, '  Rutabaga  ');
      await click(fixture, 'sl-add-bar .create');

      expect(dispatched).toEqual([
        expect.objectContaining({
          type: '[Liste] Produit créé et ajouté',
          draft: { label: 'Rutabaga' },
        }),
      ]);
    });

    it('ne propose pas de créer ce que l’historique porte déjà', async () => {
      // Sinon on fabriquerait des doublons dans l'historique, ce qui ruinerait
      // précisément ce à quoi il sert.
      const { fixture } = await render({
        seed: (doc) => createProduct(doc, { label: 'Lait' }, NOW),
      });
      await click(fixture, '.empty-add button');

      await type(fixture, 'Lait');

      expect(
        fixture.nativeElement.querySelector('sl-add-bar .create'),
      ).toBeNull();
    });

    it('ne propose rien sur une saisie d’espaces', async () => {
      const { fixture } = await render();
      await click(fixture, '.empty-add button');

      await type(fixture, '   ');

      expect(
        fixture.nativeElement.querySelector('sl-add-bar .create'),
      ).toBeNull();
    });

    it('empile les articles entrés depuis l’ouverture, du dernier au premier', async () => {
      // La pile est dérivée de la liste, pas journalisée : un article déjà
      // présent avant l'ouverture n'y apparaît pas. Les plus récents sont en
      // tête, là où le pouce vient de les poser.
      const { fixture, sync } = await render({
        seed: (doc) => put(doc, createProduct(doc, { label: 'Lait' }, NOW)),
      });
      await click(fixture, 'sl-add-button button');

      await sync((doc) => {
        put(doc, createProduct(doc, { label: 'Pain' }, NOW), Date.now());
        put(
          doc,
          createProduct(doc, { label: 'Confiture' }, NOW),
          Date.now() + 1,
        );
      });

      expect(chips(fixture)).toEqual(['🛒 Confiture ✕', '🛒 Pain ✕']);
    });

    it('défait un ajout par le ✕ de sa pastille', async () => {
      const { fixture, dispatched, sync } = await render();
      await click(fixture, '.empty-add button');
      await sync((doc) => {
        const pain = createProduct(doc, { label: 'Pain' }, Date.now());
        put(doc, pain, Date.now());
      });

      await click(fixture, 'sl-add-bar .chip .undo');

      expect(types(dispatched)).toEqual(['[Liste] Article retiré']);
    });

    it('ne garde aucune pastille une fois la feuille refermée', async () => {
      const { fixture, sync } = await render();
      await click(fixture, '.empty-add button');
      await sync((doc) => {
        const pain = createProduct(doc, { label: 'Pain' }, Date.now());
        put(doc, pain, Date.now());
      });

      await click(fixture, 'sl-add-bar .done');

      expect(fixture.nativeElement.querySelector('sl-add-bar')).toBeNull();
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
      // La barre est permanente au bureau : elle n'attend pas qu'on l'ouvre.
      expect(fixture.nativeElement.querySelector('sl-add-bar')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('sl-add-button')).toBeNull();
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
        fixture.nativeElement.querySelector('sl-add-bar input').value,
      ).toBe('pai');
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
        fixture.nativeElement.querySelector('sl-add-button'),
      ).not.toBeNull();
    });
  });
});
