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
  async function render(item: Partial<ItemView> = {}) {
    const fixture = TestBed.createComponent(ItemRow);
    fixture.componentRef.setInput('item', { ...BASE, ...item });
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

  it('préfixe un compte pur d’un « × »', async () => {
    const { nativeElement } = await render({ qty: '4' });

    expect(nativeElement.querySelector('.qty').textContent).toContain('×4');
  });

  it('n’affiche pas un compte de 1', async () => {
    // Le défaut : un « ×1 » n'apprend rien et alourdirait la ligne.
    const { nativeElement } = await render({ qty: '1' });

    expect(nativeElement.querySelector('.qty')).toBeNull();
  });

  it('affiche la note de la ligne quand elle en porte une', async () => {
    const { nativeElement } = await render({ note: 'le petit format' });

    expect(nativeElement.querySelector('.note').textContent).toContain(
      'le petit format',
    );
  });

  it('nomme l’article dont le produit n’est pas encore arrivé', async () => {
    // Un delta qui ajoute la ligne peut précéder celui qui crée le produit :
    // une ligne sans libellé serait illisible le temps que l'autre arrive.
    const { nativeElement } = await render({
      unknownProduct: true,
      label: '',
    });

    expect(nativeElement.querySelector('.label').textContent).toContain(
      'Article inconnu',
    );
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

  it('ne coche pas au clic sur la ligne', async () => {
    // Trop de faux clics à la lire du doigt : cocher passe par le glissé ou le
    // bouton ✓, plus par la ligne entière.
    const fixture = await render({ checked: false });
    let touched = false;
    fixture.componentInstance.toggled.subscribe(() => (touched = true));

    fixture.nativeElement.querySelector('.toggle').click();

    expect(touched).toBe(false);
  });

  it('n’a plus de menu contextuel', async () => {
    // Il ne portait que deux entrées, dont l'une — retirer — a son glissé ; et
    // son popover, prisonnier du calque que crée la ligne pour glisser,
    // passait sous la ligne suivante.
    const { nativeElement } = await render();

    expect(nativeElement.querySelector('.menu')).toBeNull();
    expect(nativeElement.querySelector('[aria-expanded]')).toBeNull();
  });

  it('pointe vers la fiche du produit, pas vers la ligne', async () => {
    // La fiche modifie le catalogue : c'est l'identifiant du produit qui
    // compte, pas celui de la ligne de liste.
    const { nativeElement } = await render();

    expect(nativeElement.querySelector('.edit').getAttribute('href')).toBe(
      '/produit/product-1',
    );
  });

  describe('boutons d’action', () => {
    it('dit ce que fait chaque bouton, à l’oreille et à la souris', async () => {
      // Un glyphe seul ne dit rien à personne : `aria-label` pour la lecture
      // d'écran, `title` pour l'infobulle, et les deux disent la même chose.
      const { nativeElement } = await render();

      for (const [selector, label] of [
        ['.check', 'Cocher'],
        ['.edit', 'Modifier le produit'],
        ['.remove', 'Retirer de la liste'],
      ]) {
        const button = nativeElement.querySelector(selector);
        expect(button.getAttribute('aria-label')).toBe(label);
        expect(button.getAttribute('title')).toBe(label);
      }
    });

    it('dit « renvoyer » plutôt que « cocher » sur un article coché', async () => {
      const { nativeElement } = await render({ checked: true });

      expect(nativeElement.querySelector('.check').getAttribute('title')).toBe(
        'Renvoyer dans la liste',
      );
    });

    it('coche par le bouton ✓, renvoie dans la liste par le ↩', async () => {
      const pending = await render({ checked: false });
      let emitted: boolean | undefined;
      pending.componentInstance.toggled.subscribe((v) => (emitted = v));
      expect(
        pending.nativeElement.querySelector('.check').textContent,
      ).toContain('✓');

      pending.nativeElement.querySelector('.check').click();
      expect(emitted).toBe(true);

      const checked = await render({ checked: true });
      checked.componentInstance.toggled.subscribe((v) => (emitted = v));
      expect(
        checked.nativeElement.querySelector('.check').textContent,
      ).toContain('↩');

      checked.nativeElement.querySelector('.check').click();
      expect(emitted).toBe(false);
    });

    it('retire par le bouton ✕', async () => {
      const fixture = await render();
      let removed = false;
      fixture.componentInstance.removed.subscribe(() => (removed = true));

      fixture.nativeElement.querySelector('.remove').click();

      expect(removed).toBe(true);
    });

    it('marque l’état coché sans case à cocher', async () => {
      // La case ronde a disparu : le ✓ vert dit l'état, il n'est plus une cible.
      const pending = await render({ checked: false });
      expect(pending.nativeElement.querySelector('.tick')).toBeNull();
      expect(pending.nativeElement.querySelector('.box')).toBeNull();

      const checked = await render({ checked: true });
      expect(
        checked.nativeElement.querySelector('.tick').textContent,
      ).toContain('✓');
    });
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

    function pointer(
      type: string,
      dx: number,
      dy: number,
      pointerId = 1,
    ): PointerEvent {
      return new PointerEvent(type, {
        pointerId,
        clientX: dx,
        clientY: dy,
        bubbles: true,
      });
    }

    function transform(host: HTMLElement): string {
      return host.querySelector<HTMLElement>('.content').style.transform;
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

    it('ne bouge pas pour un frémissement du doigt', async () => {
      // Sous le seuil, on ne sait pas encore si le geste est un glissé ou un
      // tap : la ligne attend plutôt que de partir de travers.
      const fixture = await render();
      const { nativeElement } = fixture;

      nativeElement.dispatchEvent(pointer('pointerdown', 0, 0));
      nativeElement.dispatchEvent(pointer('pointermove', 8, 4));
      await fixture.whenStable();

      expect(nativeElement.getAttribute('data-swipe')).toBe('none');
      expect(transform(nativeElement)).toBe('translateX(0px)');
    });

    it('laisse le premier doigt mener le geste', async () => {
      // Deux doigts sur l'écran, c'est un pincement : le second ne prend pas
      // le geste en cours, et ne recale pas son point de départ.
      const fixture = await render();
      const { nativeElement } = fixture;

      nativeElement.dispatchEvent(pointer('pointerdown', 0, 0));
      nativeElement.dispatchEvent(pointer('pointerdown', 300, 0, 2));
      nativeElement.dispatchEvent(pointer('pointermove', 360, 0, 2));
      await fixture.whenStable();

      expect(transform(nativeElement)).toBe('translateX(0px)');

      nativeElement.dispatchEvent(pointer('pointermove', 40, 0));
      await fixture.whenStable();

      expect(transform(nativeElement)).toBe('translateX(40px)');
    });

    it('montre sous la ligne ce que le relâcher va faire', async () => {
      // La voie colorée est la seule chose qui distingue « je coche » de « je
      // retire » avant qu'il ne soit trop tard.
      const fixture = await render({ checked: false });
      const { nativeElement } = fixture;

      nativeElement.dispatchEvent(pointer('pointerdown', 0, 0));
      nativeElement.dispatchEvent(pointer('pointermove', -30, 0));
      await fixture.whenStable();

      expect(nativeElement.getAttribute('data-swipe')).toBe('remove');
      expect(nativeElement.querySelector('.lane-glyph').textContent).toContain(
        '✕',
      );
    });

    it('promet le retour dans la liste sur un article déjà coché', async () => {
      const fixture = await render({ checked: true });
      const { nativeElement } = fixture;

      nativeElement.dispatchEvent(pointer('pointerdown', 0, 0));
      nativeElement.dispatchEvent(pointer('pointermove', 30, 0));
      await fixture.whenStable();

      expect(nativeElement.querySelector('.lane-glyph').textContent).toContain(
        '↩',
      );
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

    it('n’ajoute pas au geste le clic du bouton où il se termine', async () => {
      // Le glissé se pratique aussi à la souris, boutons visibles : un geste qui
      // finit sur le ✓ cocherait deux fois.
      const fixture = await render({ checked: false });
      const emitted: boolean[] = [];
      fixture.componentInstance.toggled.subscribe((v) => emitted.push(v));

      swipe(fixture.nativeElement, [
        [20, 0],
        [100, 0],
      ]);
      fixture.nativeElement.querySelector('.check').click();

      expect(emitted).toEqual([true]);
    });

    it('n’enchaîne pas sur le ✕ du bureau ce que le geste vient de faire', async () => {
      // Le glissé se pratique aussi à la souris, boutons visibles : un geste qui
      // finit sur le ✕ retirerait deux fois.
      const fixture = await render();
      let removed = 0;
      fixture.componentInstance.removed.subscribe(() => (removed += 1));

      swipe(fixture.nativeElement, [
        [-20, 0],
        [-100, 0],
      ]);
      fixture.nativeElement.querySelector('.remove').click();

      expect(removed).toBe(1);
    });

    it('coche toujours au bouton, une fois le geste retombé', async () => {
      const fixture = await render({ checked: false });
      const emitted: boolean[] = [];
      fixture.componentInstance.toggled.subscribe((v) => emitted.push(v));

      swipe(fixture.nativeElement, [
        [20, 0],
        [100, 0],
      ]);
      fixture.nativeElement.querySelector('.check').click();
      fixture.nativeElement.querySelector('.check').click();

      expect(emitted).toEqual([true, true]);
    });
  });
});
