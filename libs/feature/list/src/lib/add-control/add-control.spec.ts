import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddControl } from './add-control';

describe('AddControl', () => {
  async function render(
    open: boolean,
    retracted = false,
  ): Promise<ComponentFixture<AddControl>> {
    const fixture = TestBed.createComponent(AddControl);
    fixture.componentRef.setInput('open', open);
    fixture.componentRef.setInput('retracted', retracted);
    fixture.componentRef.setInput('query', '');
    fixture.componentRef.setInput('label', 'Ajouter un article');
    fixture.componentRef.setInput('placeholder', 'Ajouter un article…');
    await fixture.whenStable();

    return fixture;
  }

  it('est un bouton au repos, et ouvre la feuille au tap', async () => {
    const fixture = await render(false);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('button');
    expect(host.getAttribute('aria-label')).toBe('Ajouter un article');

    let pressed = 0;
    fixture.componentInstance.pressed.subscribe(() => (pressed += 1));
    host.click();

    expect(pressed).toBe(1);
  });

  it('n’est plus un bouton une fois ouvert, et le tap n’y rouvre rien', async () => {
    // Ouvert, l'hôte est le champ, pas un bouton : un tap y laisse la saisie.
    const fixture = await render(true);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBeNull();

    let pressed = 0;
    fixture.componentInstance.pressed.subscribe(() => (pressed += 1));
    host.click();

    expect(pressed).toBe(0);
  });

  it('rapporte la saisie du champ, lettre par lettre', async () => {
    const fixture = await render(true);
    const emitted: string[] = [];
    fixture.componentInstance.queryChanged.subscribe((v) => emitted.push(v));

    const input = fixture.nativeElement.querySelector('input');
    input.value = 'caf';
    input.dispatchEvent(new Event('input'));

    expect(emitted).toEqual(['caf']);
  });

  it('valide au clavier par « Entrée », à la page d’en décider', async () => {
    const fixture = await render(true);
    let submitted = 0;
    fixture.componentInstance.submitted.subscribe(() => (submitted += 1));

    const input = fixture.nativeElement.querySelector('input');
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(submitted).toBe(1);
  });

  it('donne le focus au champ dès l’ouverture', async () => {
    // Le nœud s'ouvre loin du champ : sans ce rappel, il faudrait un second
    // geste pour se mettre à taper.
    const fixture = await render(false);
    const input = fixture.nativeElement.querySelector('input');
    expect(input).not.toBe(document.activeElement);

    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();

    expect(input).toBe(document.activeElement);
  });
});
