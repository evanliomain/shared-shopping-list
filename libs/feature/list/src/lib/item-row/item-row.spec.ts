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

  describe('glissé', () => {
    /**
     * Rejoue un geste : un appui, quelques mouvements, un relâcher. Les étapes
     * intermédiaires ne sont pas décoratives — c'est le premier mouvement franc
     * qui décide de l'axe, donc du sort du geste.
     */
    function swipe(
      host: HTMLElement,
      steps: readonly [number, number][],
      end: 'pointerup' | 'pointercancel' = 'pointerup',
    ): void {
      host.dispatchEvent(pointer('pointerdown', 0, 0));
      for (const [dx, dy] of steps) {
        host.dispatchEvent(pointer('pointermove', dx, dy));
      }
      host.dispatchEvent(pointer(end, ...(steps.at(-1) ?? [0, 0])));
    }

    function pointer(type: string, dx: number, dy: number): PointerEvent {
      return new PointerEvent(type, {
        pointerId: 1,
        clientX: dx,
        clientY: dy,
        bubbles: true,
      });
    }

    it('coche en glissant vers la droite', async () => {
      const fixture = await render({ checked: false });
      let emitted: boolean | undefined;
      fixture.componentInstance.toggled.subscribe((v) => (emitted = v));

      swipe(fixture.nativeElement, [
        [20, 0],
        [100, 4],
      ]);

      expect(emitted).toBe(true);
    });

    it('renvoie dans la liste un article déjà coché', async () => {
      // Le même geste, dans le même sens : le glissé se défait par où il s'est
      // fait, sans avoir à viser quoi que ce soit.
      const fixture = await render({ checked: true });
      let emitted: boolean | undefined;
      fixture.componentInstance.toggled.subscribe((v) => (emitted = v));

      swipe(fixture.nativeElement, [
        [20, 0],
        [100, 0],
      ]);

      expect(emitted).toBe(false);
    });

    it('retire en glissant vers la gauche', async () => {
      const fixture = await render();
      let removed = false;
      fixture.componentInstance.removed.subscribe(() => (removed = true));

      swipe(fixture.nativeElement, [
        [-20, 0],
        [-100, 2],
      ]);

      expect(removed).toBe(true);
    });

    it('ne fait rien d’un glissé abandonné avant le seuil', async () => {
      const fixture = await render();
      let touched = false;
      fixture.componentInstance.toggled.subscribe(() => (touched = true));
      fixture.componentInstance.removed.subscribe(() => (touched = true));

      swipe(fixture.nativeElement, [
        [-20, 0],
        [-60, 0],
      ]);

      expect(touched).toBe(false);
      // Et la ligne revient en place, sinon elle resterait de travers.
      await fixture.whenStable();
      expect(fixture.nativeElement.getAttribute('data-swipe')).toBe('none');
      expect(
        fixture.nativeElement.querySelector('.content').style.transform,
      ).toBe('translateX(0px)');
    });

    it('laisse défiler : un geste vertical ne déplace pas la ligne', async () => {
      // Sans ça, remonter la liste avec le pouce en travers cocherait au hasard.
      const fixture = await render();
      let touched = false;
      fixture.componentInstance.toggled.subscribe(() => (touched = true));
      fixture.componentInstance.removed.subscribe(() => (touched = true));

      swipe(fixture.nativeElement, [
        [4, 20],
        [100, 120],
      ]);

      expect(touched).toBe(false);
      await fixture.whenStable();
      expect(
        fixture.nativeElement.querySelector('.content').style.transform,
      ).toBe('translateX(0px)');
    });

    it('n’agit pas sur un geste interrompu par le navigateur', async () => {
      const fixture = await render();
      let touched = false;
      fixture.componentInstance.toggled.subscribe(() => (touched = true));
      fixture.componentInstance.removed.subscribe(() => (touched = true));

      swipe(
        fixture.nativeElement,
        [
          [20, 0],
          [110, 0],
        ],
        'pointercancel',
      );

      expect(touched).toBe(false);
    });

    it('annonce le seuil franchi pendant le geste', async () => {
      const fixture = await render();
      const { nativeElement } = fixture;

      nativeElement.dispatchEvent(pointer('pointerdown', 0, 0));
      nativeElement.dispatchEvent(pointer('pointermove', 20, 0));
      await fixture.whenStable();

      expect(nativeElement.getAttribute('data-swipe')).toBe('check');
      expect(nativeElement.getAttribute('data-armed')).toBe('false');
      expect(nativeElement.querySelector('.lane-glyph').textContent).toContain(
        '✓',
      );

      nativeElement.dispatchEvent(pointer('pointermove', 100, 0));
      await fixture.whenStable();

      expect(nativeElement.getAttribute('data-armed')).toBe('true');
    });

    it('n’ajoute pas un tap au geste qu’il vient de terminer', async () => {
      // Un glissé se termine par un `click` sur la ligne : sans garde, cocher
      // par glissé décocherait aussitôt.
      const fixture = await render({ checked: false });
      const emitted: boolean[] = [];
      fixture.componentInstance.toggled.subscribe((v) => emitted.push(v));

      swipe(fixture.nativeElement, [
        [20, 0],
        [100, 0],
      ]);
      fixture.nativeElement.querySelector('.toggle').click();

      expect(emitted).toEqual([true]);
    });

    it('coche toujours au tap, une fois le geste retombé', async () => {
      const fixture = await render({ checked: false });
      const emitted: boolean[] = [];
      fixture.componentInstance.toggled.subscribe((v) => emitted.push(v));

      swipe(fixture.nativeElement, [
        [20, 0],
        [100, 0],
      ]);
      fixture.nativeElement.querySelector('.toggle').click();
      fixture.nativeElement.querySelector('.toggle').click();

      expect(emitted).toEqual([true, true]);
    });
  });
});
