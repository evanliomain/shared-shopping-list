import { TestBed } from '@angular/core/testing';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { ViewMode } from '../list-ui.store';
import { ViewSwitch } from './view-switch';

describe('ViewSwitch', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });
  });

  async function render(mode: ViewMode) {
    const fixture = TestBed.createComponent(ViewSwitch);
    fixture.componentRef.setInput('mode', mode);
    await fixture.whenStable();

    return fixture;
  }

  it('s’annonce comme un groupe de deux choix exclusifs', async () => {
    const { nativeElement } = await render('aisle');

    expect(
      nativeElement
        .querySelector('[role="radiogroup"]')
        .getAttribute('aria-label'),
    ).toBe('Affichage de la liste');
    expect(
      [...nativeElement.querySelectorAll('[role="radio"]')].map((b) =>
        b.getAttribute('aria-label'),
      ),
    ).toEqual(['Par rayon', 'Par ajout récent']);
  });

  it('marque le mode en cours, et lui seul', async () => {
    const { nativeElement } = await render('recent');

    expect(
      [...nativeElement.querySelectorAll('[role="radio"]')].map((b) =>
        b.getAttribute('aria-checked'),
      ),
    ).toEqual(['false', 'true']);
  });

  it('émet le mode demandé', async () => {
    const fixture = await render('aisle');
    const chosen: ViewMode[] = [];
    fixture.componentInstance.chosen.subscribe((m) => chosen.push(m));

    const [aisle, recent] =
      fixture.nativeElement.querySelectorAll('[role="radio"]');
    recent.click();
    aisle.click();

    expect(chosen).toEqual(['recent', 'aisle']);
  });
});
