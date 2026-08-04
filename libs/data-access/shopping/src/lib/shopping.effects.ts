import { inject } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Actions, ofType } from '@ngrx/effects';
import { blobHashOf } from '@shopping-list/core/blobs';
import {
  addItem,
  archiveProduct,
  clearCheckedItems,
  clearList,
  createProduct,
  removeItem,
  restoreItem,
  setItemChecked,
  setItemNote,
  setItemQty,
  setProductBankImage,
  setProductImage,
  unarchiveProduct,
  updateProduct,
  writeImageCredit,
  YDocService,
} from '@shopping-list/core/crdt';
import { ImageBankSettings } from '@shopping-list/core/image-bank';
import { suggestCategory } from '@shopping-list/util/categories';
import { EMPTY, from } from 'rxjs';
import { catchError, filter, map, mergeMap, tap } from 'rxjs/operators';

import { maintenanceEffects } from './maintenance.effects';
import { AdoptedImage, ProductBankImages } from './product-bank-images.service';
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
        listActions.articleCoché,
        listActions.articleRetiré,
        listActions.articleRestauré,
        listActions.quantitéModifiée,
        listActions.noteModifiée,
        listActions.articlesCochésVidés,
        listActions.listeVidée,
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

            case listActions.articlesCochésVidés.type:
              clearCheckedItems(doc, DEFAULT_LIST_ID, now);
              return;

            default:
              clearList(doc, DEFAULT_LIST_ID, now);
              return;
          }
        });
      }),
    ),
  { functional: true, dispatch: false },
);

/**
 * Crée le produit, l'ajoute à la liste, et annonce ce qu'il en est.
 *
 * Cet effect est à part des autres intentions de liste — et il **dispatche**,
 * lui — parce qu'il est le seul endroit où l'on tient à la fois l'identifiant
 * tout neuf et le résultat du dictionnaire d'emoji. C'est de ce couple que la
 * recherche d'image d'office a besoin ; le reconstituer plus tard demanderait de
 * retrouver le produit par son libellé, ce qui désignerait le mauvais dès qu'on
 * ajoute deux fois le même nom.
 *
 * Créer le produit *avant* de l'ajouter : c'est ce geste unique qui alimente
 * l'historique réutilisable.
 */
export const createAndAddProduct = createEffect(
  (actions$ = inject(Actions), yDoc = inject(YDocService)) =>
    actions$.pipe(
      ofType(listActions.produitCrééEtAjouté),
      map((action) => {
        const now = Date.now();
        const suggestion = suggestCategory(
          `${action.draft.label} ${action.draft.description ?? ''}`,
        );

        let productId = '';

        yDoc.transact((doc) => {
          productId = createProduct(
            doc,
            {
              ...action.draft,
              category: action.draft.category ?? suggestion.aisle,
              imageRef: action.draft.imageRef ?? `emoji:${suggestion.emoji}`,
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
        });

        return listActions.produitCréé({
          productId,
          label: action.draft.label,
          // Une image explicitement fournie vaut décision : on ne va rien
          // chercher par-dessus.
          emojiFound:
            suggestion.recognized ||
            undefined !== action.draft.imageRef ||
            undefined !== action.draft.category,
        });
      }),
    ),
  { functional: true },
);

/**
 * Va chercher une image quand aucun emoji n'a reconnu le libellé.
 *
 * Silencieux de bout en bout, et c'est délibéré : personne n'a demandé cette
 * recherche. Pas de réseau, aucun fournisseur debout, aucun résultat — l'emoji du
 * rayon reste et rien ne s'affiche. Une erreur ici serait un reproche adressé à
 * quelqu'un qui voulait seulement ajouter du lait à sa liste.
 *
 * `mergeMap` et non `concatMap` : dix articles enchaînés dans la feuille d'ajout
 * doivent chercher leurs images de front, pas l'un après l'autre.
 */
export const proposeBankImage = createEffect(
  (
    actions$ = inject(Actions),
    bank = inject(ProductBankImages),
    settings = inject(ImageBankSettings),
  ) =>
    actions$.pipe(
      ofType(listActions.produitCréé),
      filter((action) => !action.emojiFound && settings.auto()),
      mergeMap((action) =>
        from(bank.propose(action.label)).pipe(
          filter((adopted): adopted is AdoptedImage => null !== adopted),
          map((adopted) =>
            catalogActions.imageDeBanqueChoisie({
              productId: action.productId,
              imageRef: adopted.imageRef,
              credit: adopted.credit,
            }),
          ),
          catchError(() => EMPTY),
        ),
      ),
    ),
  { functional: true },
);

export const writeCatalogIntents = createEffect(
  (actions$ = inject(Actions), yDoc = inject(YDocService)) =>
    actions$.pipe(
      ofType(
        catalogActions.produitModifié,
        catalogActions.imageModifiée,
        catalogActions.imageDeBanqueChoisie,
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

            case catalogActions.imageDeBanqueChoisie.type: {
              // Les trois écritures ensemble, dans la même transaction : ce qui
              // s'affiche, ce qu'on saurait réafficher, et à qui l'image est. Un
              // crédit qui arriverait dans un second delta laisserait l'autre
              // appareil afficher l'image sans savoir la créditer.
              const hash = blobHashOf(action.imageRef);
              setProductImage(doc, action.productId, action.imageRef);
              setProductBankImage(doc, action.productId, action.imageRef);
              if (null !== hash) {
                writeImageCredit(doc, hash, action.credit);
              }
              return;
            }

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
  createAndAddProduct,
  proposeBankImage,
  writeCatalogIntents,
  ...maintenanceEffects,
};
