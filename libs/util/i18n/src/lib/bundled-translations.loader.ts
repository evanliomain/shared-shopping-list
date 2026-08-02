import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';

import { AppLang, DEFAULT_LANG, isAppLang } from './langs';
import en from './translations/en.json';
import fr from './translations/fr.json';

const TRANSLATIONS: Readonly<Record<AppLang, Translation>> = { fr, en };

/**
 * Charge les traductions depuis le bundle, sans aucune requête.
 *
 * Le chargeur par défaut de Transloco va chercher `assets/i18n/<lang>.json` en
 * HTTP. Pour une application *local-first* qui doit s'afficher au fond d'un
 * rayon sans réseau, c'est le mauvais compromis : une requête de plus au
 * démarrage, un `HttpClient` à provisionner, et un cache de service worker de
 * plus à tenir à jour. Deux fichiers de quelques kilo-octets tiennent
 * largement dans le bundle.
 *
 * L'observable est **synchrone** : rien ne clignote entre le premier rendu et
 * l'arrivée des libellés.
 */
@Injectable({ providedIn: 'root' })
export class BundledTranslationsLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return of(TRANSLATIONS[isAppLang(lang) ? lang : DEFAULT_LANG]);
  }
}
