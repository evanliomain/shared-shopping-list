import { TestBed } from '@angular/core/testing';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { ListUiStore } from '../list-ui.store';
import { ListMenu } from './list-menu';

describe('ListMenu', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestI18n(), ListUiStore],
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

  it('n’offre que « Vider la liste » à l’ouverture', async () => {
    // Une entrée unique, et c'est déjà une raison d'exister à part du « Vider »
    // du panier : l'un jette tout, l'autre seulement ce qui est pris.
    const fixture = await render();

    await click(fixture, '.toggle');

    expect(menu(fixture.nativeElement)).toBe('Vider la liste');
    expect(
      fixture.nativeElement
        .querySelector('.toggle')
        .getAttribute('aria-expanded'),
    ).toBe('true');
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
