import {
  createProduct,
  ensureList,
  readSnapshot,
  setAisleOrder,
} from '@shopping-list/core/crdt';
import * as Y from 'yjs';

import { crdtActions } from './shopping.actions';
import {
  DEFAULT_LIST_ID,
  shoppingReducer,
  ShoppingState,
} from './shopping.feature';

const NOW = 1_764_000_000_000;
const LIST_NAME = 'Nos courses';

function projected(
  state: ShoppingState | undefined,
  doc: Y.Doc,
): ShoppingState {
  return shoppingReducer(
    state,
    crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }),
  );
}

describe('reducer de la tranche « courses »', () => {
  it('ne dit pas « rien à acheter » avant le premier snapshot', () => {
    // La distinction porte tout l'écran d'accueil : une liste vide non chargée
    // et une liste vide chargée ne se disent pas de la même façon.
    expect(shoppingReducer(undefined, { type: '@@init' } as never)).toEqual({
      catalog: {},
      items: {},
      credits: {},
      listName: '',
      aisleOrder: [],
      loaded: false,
    });
  });

  it('recopie la projection du document, nom compris', () => {
    const doc = new Y.Doc({ gc: true });
    ensureList(doc, DEFAULT_LIST_ID, LIST_NAME, NOW);
    createProduct(doc, { label: 'Lait' }, NOW);

    const state = projected(undefined, doc);

    expect(state.listName).toBe(LIST_NAME);
    expect(state.loaded).toBe(true);
    expect(Object.values(state.catalog).map((p) => p.label)).toEqual(['Lait']);
  });

  it('recopie l’ordre des rayons réglé pour la liste', () => {
    const doc = new Y.Doc({ gc: true });
    ensureList(doc, DEFAULT_LIST_ID, LIST_NAME, NOW);
    setAisleOrder(doc, DEFAULT_LIST_ID, ['cave', 'boulangerie']);

    expect(projected(undefined, doc).aisleOrder).toEqual(['cave', 'boulangerie']);
  });

  it('revient à un ordre vide quand la liste n’est pas encore là', () => {
    // Même situation que le nom : le document peut n'avoir que le catalogue. Un
    // ordre vide dit « parcours par défaut », ce qui est le bon repli.
    const catalogOnly = new Y.Doc({ gc: true });
    createProduct(catalogOnly, { label: 'Lait' }, NOW);

    expect(projected(undefined, catalogOnly).aisleOrder).toEqual([]);
  });

  it('garde le nom connu tant que la liste n’est pas dans le document', () => {
    // Le catalogue peut arriver avant la liste : un delta de GitHub ou de QR ne
    // porte pas forcément les deux. Effacer le nom ferait clignoter l'écran vers
    // le libellé par défaut alors que la liste est bien nommée.
    const withList = new Y.Doc({ gc: true });
    ensureList(withList, DEFAULT_LIST_ID, LIST_NAME, NOW);
    const catalogOnly = new Y.Doc({ gc: true });
    createProduct(catalogOnly, { label: 'Lait' }, NOW);

    const state = projected(projected(undefined, withList), catalogOnly);

    expect(state.listName).toBe(LIST_NAME);
    expect(state.items).toEqual({});
  });
});
