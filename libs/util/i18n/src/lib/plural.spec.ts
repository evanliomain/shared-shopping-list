import { TestBed } from '@angular/core/testing';

import { AppLang } from './langs';
import { Plural } from './plural';
import { provideI18nWithoutDocument } from './provide-i18n';

function pluralFor(lang: AppLang): Plural {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideI18nWithoutDocument(lang)],
  });

  return TestBed.inject(Plural);
}

describe('Plural', () => {
  it('suit la règle de la langue, pas un test à un', () => {
    // Zéro est singulier en français et pluriel en anglais : c'est exactement
    // ce qu'aucun `count === 1` écrit à la main ne sait faire.
    expect(pluralFor('fr').translate('catalog.usage', 0)).toBe('0 achat');
    expect(pluralFor('en').translate('catalog.usage', 0)).toBe('0 purchases');

    expect(pluralFor('fr').translate('catalog.usage', 1)).toBe('1 achat');
    expect(pluralFor('en').translate('catalog.usage', 1)).toBe('1 purchase');

    expect(pluralFor('fr').translate('catalog.usage', 4)).toBe('4 achats');
  });

  it('donne la priorité au cas exact sur la catégorie', () => {
    // « Hors ligne » tout court quand rien n'attend, plutôt que « 0 modif ».
    const fr = pluralFor('fr');

    expect(fr.translate('sync.offline', 0)).toBe('Hors ligne');
    expect(fr.translate('sync.offline', 1)).toBe('Hors ligne · 1 modif gardée');
    expect(fr.translate('sync.offline', 3)).toBe(
      'Hors ligne · 3 modifs gardées',
    );
  });

  it('rend telle quelle une clé qui ne s’accorde pas', () => {
    // L'appelant n'a pas à savoir si un libellé a des formes plurielles.
    expect(pluralFor('fr').translate('sync.synced', 2)).toBe('Synchronisé');
  });

  it('expose aussi le compte aux autres paramètres du libellé', () => {
    expect(pluralFor('fr').translate('list.basket', 3)).toBe(
      'Dans le panier (3)',
    );
  });
});
