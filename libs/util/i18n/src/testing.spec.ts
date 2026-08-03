import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { AppLang, DEFAULT_LANG } from './lib/langs';
import { provideTestI18n } from './testing';

const TITRE_SERVI = document.title;

function transloco(lang?: AppLang): TranslocoService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [undefined === lang ? provideTestI18n() : provideTestI18n(lang)],
  });

  return TestBed.inject(TranslocoService);
}

describe('provideTestI18n', () => {
  afterEach(() => {
    document.title = TITRE_SERVI;
  });

  it('monte les vraies traductions, pas des doublures', () => {
    // C'est l'intérêt du helper : un test des autres libs échoue quand une clé
    // manque, au lieu d'afficher sereinement une chaîne bidon.
    expect(transloco().translate('product.save')).toBe('Enregistrer');
  });

  it('travaille en langue source par défaut', () => {
    expect(transloco().getActiveLang()).toBe(DEFAULT_LANG);
  });

  it('sert la langue demandée quand un test vérifie une traduction', () => {
    expect(transloco('en').translate('product.save')).toBe('Save');
  });

  it('ne touche pas au document', () => {
    // Les tests de composant l'appellent à chaque montage : renommer l'onglet
    // ou changer `lang` fausserait ce qu'ils observent du DOM.
    transloco('en');

    expect(document.title).toBe(TITRE_SERVI);
  });
});
