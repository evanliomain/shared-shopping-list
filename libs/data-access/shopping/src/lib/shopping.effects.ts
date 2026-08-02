import { inject } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Actions, ofType } from '@ngrx/effects';
import {
  addItem,
  archiveProduct,
  clearCheckedItems,
  createProduct,
  removeItem,
  restoreItem,
  setItemChecked,
  setItemNote,
  setItemQty,
  setProductImage,
  unarchiveProduct,
  updateProduct,
  YDocService,
} from '@shopping-list/core/crdt';
import { suggestCategory } from '@shopping-list/util/categories';
import { map, tap } from 'rxjs/operators';

import { catalogActions, crdtActions, listActions } from './shopping.actions';
import { DEFAULT_LIST_ID } from './shopping.feature';

/**
 * Projette le Y.Doc dans le store.
 *
 * C'est l'unique producteur de `snapshotProduit`, et il ne fait aucune
 * distinction entre local et distant : `snapshot$` émet aussi bien quand
 * l'utilisateur coche que quand un delta arrive de GitHub ou d'un QR code.
 */
export const projectSnapshot = createEffect(
  (yDoc = inject(YDocService)) =>
    yDoc.snapshot$.pipe(
      map((snapshot) => crdtActions.snapshotProduit({ snapshot })),
    ),
  { functional: true },
);

/**
 * Traduit les intentions de l'utilisateur en écritures CRDT.
 *
 * `dispatch: false` est essentiel : ces effects ne renvoient rien dans le
 * store. L'état revient par `projectSnapshot`, une fois le Y.Doc modifié. C'est
 * ce qui rend le flux strictement unidirectionnel.
 */
export const writeListIntents = createEffect(
  (actions$ = inject(Actions), yDoc = inject(YDocService)) =>
    actions$.pipe(
      ofType(
        listActions.produitAjouté,
        listActions.produitCrééEtAjouté,
        listActions.articleCoché,
        listActions.articleRetiré,
        listActions.articleRestauré,
        listActions.quantitéModifiée,
        listActions.noteModifiée,
        listActions.articlesCochésVidés,
      ),
      tap((action) => {
        const now = Date.now();

        yDoc.transact((doc) => {
          switch (action.type) {
            case listActions.produitAjouté.type:
              addItem(doc, {
                listId: DEFAULT_LIST_ID,
                productId: action.productId,
                addedBy: yDoc.deviceName,
                deviceId: yDoc.deviceId,
                now,
              });
              return;

            case listActions.produitCrééEtAjouté.type: {
              // Créer le produit *avant* de l'ajouter : c'est ce geste unique
              // qui alimente l'historique réutilisable.
              const suggestion = suggestCategory(
                `${action.draft.label} ${action.draft.description ?? ''}`,
              );
              const productId = createProduct(
                doc,
                {
                  ...action.draft,
                  category: action.draft.category ?? suggestion.aisle,
                  imageRef:
                    action.draft.imageRef ?? `emoji:${suggestion.emoji}`,
                },
                now,
              );
              addItem(doc, {
                listId: DEFAULT_LIST_ID,
                productId,
                addedBy: yDoc.deviceName,
                deviceId: yDoc.deviceId,
                now,
              });
              return;
            }

            case listActions.articleCoché.type:
              setItemChecked(
                doc,
                DEFAULT_LIST_ID,
                action.itemId,
                action.checked,
              );
              return;

            case listActions.articleRetiré.type:
              removeItem(doc, DEFAULT_LIST_ID, action.itemId, now);
              return;

            case listActions.articleRestauré.type:
              restoreItem(doc, DEFAULT_LIST_ID, action.itemId);
              return;

            case listActions.quantitéModifiée.type:
              setItemQty(doc, DEFAULT_LIST_ID, action.itemId, action.qty);
              return;

            case listActions.noteModifiée.type:
              setItemNote(doc, DEFAULT_LIST_ID, action.itemId, action.note);
              return;

            default:
              clearCheckedItems(doc, DEFAULT_LIST_ID, now);
              return;
          }
        });
      }),
    ),
  { functional: true, dispatch: false },
);

export const writeCatalogIntents = createEffect(
  (actions$ = inject(Actions), yDoc = inject(YDocService)) =>
    actions$.pipe(
      ofType(
        catalogActions.produitModifié,
        catalogActions.imageModifiée,
        catalogActions.produitArchivé,
        catalogActions.produitDésarchivé,
      ),
      tap((action) => {
        const now = Date.now();

        yDoc.transact((doc) => {
          switch (action.type) {
            case catalogActions.produitModifié.type:
              updateProduct(doc, action.productId, action.patch);
              return;

            case catalogActions.imageModifiée.type:
              setProductImage(doc, action.productId, action.imageRef);
              return;

            case catalogActions.produitArchivé.type:
              archiveProduct(doc, action.productId, now);
              return;

            default:
              unarchiveProduct(doc, action.productId);
              return;
          }
        });
      }),
    ),
  { functional: true, dispatch: false },
);

export const shoppingEffects = {
  projectSnapshot,
  writeListIntents,
  writeCatalogIntents,
};
