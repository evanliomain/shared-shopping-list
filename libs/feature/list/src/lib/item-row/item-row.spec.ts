import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ItemView } from '@shopping-list/data-access/shopping';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { ItemRow } from './item-row';

const BASE: ItemView = {
  id: 'item-1',
  productId: 'product-1',
  label: 'Yaourt',
  unknownProduct: false,
  description: 'à la vanille',
  qty: 'x4',
  note: null,
  checked: false,
  imageRef: 'emoji:🍦',
  emoji: '🍦',
  aisle: 'cremerie',
  addedBy: 'Evan',
  createdAt: 0,
};

describe('ItemRow', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideTestI18n()],
    });
  });

  // Plusieurs rendus par test : la configuration du module ne peut être faite
  // qu'une fois, avant toute instanciation.
  async function render(item: Partial<ItemView> = {}, menuOpen = false) {
    const fixture = TestBed.createComponent(ItemRow);
    fixture.componentRef.setInput('item', { ...BASE, ...item });
    fixture.componentRef.setInput('menuOpen', menuOpen);
    await fixture.whenStable();

    return fixture;
  }

  it('affiche libellé, description et quantité', async () => {
    const { nativeElement } = await render();

    expect(nativeElement.querySelector('.label').textContent).toContain(
      'Yaourt',
    );
    expect(nativeElement.querySelector('.description').textContent).toContain(
      'à la vanille',
    );
    expect(nativeElement.querySelector('.qty').textContent).toContain('x4');
  });

  it('n’affiche pas de quantité vide', async () => {
    const { nativeElement } = await render({ qty: '' });

    expect(nativeElement.querySelector('.qty')).toBeNull();
  });

  it('expose son état coché à l’assistance vocale', async () => {
    const unchecked = await render();
    expect(
      unchecked.nativeElement
        .querySelector('[role="checkbox"]')
        .getAttribute('aria-checked'),
    ).toBe('false');

    const checked = await render({ checked: true });
    expect(
      checked.nativeElement
        .querySelector('[role="checkbox"]')
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(checked.nativeElement.getAttribute('data-checked')).toBe('true');
  });

  it('émet l’état inverse quand on tape la ligne', async () => {
    const fixture = await render({ checked: false });
    let emitted: boolean | undefined;
    fixture.componentInstance.toggled.subscribe((v) => (emitted = v));

    fixture.nativeElement.querySelector('.toggle').click();

    expect(emitted).toBe(true);
  });

  it('ne montre le menu que lorsqu’il est ouvert', async () => {
    const closed = await render({}, false);
    expect(closed.nativeElement.querySelector('.menu')).toBeNull();

    const open = await render({}, true);
    expect(open.nativeElement.querySelector('.menu')).not.toBeNull();
  });

  it('pointe vers la fiche du produit, pas vers la ligne', async () => {
    // La fiche modifie le catalogue : c'est l'identifiant du produit qui
    // compte, pas celui de la ligne de liste.
    const { nativeElement } = await render({}, true);

    expect(nativeElement.querySelector('.menu a').getAttribute('href')).toBe(
      '/produit/product-1',
    );
  });

  it('émet la suppression depuis le menu', async () => {
    const fixture = await render({}, true);
    let removed = false;
    fixture.componentInstance.removed.subscribe(() => (removed = true));

    fixture.nativeElement.querySelector('.menu button').click();

    expect(removed).toBe(true);
  });
});
