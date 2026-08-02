import { createFeature, createReducer, on } from '@ngrx/store';
import {
  ItemId,
  ListId,
  ListItem,
  Product,
  ProductId,
} from '@shopping-list/core/crdt';

import { crdtActions } from './shopping.actions';

/**
 * Liste unique du lot 1. Le multi-listes arrive au lot 6 ; d'ici là, cette
 * constante est le seul endroit qui en dépende.
 */
export const DEFAULT_LIST_ID: ListId = 'maison';

export interface ShoppingState {
  readonly catalog: Readonly<Record<ProductId, Product>>;
  readonly items: Readonly<Record<ItemId, ListItem>>;
  /**
   * Nom porté par le CRDT, donc vide tant que rien n'est chargé.
   *
   * Ce n'est pas un libellé d'interface : c'est de la donnée, saisie une fois
   * et répliquée telle quelle sur tous les appareils, quelle que soit la
   * langue de chacun. L'écran affiche un nom par défaut traduit le temps que
   * le vrai arrive.
   */
  readonly listName: string;
  /**
   * Passe à `true` au premier snapshot reçu. Avant ça, une liste vide veut
   * dire « pas encore chargé », pas « rien à acheter » — et l'écran doit le
   * dire différemment.
   */
  readonly loaded: boolean;
}

const initialState: ShoppingState = {
  catalog: {},
  items: {},
  listName: '',
  loaded: false,
};

/**
 * Le reducer ne fait que **remplacer** l'état par la projection du CRDT.
 *
 * C'est volontairement bête : le store n'est pas une source de vérité, c'est
 * un miroir. Toute la logique de fusion est dans Yjs, toute la dérivation est
 * dans les selectors. Un reducer qui essaierait d'appliquer les intentions
 * utilisateur lui-même créerait une seconde vérité, qui divergerait.
 */
export const shoppingFeature = createFeature({
  name: 'shopping',
  reducer: createReducer(
    initialState,
    on(crdtActions.snapshotProduit, (state, { snapshot }) => {
      const list = snapshot.lists[DEFAULT_LIST_ID];

      return {
        catalog: snapshot.catalog,
        items: list?.items ?? {},
        listName: list?.name ?? state.listName,
        loaded: true,
      };
    }),
  ),
});

export const {
  name: shoppingFeatureKey,
  reducer: shoppingReducer,
  selectShoppingState,
  selectCatalog,
  selectItems,
  selectListName,
  selectLoaded,
} = shoppingFeature;
