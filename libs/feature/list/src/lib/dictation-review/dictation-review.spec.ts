import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ItemView } from '@shopping-list/data-access/shopping';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { DictationReview, DictationStep } from './dictation-review';

function item(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: 'item-1',
    productId: 'product-1',
    label: 'Yaourt nature',
    description: '',
    qty: '1',
    note: null,
    checked: false,
    imageRef: null,
    emoji: '🍦',
    aisle: 'cremerie',
    unknownProduct: false,
    addedBy: 'Evan',
    createdAt: 0,
    ...overrides,
  };
}

describe('DictationReview', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });
  });

  async function render(entries: readonly ItemView[]) {
    const fixture = TestBed.createComponent(DictationReview);
    fixture.componentRef.setInput('entries', entries);
    await fixture.whenStable();
    return fixture;
  }

  function rows(fixture: ComponentFixture<DictationReview>): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('.entry')];
  }

  it('compte les articles dictés en tête', async () => {
    const { nativeElement } = await render([
      item({ id: 'a', label: 'Pain' }),
      item({ id: 'b', label: 'Lait' }),
    ]);

    expect(nativeElement.querySelector('.title').textContent).toContain('2');
  });

  it('porte un stepper sur une ligne comptée', async () => {
    const fixture = await render([item({ qty: '4' })]);

    const row = rows(fixture)[0];
    expect(row.querySelector('.count')?.textContent?.trim()).toBe('4');
    expect(row.querySelector('.step.minus')).not.toBeNull();
    expect(row.querySelector('.step.plus')).not.toBeNull();
    expect(row.querySelector('.edit')).toBeNull();
  });

  it('vise un compte de plus au « + »', async () => {
    const fixture = await render([item({ id: 'x', qty: '4' })]);
    const steps: DictationStep[] = [];
    fixture.componentInstance.stepped.subscribe((s) => steps.push(s));

    (rows(fixture)[0].querySelector('.step.plus') as HTMLElement).click();

    expect(steps).toEqual([{ item: expect.objectContaining({ id: 'x' }), count: 5 }]);
  });

  it('vise un compte de moins au « − », jusqu’à zéro', async () => {
    const fixture = await render([item({ id: 'x', qty: '1' })]);
    const steps: DictationStep[] = [];
    fixture.componentInstance.stepped.subscribe((s) => steps.push(s));

    (rows(fixture)[0].querySelector('.step.minus') as HTMLElement).click();

    // Sous 1, c'est le parent qui décide du retrait : la relecture ne fait que
    // viser le compte.
    expect(steps).toEqual([{ item: expect.objectContaining({ id: 'x' }), count: 0 }]);
  });

  it('compte une quantité vide pour un — le défaut d’un ＋1', async () => {
    const fixture = await render([item({ qty: '' })]);

    const row = rows(fixture)[0];
    expect(row.querySelector('.count')?.textContent?.trim()).toBe('1');
    expect(row.querySelector('.edit')).toBeNull();
  });

  it('offre un ✎ plutôt qu’un stepper sur une quantité libre', async () => {
    const fixture = await render([item({ qty: '500 g' })]);

    const row = rows(fixture)[0];
    expect(row.querySelector('.free')?.textContent?.trim()).toBe('500 g');
    expect(row.querySelector('.edit')).not.toBeNull();
    expect(row.querySelector('.step')).toBeNull();
  });

  it('demande la réédition d’une quantité libre au ✎', async () => {
    const fixture = await render([item({ id: 'x', qty: '500 g' })]);
    let edited: ItemView | null = null;
    fixture.componentInstance.edit.subscribe((i) => (edited = i));

    (rows(fixture)[0].querySelector('.edit') as HTMLElement).click();

    expect(edited).toEqual(expect.objectContaining({ id: 'x' }));
  });

  it('revient à la saisie depuis « Fermer »', async () => {
    const fixture = await render([item()]);
    let dismissed = false;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed = true));

    fixture.nativeElement.querySelector('.close').click();

    expect(dismissed).toBe(true);
  });

  it('revient à la saisie depuis « Reprendre la dictée »', async () => {
    const fixture = await render([item()]);
    let dismissed = false;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed = true));

    fixture.nativeElement.querySelector('.resume').click();

    expect(dismissed).toBe(true);
  });
});
