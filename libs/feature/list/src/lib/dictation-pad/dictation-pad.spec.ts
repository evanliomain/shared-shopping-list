import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { DictationPad } from './dictation-pad';

interface Options {
  readonly article?: string;
  readonly value?: string;
  readonly unit?: string;
}

describe('DictationPad', () => {
  async function render(options: Options = {}) {
    const fixture = TestBed.createComponent(DictationPad);
    fixture.componentRef.setInput('article', options.article ?? 'Tomates grappe');
    fixture.componentRef.setInput('value', options.value ?? '');
    fixture.componentRef.setInput('unit', options.unit ?? 'u');
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });
  });

  function field(fixture: ComponentFixture<DictationPad>): HTMLInputElement {
    return fixture.nativeElement.querySelector('.value-num');
  }

  function units(fixture: ComponentFixture<DictationPad>): HTMLButtonElement[] {
    return [...fixture.nativeElement.querySelectorAll('.unit')];
  }

  function add(fixture: ComponentFixture<DictationPad>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.add');
  }

  function type(fixture: ComponentFixture<DictationPad>, value: string): void {
    const input = field(fixture);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('nomme l’article qu’on quantifie', async () => {
    const { nativeElement } = await render({ article: 'Tomates grappe' });

    expect(nativeElement.querySelector('.name').textContent).toContain(
      'Tomates grappe',
    );
  });

  it('propose les cinq unités, le compte pur en tête', async () => {
    const fixture = await render();

    expect(units(fixture).map((u) => u.textContent?.trim())).toEqual([
      'u',
      'g',
      'kg',
      'L',
      'pack',
    ]);
  });

  it('laisse le bouton éteint tant que rien n’est saisi', async () => {
    const fixture = await render({ value: '' });

    expect(add(fixture).disabled).toBe(true);
  });

  it('allume le bouton dès qu’une valeur est saisie', async () => {
    const fixture = await render();

    type(fixture, '500');
    await fixture.whenStable();

    expect(add(fixture).disabled).toBe(false);
  });

  it('ne garde que chiffres et séparateur, virgule ramenée au point', async () => {
    const fixture = await render();

    type(fixture, '1a,5kg');
    await fixture.whenStable();

    expect(field(fixture).value).toBe('1.5');
  });

  it('pose un compte nu quand l’unité est le compte pur', async () => {
    const fixture = await render({ unit: 'u' });
    const posed: string[] = [];
    fixture.componentInstance.submitted.subscribe((q) => posed.push(q));

    type(fixture, '3');
    await fixture.whenStable();
    add(fixture).click();

    expect(posed).toEqual(['3']);
  });

  it('accole le symbole d’unité aux autres unités', async () => {
    const fixture = await render();
    const posed: string[] = [];
    fixture.componentInstance.submitted.subscribe((q) => posed.push(q));

    type(fixture, '500');
    units(fixture)[1].click(); // g
    await fixture.whenStable();
    add(fixture).click();

    expect(posed).toEqual(['500 g']);
  });

  it('annonce sur le bouton la valeur suivie de son unité', async () => {
    const fixture = await render();

    type(fixture, '500');
    units(fixture)[1].click(); // g
    await fixture.whenStable();

    expect(add(fixture).textContent).toContain('500 g');
  });

  it('marque l’unité choisie pour le lecteur d’écran', async () => {
    const fixture = await render({ unit: 'g' });

    const g = units(fixture)[1];
    expect(g.getAttribute('aria-checked')).toBe('true');
    expect(units(fixture)[0].getAttribute('aria-checked')).toBe('false');
  });

  it('vaut « Ajouter » à la touche Entrée', async () => {
    const fixture = await render();
    const posed: string[] = [];
    fixture.componentInstance.submitted.subscribe((q) => posed.push(q));

    type(fixture, '2');
    units(fixture)[4].click(); // pack
    await fixture.whenStable();
    field(fixture).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(posed).toEqual(['2 pack']);
  });

  it('ne pose rien à Entrée sur un champ vide', async () => {
    const fixture = await render();
    let posed = false;
    fixture.componentInstance.submitted.subscribe(() => (posed = true));

    field(fixture).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(posed).toBe(false);
  });

  it('revient en arrière sans rien poser', async () => {
    const fixture = await render();
    let back = false;
    fixture.componentInstance.back.subscribe(() => (back = true));

    fixture.nativeElement.querySelector('.back').click();

    expect(back).toBe(true);
  });

  it('reprend la valeur et l’unité d’amorce en réédition', async () => {
    const fixture = await render({ value: '500', unit: 'g' });

    expect(field(fixture).value).toBe('500');
    expect(units(fixture)[1].getAttribute('aria-checked')).toBe('true');
  });

  it('donne le focus au champ', async () => {
    const { nativeElement } = await render();

    // Le focus attend la frame suivante : on la laisse passer.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(nativeElement.querySelector('.value-num')).toBe(
      nativeElement.ownerDocument.activeElement,
    );
  });
});
