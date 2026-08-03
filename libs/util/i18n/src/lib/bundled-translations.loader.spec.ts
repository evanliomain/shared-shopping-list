import { TestBed } from '@angular/core/testing';
import { Translation } from '@jsverse/transloco';

import { BundledTranslationsLoader } from './bundled-translations.loader';
import en from './translations/en.json';
import fr from './translations/fr.json';

/** Ce que le chargeur a rendu *avant* que la pile se vide. */
function chargeImmediate(lang: string): readonly Translation[] {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});

  const recues: Translation[] = [];
  TestBed.inject(BundledTranslationsLoader)
    .getTranslation(lang)
    .subscribe((translation) => recues.push(translation));

  return recues;
}

describe('BundledTranslationsLoader', () => {
  it('sert la traduction sans requête ni tour de boucle', () => {
    // C'est ce qui évite le clignotement entre le premier rendu et l'arrivée
    // des libellés : rien n'est attendu, donc rien n'est vide entre-temps.
    expect(chargeImmediate('en')).toEqual([en]);
    expect(chargeImmediate('fr')).toEqual([fr]);
  });

  it('retombe sur la langue source pour une langue non traduite', () => {
    // Transloco demande aussi la langue de repli et les variantes régionales
    // que le navigateur annonce : aucune ne doit rendre un objet vide.
    expect(chargeImmediate('de')).toEqual([fr]);
    expect(chargeImmediate('fr-CA')).toEqual([fr]);
    expect(chargeImmediate('')).toEqual([fr]);
  });
});
