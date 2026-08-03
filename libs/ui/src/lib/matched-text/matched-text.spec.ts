import { TestBed } from '@angular/core/testing';

import { MatchedText } from './matched-text';

describe('MatchedText', () => {
  async function render(text: string, query = '') {
    const fixture = TestBed.createComponent(MatchedText);
    fixture.componentRef.setInput('text', text);
    fixture.componentRef.setInput('query', query);
    await fixture.whenStable();

    return fixture.nativeElement as HTMLElement;
  }

  it('rend le texte entier, surligné ou non', async () => {
    // Le surlignage ne doit jamais faire disparaître un caractère.
    expect((await render('Yaourt à la vanille')).textContent).toBe(
      'Yaourt à la vanille',
    );
    expect((await render('Yaourt à la vanille', 'vanil')).textContent).toBe(
      'Yaourt à la vanille',
    );
  });

  it('marque ce que la saisie a trouvé', async () => {
    const host = await render('Chocolat noir', 'choc');

    expect(
      [...host.querySelectorAll('mark')].map((m) => m.textContent),
    ).toEqual(['Choc']);
  });

  it('ne marque rien sans saisie', async () => {
    const host = await render('Chocolat noir');

    expect(host.querySelector('mark')).toBeNull();
  });
});
