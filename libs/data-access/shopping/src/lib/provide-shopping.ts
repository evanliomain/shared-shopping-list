import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { ensureList, YDocService } from '@shopping-list/core/crdt';
import { SyncRegistry } from '@shopping-list/core/sync';

import { shoppingEffects } from './shopping.effects';
import {
  DEFAULT_LIST_ID,
  DEFAULT_LIST_NAME,
  shoppingFeature,
} from './shopping.feature';

/**
 * Câble la tranche « courses » : état, effects, et amorçage du document.
 *
 * L'ordre compte. On crée la liste par défaut **avant** de brancher les
 * providers de synchronisation : `ensureList` est idempotent, donc si un
 * document existant arrive derrière depuis IndexedDB ou GitHub, il ne
 * l'écrasera pas — Yjs fusionnera les deux, et la liste préexistante gardera
 * son nom.
 */
export function provideShopping(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideState(shoppingFeature),
    provideEffects(shoppingEffects),
    provideAppInitializer(() => {
      inject(YDocService).transact((doc) =>
        ensureList(doc, DEFAULT_LIST_ID, DEFAULT_LIST_NAME, Date.now()),
      );

      // Instancier le registre déclenche la connexion de tous les providers.
      inject(SyncRegistry);
    }),
  ]);
}
