import { TestBed } from '@angular/core/testing';

import { AddButton, AddButtonVariant } from './add-button';

describe('AddButton', () => {
  async function render(
    variant: AddButtonVariant = 'floating',
    retracted = false,
  ) {
    const fixture = TestBed.createComponent(AddButton);
    fixture.componentRef.setInput('label', 'Ajouter un article');
    fixture.componentRef.setInput('variant', variant);
    fixture.componentRef.setInput('retracted', retracted);
    await fixture.whenStable();

    return fixture;
  }

  it('nomme le geste à voix haute quand il n’est qu’un ＋', async () => {
    // En pastille, le libellé n'existe que pour l'assistance vocale.
    const { nativeElement } = await render('floating');
    const button = nativeElement.querySelector('button');

    expect(button.getAttribute('aria-label')).toBe('Ajouter un article');
    expect(button.textContent.trim()).toBe('＋');
  });

  it('écrit le libellé quand l’ajout est l’écran', async () => {
    // En bloc, le libellé est lu par tout le monde : pas de doublon en
    // `aria-label`, qui remplacerait le texte visible au lieu de le doubler.
    const { nativeElement } = await render('block');
    const button = nativeElement.querySelector('button');

    expect(button.getAttribute('aria-label')).toBeNull();
    expect(button.textContent).toContain('Ajouter un article');
  });

  it('émet son geste', async () => {
    const fixture = await render();
    let pressed = false;
    fixture.componentInstance.pressed.subscribe(() => (pressed = true));

    fixture.nativeElement.querySelector('button').click();

    expect(pressed).toBe(true);
  });

  it('annonce son retrait au CSS', async () => {
    const at = await render('floating', false);
    expect(at.nativeElement.getAttribute('data-retracted')).toBe('false');

    const away = await render('floating', true);
    expect(away.nativeElement.getAttribute('data-retracted')).toBe('true');
    expect(away.nativeElement.getAttribute('data-variant')).toBe('floating');
  });
});
