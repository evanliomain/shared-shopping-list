import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideGithubSync } from '@shopping-list/core/sync-github';
import { provideLocalSync } from '@shopping-list/core/sync-indexeddb';
import { provideShopping } from '@shopping-list/data-access/shopping';
import { provideI18n } from '@shopping-list/util/i18n';

import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),

    /**
     * En premier : la langue vient du navigateur, les traductions sont
     * embarquées, et `provideShopping` a besoin du nom de liste traduit dès
     * son initialiseur.
     */
    provideI18n(),

    provideStore(),
    provideEffects(),

    /**
     * Les canaux locaux d'abord : ils n'ont besoin d'aucune configuration et
     * doivent être branchés avant que `provideShopping` n'amorce le document.
     */
    provideLocalSync(),
    provideGithubSync(),
    provideShopping(),

    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      // On laisse l'app démarrer avant d'enregistrer le SW : au milieu des
      // courses, la liste doit s'afficher avant tout le reste.
      registrationStrategy: 'registerWhenStable:30000',
    }),

    provideStoreDevtools({
      maxAge: 50,
      logOnly: !isDevMode(),
      connectInZone: false,
      name: 'Liste de courses',
    }),
  ],
};
