import { TestBed } from '@angular/core/testing';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';
import { Theme } from '@shopping-list/util/theme';

import { ThemeSwitch } from './theme-switch';

describe('ThemeSwitch', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });
  });

  async function render(theme: Theme) {
    const fixture = TestBed.createComponent(ThemeSwitch);
    fixture.componentRef.setInput('theme', theme);
    await fixture.whenStable();

    return fixture;
  }

  it('s’annonce comme un groupe de trois choix exclusifs', async () => {
    const { nativeElement } = await render('system');

    expect(
      nativeElement
        .querySelector('[role="radiogroup"]')
        .getAttribute('aria-label'),
    ).toBe('Thème');
    expect(
      [...nativeElement.querySelectorAll('[role="radio"]')].map((b) =>
        b.getAttribute('aria-label'),
      ),
    ).toEqual(['Thème clair', 'Thème sombre', 'Thème du système']);
  });

  it('marque le thème en cours, et lui seul', async () => {
    const { nativeElement } = await render('dark');

    expect(
      [...nativeElement.querySelectorAll('[role="radio"]')].map((b) =>
        b.getAttribute('aria-checked'),
      ),
    ).toEqual(['false', 'true', 'false']);
  });

  it('émet le thème demandé', async () => {
    const fixture = await render('system');
    const chosen: Theme[] = [];
    fixture.componentInstance.chosen.subscribe((t) => chosen.push(t));

    const [light, dark] =
      fixture.nativeElement.querySelectorAll('[role="radio"]');
    light.click();
    dark.click();

    expect(chosen).toEqual(['light', 'dark']);
  });
});
