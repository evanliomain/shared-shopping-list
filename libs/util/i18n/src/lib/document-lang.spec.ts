import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { applyDocumentLang, manifestFor } from './document-lang';
import { AppLang } from './langs';
import { provideI18nWithoutDocument } from './provide-i18n';

/** Ce que `index.html` sert à tout le monde : les libellés de la langue source. */
function documentServi(): Document {
  const doc = document.implementation.createHTMLDocument('Liste de courses');

  doc.documentElement.lang = 'fr';
  doc.head.innerHTML = `
    <meta
      name="description"
      content="Liste de courses partagée, hors ligne, sans serveur."
    />
    <link rel="manifest" href="manifest.webmanifest" />
    <meta name="apple-mobile-web-app-title" content="Courses" />
  `;

  return doc;
}

function translocoPour(lang: AppLang): TranslocoService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideI18nWithoutDocument(lang)],
  });

  return TestBed.inject(TranslocoService);
}

function meta(doc: Document, name: string): string | null {
  return (
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null
  );
}

function manifeste(doc: Document): string | null {
  return (
    doc.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null
  );
}

describe('manifestFor', () => {
  it('garde le nom historique pour la langue source', () => {
    // Les installations déjà faites pointent sur ce nom : le renommer les
    // détacherait de leur manifeste.
    expect(manifestFor('fr')).toBe('manifest.webmanifest');
  });

  it('suffixe le manifeste des autres langues', () => {
    expect(manifestFor('en')).toBe('manifest.en.webmanifest');
  });

  it('rend un chemin relatif, jamais une URL absolue', () => {
    // L'application est déployée sous un `baseHref` : une URL absolue le
    // contournerait.
    for (const nom of [manifestFor('fr'), manifestFor('en')]) {
      expect(nom.startsWith('/')).toBe(false);
      expect(nom.includes('://')).toBe(false);
    }
  });
});

describe('applyDocumentLang', () => {
  it('reprend en anglais ce que le HTML annonçait en français', () => {
    const doc = documentServi();

    applyDocumentLang('en', translocoPour('en'), doc);

    expect(doc.documentElement.lang).toBe('en');
    expect(doc.title).toBe('Shopping list');
    expect(meta(doc, 'description')).toBe(
      'Shared shopping list, offline, no server.',
    );
    // Le nom sous lequel la PWA s'installera sur l'écran d'accueil.
    expect(meta(doc, 'apple-mobile-web-app-title')).toBe('Groceries');
    expect(manifeste(doc)).toBe('manifest.en.webmanifest');
  });

  it('laisse le document intact quand la langue est déjà la bonne', () => {
    const doc = documentServi();

    applyDocumentLang('fr', translocoPour('fr'), doc);

    expect(doc.documentElement.lang).toBe('fr');
    expect(doc.title).toBe('Liste de courses');
    expect(meta(doc, 'description')).toBe(
      'Liste de courses partagée, hors ligne, sans serveur.',
    );
    expect(meta(doc, 'apple-mobile-web-app-title')).toBe('Courses');
    expect(manifeste(doc)).toBe('manifest.webmanifest');
  });

  it('pose la langue et le titre même sans balise à reprendre', () => {
    // Un document réduit — page d'erreur, test, futur `index.html` allégé — ne
    // doit pas faire échouer le démarrage de l'application.
    const doc = document.implementation.createHTMLDocument('');

    expect(() =>
      applyDocumentLang('en', translocoPour('en'), doc),
    ).not.toThrow();

    expect(doc.documentElement.lang).toBe('en');
    expect(doc.title).toBe('Shopping list');
    expect(manifeste(doc)).toBeNull();
  });

  it('agit sur le document de la page quand on ne lui en passe aucun', () => {
    const langue = document.documentElement.lang;
    const titre = document.title;

    try {
      applyDocumentLang('en', translocoPour('en'));

      expect(document.documentElement.lang).toBe('en');
      expect(document.title).toBe('Shopping list');
    } finally {
      document.documentElement.lang = langue;
      document.title = titre;
    }
  });
});
