import {
  addItem,
  archiveProduct,
  createProduct,
  ensureList,
  ProductId,
  readSnapshot,
  removeItem,
  setItemChecked,
} from '@shopping-list/core/crdt';
import * as Y from 'yjs';

import { crdtActions } from './shopping.actions';
import {
  DEFAULT_LIST_ID,
  shoppingReducer,
  ShoppingState,
} from './shopping.feature';
import {
  filterSuggestions,
  selectActiveItems,
  selectArchivedIds,
  selectCatalogEntries,
  selectCheckedCount,
  selectCheckedItems,
  selectIsEmpty,
  selectItemViews,
  selectPendingByAisle,
  selectPendingItems,
  selectRemainingCount,
  selectSuggestions,
} from './shopping.selectors';
import { ItemView } from './shopping.views';

const NOW = 1_764_000_000_000;
const LIST_NAME = 'Nos courses';

/**
 * Les selectors composés se testent par leur `projector` : on vérifie de la
 * dérivation pure, sans avoir à monter un Store.
 */
function viewsOf(state: ShoppingState): readonly ItemView[] {
  const active = selectActiveItems.projector(state.items);
  return selectItemViews.projector(active, state.catalog);
}

function pendingOf(state: ShoppingState): readonly ItemView[] {
  return selectPendingItems.projector(viewsOf(state));
}

/**
 * On construit l'état en passant par le vrai CRDT puis par le vrai reducer,
 * plutôt qu'en fabriquant un objet d'état à la main. Un état inventé pourrait
 * être impossible à produire dans l'application ; celui-ci ne peut pas l'être.
 */
class Scenario {
  readonly doc = new Y.Doc({ gc: true });
  private readonly products = new Map<string, ProductId>();

  constructor() {
    ensureList(this.doc, DEFAULT_LIST_ID, LIST_NAME, NOW);
  }

  product(
    key: string,
    values: { label: string; description?: string; category?: string },
  ): this {
    this.products.set(key, createProduct(this.doc, values, NOW));
    return this;
  }

  add(key: string, options: { at?: number; times?: number } = {}): this {
    const times = options.times ?? 1;
    for (let i = 0; i < times; i++) {
      addItem(this.doc, {
        listId: DEFAULT_LIST_ID,
        productId: this.id(key),
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: options.at ?? NOW,
      });
    }
    return this;
  }

  /** Une ligne dont le produit n'est pas (encore) dans le catalogue. */
  addUnknown(productId: ProductId): this {
    addItem(this.doc, {
      listId: DEFAULT_LIST_ID,
      productId,
      addedBy: 'Evan',
      deviceId: 'device-A',
      now: NOW,
    });
    return this;
  }

  check(key: string): this {
    const itemId = this.itemIdFor(key);
    setItemChecked(this.doc, DEFAULT_LIST_ID, itemId, true);
    return this;
  }

  remove(key: string): this {
    removeItem(this.doc, DEFAULT_LIST_ID, this.itemIdFor(key), NOW + 1);
    return this;
  }

  archive(key: string): this {
    archiveProduct(this.doc, this.id(key), NOW + 1);
    return this;
  }

  id(key: string): ProductId {
    const productId = this.products.get(key);
    if (undefined === productId) {
      throw new Error(`Produit non déclaré dans le scénario : ${key}`);
    }
    return productId;
  }

  state(): ShoppingState {
    return shoppingReducer(
      undefined,
      crdtActions.snapshotProduit({ snapshot: readSnapshot(this.doc) }),
    );
  }

  private itemIdFor(key: string): string {
    const productId = this.id(key);
    const items = readSnapshot(this.doc).lists[DEFAULT_LIST_ID].items;
    const found = Object.values(items).find((i) => i.productId === productId);
    if (undefined === found) {
      throw new Error(`Aucune ligne pour ${key}`);
    }
    return found.id;
  }
}

describe('selectors de la liste', () => {
  it('ignore les lignes retirées', () => {
    const state = new Scenario()
      .product('lait', { label: 'Lait' })
      .product('pain', { label: 'Pain' })
      .add('lait')
      .add('pain')
      .remove('pain')
      .state();

    expect(pendingOf(state)).toHaveLength(1);
    expect(selectRemainingCount.projector(pendingOf(state))).toBe(1);
  });

  it('sépare les articles cochés des articles restants', () => {
    const state = new Scenario()
      .product('lait', { label: 'Lait' })
      .product('pain', { label: 'Pain' })
      .add('lait')
      .add('pain')
      .check('lait')
      .state();

    const checked = selectCheckedItems.projector(viewsOf(state));

    expect(checked.map((v) => v.label)).toEqual(['Lait']);
    expect(pendingOf(state).map((v) => v.label)).toEqual(['Pain']);
    expect(selectCheckedCount.projector(checked)).toBe(1);
  });

  it('affiche une ligne dont le produit n’est pas encore arrivé', () => {
    // Un delta qui ajoute la ligne peut précéder celui qui crée le produit.
    // L'écran doit rester correct plutôt que de planter au milieu des courses,
    // et le libellé traduit est posé par le template, d'où le drapeau.
    const state = new Scenario().addUnknown('fantome').state();

    expect(viewsOf(state)).toMatchObject([
      {
        unknownProduct: true,
        label: '',
        description: '',
        qty: '',
        imageRef: null,
        emoji: '🛒',
        aisle: 'divers',
      },
    ]);
  });

  it('groupe par rayon dans l’ordre de parcours du magasin', () => {
    // Saisis dans le désordre ; l'affichage doit suivre le trajet réel.
    const state = new Scenario()
      .product('lessive', { label: 'Lessive', category: 'entretien' })
      .product('carotte', { label: 'Carottes', category: 'fruits-legumes' })
      .product('lait', { label: 'Lait', category: 'cremerie' })
      .add('lessive')
      .add('carotte')
      .add('lait')
      .state();

    const groups = selectPendingByAisle.projector(pendingOf(state));

    expect(groups.map((g) => g.aisle)).toEqual([
      'fruits-legumes',
      'cremerie',
      'entretien',
    ]);
    // Pas de libellé dans le groupe : la clé de rayon suffit, c'est le
    // template qui la traduit.
  });

  it('trie alphabétiquement à l’intérieur d’un rayon', () => {
    const state = new Scenario()
      .product('poireau', { label: 'Poireaux', category: 'fruits-legumes' })
      .product('avocat', { label: 'Avocats', category: 'fruits-legumes' })
      .add('poireau')
      .add('avocat')
      .state();

    const [group] = selectPendingByAisle.projector(pendingOf(state));
    expect(group.items.map((i) => i.label)).toEqual(['Avocats', 'Poireaux']);
  });

  it('distingue « vide » de « pas encore chargé »', () => {
    const pristine = shoppingReducer(undefined, { type: '@@init' } as never);
    expect(selectIsEmpty.projector([], pristine.loaded)).toBe(false);

    const loaded = new Scenario().state();
    expect(selectIsEmpty.projector([], loaded.loaded)).toBe(true);
  });
});

describe('suggestions issues de l’historique', () => {
  it('classe par usage puis par récence', () => {
    const scenario = new Scenario()
      .product('lait', { label: 'Lait' })
      .product('pain', { label: 'Pain' })
      .product('sel', { label: 'Sel' })
      .add('pain', { times: 3, at: NOW })
      .add('lait', { times: 1, at: NOW + 5000 })
      .add('sel', { times: 1, at: NOW + 1000 });

    // On vide la liste pour ne juger que le classement du catalogue.
    scenario.remove('pain');
    scenario.remove('lait');
    scenario.remove('sel');

    const state = scenario.state();
    const suggestions = selectSuggestions.projector(state.catalog, []);

    // Pain a été ajouté 3 fois ; Lait et Sel une fois chacun, Lait plus
    // récemment.
    expect(suggestions.map((s) => s.label)).toEqual(['Pain', 'Lait', 'Sel']);
  });

  it('exclut les produits archivés', () => {
    const state = new Scenario()
      .product('bougie', { label: 'Bougie' })
      .product('lait', { label: 'Lait' })
      .archive('bougie')
      .state();

    const suggestions = selectSuggestions.projector(state.catalog, []);
    expect(suggestions.map((s) => s.label)).toEqual(['Lait']);
  });

  it('relègue en fin de liste ce qui est déjà dans la liste, sans le masquer', () => {
    const scenario = new Scenario()
      .product('lait', { label: 'Lait' })
      .product('pain', { label: 'Pain' })
      .add('lait', { times: 5 });

    const state = scenario.state();
    const suggestions = selectSuggestions.projector(
      state.catalog,
      Object.values(state.items),
    );

    // Lait a beaucoup plus d'usage, mais il est déjà dans la liste.
    expect(suggestions.map((s) => s.label)).toEqual(['Pain', 'Lait']);
    expect(suggestions[1].alreadyInList).toBe(true);
  });
});

describe('filterSuggestions', () => {
  function pool() {
    const state = new Scenario()
      .product('vanille', { label: 'Yaourt', description: 'à la vanille' })
      .product('firen', {
        label: 'Yaourt',
        description: 'Firen, pour le petit',
      })
      .product('lait', { label: 'Lait' })
      .state();

    return selectSuggestions.projector(state.catalog, []);
  }

  it('rend tout quand la requête est vide', () => {
    expect(filterSuggestions(pool(), '  ')).toHaveLength(3);
  });

  it('cherche aussi dans la description', () => {
    // Le cas qui motive l'existence même de la description : deux produits
    // partagent le libellé « Yaourt », seule la description les distingue.
    const found = filterSuggestions(pool(), 'vanille');

    expect(found).toHaveLength(1);
    expect(found[0].description).toBe('à la vanille');
  });

  it('ignore accents et casse', () => {
    expect(filterSuggestions(pool(), 'YAOURT')).toHaveLength(2);
    expect(filterSuggestions(pool(), 'a la vanille')).toHaveLength(1);
  });

  it('cherche à cheval sur le libellé et la description', () => {
    // La moitié des lettres est dans l'un, l'autre moitié dans l'autre.
    expect(filterSuggestions(pool(), 'yaourt firen')).toHaveLength(1);
    expect(filterSuggestions(pool(), 'yaourt introuvable')).toHaveLength(0);
  });

  it('pardonne les lettres manquantes', () => {
    // Ce à quoi sert tout ceci : on tape d'un pouce, en marchant. « lat »
    // n'est une sous-chaîne de rien, et doit pourtant sortir « Lait ».
    const found = filterSuggestions(pool(), 'lat');

    expect(found[0].label).toBe('Lait');
  });

  it('classe la meilleure correspondance en tête', () => {
    // Avec une recherche approximative, tout ou presque finit par répondre :
    // c'est le classement qui fait le travail, pas le filtre.
    const found = filterSuggestions(pool(), 'vanille');

    expect(found[0].description).toBe('à la vanille');
  });

  it('laisse derrière ce qui est déjà dans la liste', () => {
    // Un produit déjà pris est là pour dire « tu l'as déjà », pas pour être
    // ajouté : même une correspondance parfaite ne le fait pas remonter.
    const state = new Scenario()
      .product('lait', { label: 'Lait' })
      .product('laitue', { label: 'Laitue' })
      .add('lait')
      .state();

    const found = filterSuggestions(
      selectSuggestions.projector(state.catalog, Object.values(state.items)),
      'lait',
    );

    expect(found.map((s) => s.label)).toEqual(['Laitue', 'Lait']);
  });
});

describe('catalogue complet', () => {
  it('garde les produits archivés, contrairement aux suggestions', () => {
    // On vient ici précisément pour retrouver et désarchiver : les masquer
    // rendrait l'opération impossible.
    const state = new Scenario()
      .product('bougie', { label: 'Bougie' })
      .product('lait', { label: 'Lait' })
      .archive('bougie')
      .state();

    expect(
      selectCatalogEntries.projector(state.catalog, []).map((s) => s.label),
    ).toEqual(['Bougie', 'Lait']);
    expect(
      selectSuggestions.projector(state.catalog, []).map((s) => s.label),
    ).toEqual(['Lait']);
  });

  it('classe du plus acheté au moins acheté, puis alphabétiquement', () => {
    // Pas de récence ici, contrairement aux suggestions : à usage égal, on
    // cherche un produit par son nom.
    const scenario = new Scenario()
      .product('pain', { label: 'Pain' })
      .product('lait', { label: 'Lait' })
      .product('sel', { label: 'Sel' })
      .add('pain', { times: 3, at: NOW })
      .add('lait', { times: 1, at: NOW + 1000 })
      .add('sel', { times: 1, at: NOW + 5000 });
    const state = scenario.state();

    expect(
      selectCatalogEntries.projector(state.catalog, []).map((s) => s.label),
    ).toEqual(['Pain', 'Lait', 'Sel']);
  });

  it('signale ce qui est déjà dans la liste', () => {
    const state = new Scenario()
      .product('lait', { label: 'Lait' })
      .product('pain', { label: 'Pain' })
      .add('lait')
      .state();

    const entries = selectCatalogEntries.projector(
      state.catalog,
      selectActiveItems.projector(state.items),
    );

    expect(entries.filter((s) => s.alreadyInList).map((s) => s.label)).toEqual([
      'Lait',
    ]);
  });

  it('distingue les produits archivés par leur empreinte', () => {
    const scenario = new Scenario()
      .product('bougie', { label: 'Bougie' })
      .product('lait', { label: 'Lait' })
      .archive('bougie');
    const state = scenario.state();

    expect([...selectArchivedIds.projector(state.catalog)]).toEqual([
      scenario.id('bougie'),
    ]);
  });
});
