import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { TranslocoService } from '@jsverse/transloco';
import { Store } from '@ngrx/store';
import { readListName, YDocService } from '@shopping-list/core/crdt';
import { DEFAULT_LIST_ID } from '@shopping-list/data-access/shopping';

import { appConfig } from './app.config';
import { appRoutes } from './app.routes';

const NOMS_ATTENDUS: Record<string, string> = {
  fr: 'Nos courses',
  en: 'Our groceries',
};

describe('appConfig', () => {
  beforeEach(() => {
    // jsdom ne fournit pas IndexedDB, et la persistance locale s'ouvre dès
    // l'initialiseur de `provideShopping`. Une ouverture qui ne répond jamais
    // laisse le reste de la configuration s'assembler sans rejet parasite.
    vi.stubGlobal('indexedDB', { open: () => ({}) });

    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('branche le routeur sur les routes de l’application', () => {
    expect(TestBed.inject(Router).config).toEqual(appRoutes);
  });

  it('crée la liste par défaut sous un nom traduit', () => {
    // Le nom n'est traduit qu'une fois, au tout premier démarrage, puis devient
    // de la donnée CRDT : c'est la seule occasion de constater que
    // l'initialiseur de `provideShopping` voit déjà des traductions chargées.
    const lang = TestBed.inject(TranslocoService).getActiveLang();
    const doc = TestBed.inject(YDocService).doc;

    expect(readListName(doc, DEFAULT_LIST_ID)).toBe(NOMS_ATTENDUS[lang]);
  });

  it('expose un magasin NgRx', () => {
    expect(TestBed.inject(Store)).toBeInstanceOf(Store);
  });

  it('n’enregistre pas de service worker en développement', () => {
    // Sinon chaque rechargement en local servirait la version en cache.
    expect(TestBed.inject(SwUpdate).isEnabled).toBe(false);
  });
});
