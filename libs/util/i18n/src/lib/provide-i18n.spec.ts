import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { AppLang, AVAILABLE_LANGS } from './langs';
import { provideI18n, provideI18nWithoutDocument } from './provide-i18n';

/** L'état du document avant que le moindre initialiseur ne s'exécute. */
const TITRE_SERVI = document.title;
const LANGUE_SERVIE = document.documentElement.lang;

function demarre(lang: AppLang): TranslocoService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideI18n(lang)] });

  // L'injection déclenche les initialiseurs d'application : à la sortie, le
  // document est aligné et les traductions sont chargées.
  return TestBed.inject(TranslocoService);
}

function demarreSelonNavigateur(): TranslocoService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideI18n()] });

  return TestBed.inject(TranslocoService);
}

describe('provideI18n', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.title = TITRE_SERVI;
    document.documentElement.lang = LANGUE_SERVIE;
  });

  it('répond dès l’initialisation, sans attendre de rendu', () => {
    // Un service appelé avant le premier composant doit déjà obtenir sa phrase,
    // pas la clé nue.
    expect(demarre('fr').translate('product.save')).toBe('Enregistrer');
    expect(demarre('en').translate('product.save')).toBe('Save');
  });

  it('aligne le document sur la langue forcée', () => {
    demarre('en');

    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Shopping list');
  });

  it('déduit la langue du navigateur quand on ne la force pas', () => {
    vi.stubGlobal('navigator', {
      languages: ['de-DE', 'en-US'],
      language: 'de-DE',
    });
    expect(demarreSelonNavigateur().getActiveLang()).toBe('en');

    vi.stubGlobal('navigator', { languages: ['fr-CA'], language: 'fr-CA' });
    expect(demarreSelonNavigateur().getActiveLang()).toBe('fr');
  });

  it('n’ouvre que les langues réellement traduites', () => {
    // Une langue à moitié traduite ne doit pas pouvoir être activée : c'est
    // `AVAILABLE_LANGS` qui décide, pas ce que le navigateur annonce.
    expect(demarre('fr').getAvailableLangs()).toEqual([...AVAILABLE_LANGS]);
  });
});

describe('provideI18nWithoutDocument', () => {
  afterEach(() => {
    document.title = TITRE_SERVI;
    document.documentElement.lang = LANGUE_SERVIE;
  });

  it('laisse le document tel quel', () => {
    // Les tests des autres libs montent l'i18n en masse : renommer l'onglet ou
    // changer `lang` à chaque `TestBed` fausserait ce qu'ils observent.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideI18nWithoutDocument('en')],
    });

    expect(TestBed.inject(TranslocoService).translate('product.save')).toBe(
      'Save',
    );
    expect(document.title).toBe(TITRE_SERVI);
    expect(document.documentElement.lang).toBe(LANGUE_SERVIE);
  });
});
