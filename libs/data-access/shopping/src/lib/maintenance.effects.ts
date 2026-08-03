import { inject } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { BlobService, blobHashOf } from '@shopping-list/core/blobs';
import { purgeRemovedItems, YDocService } from '@shopping-list/core/crdt';
import { delay, filter, switchMap, take, tap } from 'rxjs/operators';

import { selectCatalog, selectLoaded } from './shopping.feature';

/**
 * Le ménage attend que la liste soit à l'écran.
 *
 * Au milieu des courses, effacer des fichiers n'est jamais prioritaire.
 */
const MAINTENANCE_DELAY_MS = 5000;

/**
 * Efface les photos que plus aucun produit ne réclame.
 *
 * Le stockage des images est adressé par contenu, donc immuable : remplacer la
 * photo d'un produit ou revenir à un emoji abandonne simplement l'ancienne.
 * Rien ne la ramassait jusqu'ici.
 *
 * Une seule passe par session, après le premier snapshot. **Attendre `loaded`
 * n'est pas une optimisation** : avant lui le catalogue est vide, et lancer le
 * ménage à ce moment ferait passer toutes les photos pour orphelines. C'est le
 * seul endroit de ce fichier où une erreur perdrait des données.
 */
export const collectOrphanBlobs = createEffect(
  (store = inject(Store), blobs = inject(BlobService)) =>
    store.select(selectLoaded).pipe(
      filter(Boolean),
      take(1),
      delay(MAINTENANCE_DELAY_MS),
      switchMap(() => store.select(selectCatalog).pipe(take(1))),
      tap((catalog) => {
        const products = Object.values(catalog);
        if (0 === products.length) {
          // Ceinture et bretelles : un catalogue vide après `loaded` n'a de
          // toute façon aucune photo à conserver, autant ne rien risquer.
          return;
        }

        // Le catalogue **brut**, jamais les vues qui masquent les archives :
        // désarchiver un produit doit rétablir sa fiche avec son image.
        const reachable = new Set(
          products
            .map((product) => blobHashOf(product.imageRef))
            .filter((hash): hash is string => null !== hash),
        );

        void blobs.collectGarbage(reachable);
      }),
    ),
  { functional: true, dispatch: false },
);

/**
 * Efface les lignes retirées depuis plus de trente jours.
 *
 * `purgeRemovedItems` existait depuis le lot 1 mais n'avait jamais été
 * branchée : les tombstones s'accumulaient dans `state.bin`, exactement ce
 * qu'elle avait été écrite pour éviter. Or la taille du document décide de ce
 * qui passe encore dans l'API Contents de GitHub et dans un échange par QR.
 *
 * Purger écrit dans le document, donc pousse une nouvelle version — c'est
 * voulu : les autres appareils gagnent le même allègement.
 */
export const purgeExpiredTombstones = createEffect(
  (store = inject(Store), yDoc = inject(YDocService)) =>
    store.select(selectLoaded).pipe(
      filter(Boolean),
      take(1),
      delay(MAINTENANCE_DELAY_MS),
      tap(() => {
        yDoc.transact((doc) => purgeRemovedItems(doc, Date.now()));
      }),
    ),
  { functional: true, dispatch: false },
);

export const maintenanceEffects = {
  collectOrphanBlobs,
  purgeExpiredTombstones,
};
