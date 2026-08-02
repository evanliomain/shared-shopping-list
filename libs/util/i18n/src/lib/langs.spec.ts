import { DEFAULT_LANG, isAppLang, resolveLang } from './langs';

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
