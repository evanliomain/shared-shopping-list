import { TestBed } from '@angular/core/testing';

import { ProductAvatar } from './product-avatar';

describe('ProductAvatar', () => {
  async function render(emoji: string, size?: 'md' | 'lg') {
    const fixture = TestBed.createComponent(ProductAvatar);
    fixture.componentRef.setInput('emoji', emoji);
    if (undefined !== size) {
      fixture.componentRef.setInput('size', size);
    }
    await fixture.whenStable();
    return fixture;
  }

  it('affiche l’emoji du produit', async () => {
    const fixture = await render('🍦');

    expect(fixture.nativeElement.textContent.trim()).toBe('🍦');
  });

  it('masque le glyphe aux lecteurs d’écran', async () => {
    // L'emoji double le libellé, déjà lu juste à côté : l'annoncer une seconde
    // fois n'apporterait rien.
    const fixture = await render('🍦');

    expect(
      fixture.nativeElement.querySelector('.glyph').getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('expose sa taille en attribut pour le style', async () => {
    const small = await render('🥕');
    expect(small.nativeElement.getAttribute('data-size')).toBe('md');

    const large = await render('🥕', 'lg');
    expect(large.nativeElement.getAttribute('data-size')).toBe('lg');
  });
});
