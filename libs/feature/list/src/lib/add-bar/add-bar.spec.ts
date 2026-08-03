import { TestBed } from '@angular/core/testing';
import {
  ProductImages,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { AddBar } from './add-bar';

const BASE: SuggestionView = {
  productId: 'product-1',
  label: 'Yaourt',
  description: '',
  defaultQty: 'x4',
  imageRef: 'blob:a3f9c2d1e8b47f05',
  emoji: '🍦',
  aisle: 'cremerie',
  usage: 3,
  lastUsedAt: 0,
  alreadyInList: false,
};

/**
 * Faux service de photos : la vraie résolution passe par IndexedDB, que jsdom
 * n'implémente pas. Seul compte ici ce que le composant fait de l'URL.
 */
class FakeProductImages {
  readonly ensured: (string | null)[][] = [];
  url: string | null = null;

  urlFor(): string | null {
    return this.url;
  }

  ensure(refs: readonly (string | null)[]): void {
    this.ensured.push([...refs]);
  }
}

describe('AddBar', () => {
  let images: FakeProductImages;

  beforeEach(() => {
    images = new FakeProductImages();
    TestBed.configureTestingModule({
      providers: [
        provideTestI18n(),
        { provide: ProductImages, useValue: images },
      ],
    });
  });

  async function render(
    suggestions: readonly SuggestionView[] = [BASE],
    picking = true,
  ) {
    const fixture = TestBed.createComponent(AddBar);
    fixture.componentRef.setInput('query', '');
    fixture.componentRef.setInput('picking', picking);
    fixture.componentRef.setInput('suggestions', suggestions);
    fixture.componentRef.setInput('canCreate', false);
    await fixture.whenStable();

    return fixture;
  }

  it('affiche la photo d’une suggestion quand elle est résolue', async () => {
    images.url = 'blob:http://localhost/photo';

    const { nativeElement } = await render();

    expect(
      nativeElement.querySelector('.suggestion img').getAttribute('src'),
    ).toBe('blob:http://localhost/photo');
  });

  it('retombe sur l’emoji tant que la photo n’est pas là', async () => {
    // L'état normal juste après un échange par QR : le produit est arrivé,
    // pas encore son image.
    const { nativeElement } = await render();

    expect(nativeElement.querySelector('.suggestion img')).toBeNull();
    expect(nativeElement.querySelector('.suggestion .glyph').textContent).toBe(
      '🍦',
    );
  });

  it('demande la résolution des suggestions affichées', async () => {
    await render();

    expect(images.ensured.at(-1)).toEqual(['blob:a3f9c2d1e8b47f05']);
  });

  it('ne résout rien quand le panneau est fermé', async () => {
    await render([BASE], false);

    expect(images.ensured).toEqual([]);
  });
});
