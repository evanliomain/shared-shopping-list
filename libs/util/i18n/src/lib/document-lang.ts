import { TranslocoService } from '@jsverse/transloco';

import { AppLang, DEFAULT_LANG } from './langs';

/** Le manifeste de la langue source garde le nom historique, sans suffixe. */
export function manifestFor(lang: AppLang): string {
  return DEFAULT_LANG === lang
    ? 'manifest.webmanifest'
    : `manifest.${lang}.webmanifest`;
}

function setMeta(doc: Document, name: string, content: string): void {
  doc
    .querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
    ?.setAttribute('content', content);
}

/**
 * Aligne le document lui-même sur la langue choisie.
 *
 * `index.html` est servi tel quel à tout le monde : ses libellés sont ceux de
 * la langue source, et il faut les reprendre une fois la langue résolue. Cela
 * concerne des choses qu'aucun template Angular n'atteint — l'attribut `lang`
 * dont dépendent la césure et les lecteurs d'écran, le titre de l'onglet, et
 * le nom sous lequel la PWA s'installera sur l'écran d'accueil.
 *
 * L'`href` reste relatif : l'application est déployée sous un `baseHref`
 * (`/shared-shopping-list/` sur Pages) et une URL absolue le contournerait.
 */
export function applyDocumentLang(
  lang: AppLang,
  transloco: TranslocoService,
  doc: Document = document,
): void {
  doc.documentElement.lang = lang;
  doc.title = transloco.translate('app.title');

  setMeta(doc, 'description', transloco.translate('app.description'));
  setMeta(
    doc,
    'apple-mobile-web-app-title',
    transloco.translate('app.shortName'),
  );

  doc
    .querySelector<HTMLLinkElement>('link[rel="manifest"]')
    ?.setAttribute('href', manifestFor(lang));
}
