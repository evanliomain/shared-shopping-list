import { TestBed } from '@angular/core/testing';

import { ErrorText } from './error-text';
import { AppLang } from './langs';
import { provideI18nWithoutDocument } from './provide-i18n';
import { TranslatableError } from './translatable-error';

function errorTextFor(lang: AppLang): ErrorText {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideI18nWithoutDocument(lang)],
  });

  return TestBed.inject(ErrorText);
}

describe('ErrorText', () => {
  it('rend dans la langue active l’erreur qui porte une clé', () => {
    expect(
      errorTextFor('fr').describe(
        new TranslatableError('errors.pairing.invalidCode'),
      ),
    ).toBe("Ce code n'est pas un appairage valide.");

    expect(
      errorTextFor('en').describe(
        new TranslatableError('errors.pairing.invalidCode'),
      ),
    ).toBe('This code is not a valid pairing.');
  });

  it('interpole les paramètres portés par l’erreur', () => {
    expect(
      errorTextFor('fr').describe(
        new TranslatableError('errors.github.repoNotFound', {
          owner: 'evan',
          repo: 'courses',
        }),
      ),
    ).toBe(
      'Dépôt introuvable : evan/courses. Vérifiez le nom, et que le jeton porte bien sur ce dépôt.',
    );
  });

  it('affiche le message brut d’une erreur de la plateforme', () => {
    // `TypeError: Failed to fetch` n'a pas de clé : imparfait à lire, mais
    // préférable à un écran qui échoue en silence.
    expect(errorTextFor('fr').describe(new TypeError('Failed to fetch'))).toBe(
      'Failed to fetch',
    );
  });

  it('rend une phrase même de ce qui n’est pas une erreur', () => {
    // Un `throw 'oups'` ou un rejet de promesse sans `Error` reste possible.
    const text = errorTextFor('fr');

    expect(text.describe('oups')).toBe('oups');
    expect(text.describe(undefined)).toBe('undefined');
    expect(text.describe(404)).toBe('404');
  });
});
