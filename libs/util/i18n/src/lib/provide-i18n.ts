import {
  EnvironmentProviders,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
  provideEnvironmentInitializer,
} from '@angular/core';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';

import { BundledTranslationsLoader } from './bundled-translations.loader';
import { applyDocumentLang } from './document-lang';
import { AppLang, AVAILABLE_LANGS, DEFAULT_LANG, detectLang } from './langs';

/**
 * Le socle commun à l'application et aux tests.
 *
 * `reRenderOnLangChange` est à `false` : la langue vient du navigateur et ne
 * change pas en cours de session. L'activer ferait payer un abonnement par
 * libellé affiché pour un événement qui ne survient jamais.
 *
 * Les pluriels ne passent pas par le transpileur mais par le pipe `plural` —
 * voir {@link Plural}.
 */
function translocoProviders(lang: AppLang): EnvironmentProviders[] {
  return [
    // `provideTransloco` renvoie déjà un tableau : on l'aplatit ici pour que
    // l'appelant n'ait qu'une liste plate à passer.
    ...provideTransloco({
      config: {
        availableLangs: [...AVAILABLE_LANGS],
        defaultLang: lang,
        fallbackLang: DEFAULT_LANG,
        // Une clé manquante dans une traduction retombe sur la langue source
        // plutôt que d'afficher la clé nue à l'utilisateur.
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: false,
        prodMode: !isDevMode(),
      },
      loader: BundledTranslationsLoader,
    }),
    // Le chargeur est synchrone : à la sortie de cet initialiseur, `translate()`
    // répond déjà, y compris depuis un service appelé avant tout rendu.
    provideEnvironmentInitializer(() => {
      inject(TranslocoService).load(lang).subscribe();
    }),
  ];
}

/**
 * Internationalisation de l'application, langue déduite du navigateur.
 *
 * @param lang force la langue ; par défaut la première langue traduite dans
 *             l'ordre de préférence annoncé par le navigateur.
 */
export function provideI18n(
  lang: AppLang = detectLang(),
): EnvironmentProviders {
  return makeEnvironmentProviders([
    ...translocoProviders(lang),
    provideAppInitializer(() =>
      applyDocumentLang(lang, inject(TranslocoService)),
    ),
  ]);
}

/** Même socle, sans toucher au document. Réservé aux tests. */
export function provideI18nWithoutDocument(
  lang: AppLang,
): EnvironmentProviders {
  return makeEnvironmentProviders(translocoProviders(lang));
}
