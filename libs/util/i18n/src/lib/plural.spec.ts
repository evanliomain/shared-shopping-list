import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppLang } from './langs';
import { Plural, PluralPipe } from './plural';
import { provideI18nWithoutDocument } from './provide-i18n';

function pluralFor(lang: AppLang): Plural {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideI18nWithoutDocument(lang)],
  });

  return TestBed.inject(Plural);
}

@Component({
  selector: 'sl-hote-plural',
  imports: [PluralPipe],
  template: `
    <p id="usage">{{ 'catalog.usage' | plural: count() }}</p>
    <p id="ajout">{{ 'catalog.add' | plural: count() : { label: 'Lait' } }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HotePlural {
  readonly count = signal(0);
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

  it('retombe sur « other » quand la catégorie n’a pas de libellé', () => {
    // Le français range les millions dans « many », que les traductions
    // n'écrivent pas : sans ce dernier recours, la clé nue s'afficherait.
    expect(pluralFor('fr').translate('catalog.usage', 1_000_000)).toBe(
      '1000000 achats',
    );
  });
});

describe('PluralPipe', () => {
  async function rendu(lang: AppLang): Promise<ComponentFixture<HotePlural>> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideI18nWithoutDocument(lang)],
    });

    const fixture = TestBed.createComponent(HotePlural);
    await fixture.whenStable();

    return fixture;
  }

  function texte(fixture: ComponentFixture<HotePlural>, id: string): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector(`#${id}`)
        ?.textContent ?? ''
    );
  }

  it('accorde le libellé rendu dans le template', async () => {
    const fr = await rendu('fr');
    const en = await rendu('en');

    expect(texte(fr, 'usage')).toBe('0 achat');
    expect(texte(en, 'usage')).toBe('0 purchases');
  });

  it('suit le compte qui change sans réabonnement', async () => {
    // Le pipe est pur : c'est `count` qui fait réévaluer l'expression, pas un
    // abonnement à la langue.
    const fixture = await rendu('fr');

    fixture.componentInstance.count.set(4);
    await fixture.whenStable();

    expect(texte(fixture, 'usage')).toBe('4 achats');
  });

  it('transmet les autres paramètres du libellé', async () => {
    const fixture = await rendu('fr');

    expect(texte(fixture, 'ajout')).toBe('Ajouter Lait à la liste');
  });
});
