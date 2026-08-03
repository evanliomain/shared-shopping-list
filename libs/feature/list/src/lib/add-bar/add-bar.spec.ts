import { TestBed } from '@angular/core/testing';
import {
  ItemView,
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

const ADDED: ItemView = {
  id: 'item-1',
  productId: 'product-1',
  label: 'Yaourt',
  unknownProduct: false,
  description: '',
  qty: '',
  note: null,
  checked: false,
  imageRef: 'emoji:🍦',
  emoji: '🍦',
  aisle: 'cremerie',
  addedBy: 'Evan',
  createdAt: 0,
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
    added: readonly ItemView[] = [],
  ) {
    const fixture = TestBed.createComponent(AddBar);
    fixture.componentRef.setInput('query', '');
    fixture.componentRef.setInput('picking', picking);
    fixture.componentRef.setInput('suggestions', suggestions);
    fixture.componentRef.setInput('canCreate', false);
    fixture.componentRef.setInput('added', added);
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

  describe('ajouts enchaînés', () => {
    it('n’affiche ni décompte ni pastille tant que rien n’est entré', async () => {
      const { nativeElement } = await render();

      expect(nativeElement.querySelector('.tally')).toBeNull();
      expect(nativeElement.querySelectorAll('.chip')).toHaveLength(0);
    });

    it('empile une pastille par article, avec son décompte', async () => {
      const { nativeElement } = await render([BASE], true, [
        ADDED,
        { ...ADDED, id: 'item-2', label: 'Lait' },
      ]);

      expect(nativeElement.querySelector('.tally-count').textContent).toContain(
        '2 articles ajoutés',
      );
      expect(
        [...nativeElement.querySelectorAll('.chip')].map((c) =>
          c.textContent.replace(/\s+/g, ' ').trim(),
        ),
      ).toEqual(['🍦 Yaourt ✕', '🍦 Lait ✕']);
    });

    it('défait un ajout par le ✕ de sa pastille', async () => {
      // Le filet de sécurité de l'enchaînement : pas de bandeau à chronométrer,
      // chaque ajout reste annulable tant que la feuille est ouverte.
      const fixture = await render([BASE], true, [ADDED]);
      let undone: ItemView | undefined;
      fixture.componentInstance.undone.subscribe((v) => (undone = v));

      fixture.nativeElement.querySelector('.chip .undo').click();

      expect(undone).toEqual(ADDED);
    });

    it('remplace « Fermer » par « Terminé », loin du champ', async () => {
      // Deux sorties à la fois, dont une sous le pouce qui enchaîne, c'est une
      // de trop.
      const empty = await render([BASE], true, []);
      expect(empty.nativeElement.querySelector('.close')).not.toBeNull();
      expect(empty.nativeElement.querySelector('.done')).toBeNull();

      const chained = await render([BASE], true, [ADDED]);
      expect(chained.nativeElement.querySelector('.close')).toBeNull();
      expect(
        chained.nativeElement.querySelector('.done').textContent,
      ).toContain('Terminé');
    });

    it('annonce l’article suivant dans le champ vidé', async () => {
      const { nativeElement } = await render([BASE], true, [ADDED]);

      expect(nativeElement.querySelector('input').placeholder).toBe(
        'Article suivant…',
      );
    });

    it('donne le focus au champ à l’ouverture', async () => {
      // La feuille s'ouvre par le bouton flottant, à distance du champ : sans
      // ce rappel, il faudrait un second geste pour taper.
      const fixture = await render([BASE], false);
      expect(fixture.nativeElement.querySelector('input')).not.toBe(
        document.activeElement,
      );

      fixture.componentRef.setInput('picking', true);
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('input')).toBe(
        document.activeElement,
      );
    });
  });
});
