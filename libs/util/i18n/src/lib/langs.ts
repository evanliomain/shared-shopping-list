/**
 * Langues réellement traduites.
 *
 * Une langue n'entre ici que lorsque son fichier de traduction est complet :
 * la liste sert aussi de `availableLangs` à Transloco, qui refuse d'en activer
 * une autre.
 */
export const AVAILABLE_LANGS = ['fr', 'en'] as const;

export type AppLang = (typeof AVAILABLE_LANGS)[number];

/**
 * Langue de repli.
 *
 * Le français est la langue source du produit : c'est elle qui a toujours la
 * traduction la plus à jour, donc celle vers laquelle retomber quand le
 * navigateur demande autre chose.
 */
export const DEFAULT_LANG: AppLang = 'fr';

export function isAppLang(candidate: string): candidate is AppLang {
  return (AVAILABLE_LANGS as readonly string[]).includes(candidate);
}

/** `fr-CA` → `fr`. On ne distingue pas les variantes régionales. */
function baseOf(tag: string): string {
  return tag.toLowerCase().split('-')[0];
}

/**
 * Première langue traduite dans l'ordre de préférence du navigateur.
 *
 * On parcourt **toute** la liste plutôt que de ne regarder que la première :
 * un navigateur réglé sur `['es', 'en', 'fr']` doit obtenir l'anglais, pas le
 * repli. Sans réponse satisfaisante, on prend la langue source.
 */
export function resolveLang(preferred: readonly string[]): AppLang {
  for (const tag of preferred) {
    const base = baseOf(tag);
    if (isAppLang(base)) {
      return base;
    }
  }

  return DEFAULT_LANG;
}

/** Ce que le navigateur annonce, du plus souhaité au moins souhaité. */
export function browserLangs(): readonly string[] {
  if ('undefined' === typeof navigator) {
    return [];
  }

  const { languages, language } = navigator;
  return 0 < (languages?.length ?? 0) ? languages : [language];
}

export function detectLang(): AppLang {
  return resolveLang(browserLangs());
}
