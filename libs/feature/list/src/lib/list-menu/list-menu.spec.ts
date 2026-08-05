import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { ListUiStore } from '../list-ui.store';
import { ListMenu } from './list-menu';

describe('ListMenu', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      // Le menu porte un lien de navigation : `RouterLink` réclame le routeur.
      providers: [provideRouter([]), provideTestI18n(), ListUiStore],
    });
  });

  async function render(total = 3) {
    const fixture = TestBed.createComponent(ListMenu);
    fixture.componentRef.setInput('total', total);
    await fixture.whenStable();

    return fixture;
  }

  /** Le texte du popover, insécables ramenées à des espaces ordinaires. */
  function menu(nativeElement: HTMLElement): string | null {
    const popover = nativeElement.querySelector('.menu');

    return null === popover
      ? null
      : (popover.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  async function click(
    fixture: Awaited<ReturnType<typeof render>>,
    selector: string,
  ): Promise<void> {
    fixture.nativeElement.querySelector(selector).click();
    await fixture.whenStable();
  }

  it('reste fermé tant qu’on n’a pas tapé ⋯', async () => {
    const { nativeElement } = await render();

    expect(menu(nativeElement)).toBeNull();
    expect(
      nativeElement.querySelector('.toggle').getAttribute('aria-label'),
    ).toBe('Menu de la liste');
    expect(
      nativeElement.querySelector('.toggle').getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('ouvre sur « Ordonner les rayons » puis « Vider la liste »', async () => {
    // « Vider » vit ici, à part du « Vider » du panier : l'un jette tout,
    // l'autre seulement ce qui est pris.
    const fixture = await render();

    await click(fixture, '.toggle');

    expect(menu(fixture.nativeElement)).toBe(
      'Ordonner les rayons Vider la liste',
    );
    expect(
      fixture.nativeElement
        .querySelector('.toggle')
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('n’offre que d’ordonner les rayons quand la liste est vide', async () => {
    // Régler le parcours vaut liste vide comme pleine ; vider, non — il n'y a
    // rien à vider.
    const fixture = await render(0);

    await click(fixture, '.toggle');

    expect(menu(fixture.nativeElement)).toBe('Ordonner les rayons');
    expect(fixture.nativeElement.querySelector('.danger')).toBeNull();
  });

  it('dit combien d’articles la question emporte', async () => {
    const fixture = await render(3);

    await click(fixture, '.toggle');
    await click(fixture, '.danger');

    expect(menu(fixture.nativeElement)).toContain(
      'Retirer les 3 articles de la liste ?',
    );

    // Le singulier français vaut aussi pour un : c'est `Intl.PluralRules` qui
    // le tranche, pas un `count === 1` écrit à la main.
    fixture.componentRef.setInput('total', 1);
    await fixture.whenStable();

    expect(menu(fixture.nativeElement)).toContain(
      'Retirer 1 article de la liste ?',
    );
  });

  it('ne vide rien avant la confirmation', async () => {
    // Vider ne s'annule pas : l'écran n'offre aucun retour en arrière.
    const fixture = await render();
    let cleared = 0;
    fixture.componentInstance.cleared.subscribe(() => (cleared += 1));

    await click(fixture, '.toggle');
    await click(fixture, '.danger');
    expect(cleared).toBe(0);

    await click(fixture, '.danger');

    expect(cleared).toBe(1);
  });

  it('renonce sans rien vider, menu refermé', async () => {
    const fixture = await render();
    let cleared = 0;
    fixture.componentInstance.cleared.subscribe(() => (cleared += 1));

    await click(fixture, '.toggle');
    await click(fixture, '.danger');
    await click(fixture, '[role="menuitem"]:not(.danger)');

    expect(cleared).toBe(0);
    expect(menu(fixture.nativeElement)).toBeNull();
  });
});
