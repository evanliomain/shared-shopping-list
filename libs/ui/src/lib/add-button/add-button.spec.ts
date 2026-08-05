import { TestBed } from '@angular/core/testing';

import { AddButton } from './add-button';

describe('AddButton', () => {
  async function render() {
    const fixture = TestBed.createComponent(AddButton);
    fixture.componentRef.setInput('label', 'Ajouter un article');
    await fixture.whenStable();

    return fixture;
  }

  it('écrit son libellé, lu par tout le monde', async () => {
    // L'ajout est l'écran : le libellé est visible, pas seulement en aria — un
    // `aria-label` le doublerait en le remplaçant.
    const { nativeElement } = await render();
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
});
