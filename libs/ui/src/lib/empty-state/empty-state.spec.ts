import { TestBed } from '@angular/core/testing';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  async function render(inputs: Record<string, string>) {
    const fixture = TestBed.createComponent(EmptyState);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('affiche le titre', async () => {
    const element = await render({ title: 'La liste est vide' });

    expect(element.querySelector('.title')?.textContent).toContain(
      'La liste est vide',
    );
  });

  it('n’affiche l’explication que si elle est fournie', async () => {
    const without = await render({ title: 'Vide' });
    expect(without.querySelector('.hint')).toBeNull();

    const withHint = await render({
      title: 'Vide',
      hint: 'Ajoutez un article',
    });
    expect(withHint.querySelector('.hint')?.textContent).toContain(
      'Ajoutez un article',
    );
  });

  it('utilise le caddie par défaut', async () => {
    const element = await render({ title: 'Vide' });

    expect(element.querySelector('.glyph')?.textContent?.trim()).toBe('🛒');
  });
});
