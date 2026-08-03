import {
  browserLangs,
  DEFAULT_LANG,
  detectLang,
  isAppLang,
  resolveLang,
} from './langs';

describe('resolveLang', () => {
  it('accepte une langue traduite, quelle que soit la variante régionale', () => {
    expect(resolveLang(['fr-CA'])).toBe('fr');
    expect(resolveLang(['en-US'])).toBe('en');
    expect(resolveLang(['EN'])).toBe('en');
  });

  it('descend la liste de préférences plutôt que de s’arrêter à la première', () => {
    // Un navigateur réglé en espagnol puis anglais doit obtenir l'anglais :
    // s'arrêter au premier tag le ferait retomber sur la langue source.
    expect(resolveLang(['es-ES', 'en-GB', 'fr'])).toBe('en');
  });

  it('retombe sur la langue source quand rien ne correspond', () => {
    expect(resolveLang(['de', 'it'])).toBe(DEFAULT_LANG);
    expect(resolveLang([])).toBe(DEFAULT_LANG);
  });
});

describe('isAppLang', () => {
  it('ne reconnaît que les langues réellement traduites', () => {
    expect(isAppLang('fr')).toBe(true);
    expect(isAppLang('en')).toBe(true);
    expect(isAppLang('de')).toBe(false);
    expect(isAppLang('fr-CA')).toBe(false);
  });
});

describe('browserLangs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rend les préférences dans l’ordre annoncé par le navigateur', () => {
    vi.stubGlobal('navigator', {
      languages: ['es-ES', 'en-GB', 'fr'],
      language: 'es-ES',
    });

    expect(browserLangs()).toEqual(['es-ES', 'en-GB', 'fr']);
  });

  it('se rabat sur la langue unique quand la liste manque ou est vide', () => {
    // `languages` reste absent de quelques navigateurs, et vide de quelques
    // webviews : dans les deux cas `language` est la seule information utile.
    vi.stubGlobal('navigator', { language: 'fr-CA' });
    expect(browserLangs()).toEqual(['fr-CA']);

    vi.stubGlobal('navigator', { languages: [], language: 'fr-CA' });
    expect(browserLangs()).toEqual(['fr-CA']);
  });

  it('ne suppose pas qu’un navigateur existe', () => {
    // Les langues sont résolues à l'import : hors page — service worker, script
    // de build — lire `navigator` de force ferait échouer le chargement.
    vi.stubGlobal('navigator', undefined);

    expect(browserLangs()).toEqual([]);
  });
});

describe('detectLang', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retient la première langue traduite que le navigateur demande', () => {
    vi.stubGlobal('navigator', {
      languages: ['de-DE', 'en-US'],
      language: 'de-DE',
    });

    expect(detectLang()).toBe('en');
  });

  it('retombe sur la langue source pour un navigateur qu’on ne traduit pas', () => {
    vi.stubGlobal('navigator', { languages: ['ja'], language: 'ja' });

    expect(detectLang()).toBe(DEFAULT_LANG);
  });
});
