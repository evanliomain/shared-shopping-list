import { TestBed } from '@angular/core/testing';
import {
  ItemView,
  ProductImages,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { FakeProductImages } from '../testing/fake-product-images';
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
    canCreate = false,
    query = '',
    // Par défaut le contexte du bureau, où la barre porte son propre champ :
    // c'est là que vivent le champ, la validation clavier et le focus.
    wide = true,
  ) {
    const fixture = TestBed.createComponent(AddBar);
    fixture.componentRef.setInput('query', query);
    fixture.componentRef.setInput('picking', picking);
    fixture.componentRef.setInput('suggestions', suggestions);
    fixture.componentRef.setInput('canCreate', canCreate);
    fixture.componentRef.setInput('added', added);
    fixture.componentRef.setInput('wide', wide);
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

  it('rapporte la saisie lettre par lettre', async () => {
    // Les suggestions se réordonnent à la frappe : rien n'attend « Entrée ».
    const fixture = await render();
    const emitted: string[] = [];
    fixture.componentInstance.queryChanged.subscribe((v) => emitted.push(v));

    const field = fixture.nativeElement.querySelector('input');
    field.value = 'yao';
    field.dispatchEvent(new Event('input'));

    expect(emitted).toEqual(['yao']);
  });

  it('choisit une suggestion d’un appui, panneau ouvert', async () => {
    const fixture = await render();
    let picked: SuggestionView | undefined;
    fixture.componentInstance.picked.subscribe((v) => (picked = v));

    fixture.nativeElement.querySelector('.suggestion').click();

    expect(picked).toEqual(BASE);
  });

  it('propose de créer ce qui ne ressemble à rien de connu', async () => {
    const fixture = await render([], true, [], true, 'Rutabaga');
    let created: string | undefined;
    fixture.componentInstance.created.subscribe((v) => (created = v));

    const create = fixture.nativeElement.querySelector('.create');
    // Les guillemets français collent leur insécable : on compare à l'espace
    // près plutôt que d'écrire un caractère invisible dans l'attente.
    expect(create.textContent.replace(/\s+/g, ' ')).toContain(
      'Créer « Rutabaga »',
    );

    create.click();

    expect(created).toBe('Rutabaga');
  });

  it('explique un historique vide plutôt que de laisser un blanc', async () => {
    const { nativeElement } = await render([]);

    expect(nativeElement.querySelector('.hint').textContent).toContain(
      "Rien dans l'historique",
    );
  });

  it('ne porte pas de champ sur téléphone, mais garde sa sortie', async () => {
    // Sur téléphone, le champ est l'overlay `sl-add-control` posé par-dessus ;
    // la barre ne réserve que sa place. La sortie, elle, reste dans l'en-tête —
    // sans quoi, feuille ouverte sans rien ajouté, on ne pourrait plus fermer
    // au clavier.
    const { nativeElement } = await render([BASE], true, [], false, '', false);

    expect(nativeElement.querySelector('input')).toBeNull();
    expect(nativeElement.querySelector('.field-slot')).not.toBeNull();
    expect(nativeElement.querySelector('.done')).not.toBeNull();
  });

  describe('entrée au clavier', () => {
    /** Rejoue la validation du champ, et rend l'événement pour l'inspecter. */
    function submit(nativeElement: HTMLElement): Event {
      const event = new Event('submit', { cancelable: true });
      nativeElement.querySelector('form').dispatchEvent(event);

      return event;
    }

    it('prend la première suggestion, celle du haut du panneau', async () => {
      // Le geste rapide du bureau : taper, valider, enchaîner.
      const fixture = await render([
        BASE,
        { ...BASE, productId: 'product-2', label: 'Lait' },
      ]);
      let picked: SuggestionView | undefined;
      fixture.componentInstance.picked.subscribe((v) => (picked = v));

      const event = submit(fixture.nativeElement);

      expect(picked).toEqual(BASE);
      // Sans ça, valider rechargerait la page au lieu d'ajouter l'article.
      expect(event.defaultPrevented).toBe(true);
    });

    it('crée le produit quand rien ne correspond à la saisie', async () => {
      const fixture = await render([], true, [], true, 'Rutabaga');
      let created: string | undefined;
      fixture.componentInstance.created.subscribe((v) => (created = v));

      submit(fixture.nativeElement);

      expect(created).toBe('Rutabaga');
    });

    it('ne crée rien sur un champ vide', async () => {
      const fixture = await render([]);
      let touched = false;
      fixture.componentInstance.picked.subscribe(() => (touched = true));
      fixture.componentInstance.created.subscribe(() => (touched = true));

      submit(fixture.nativeElement);

      expect(touched).toBe(false);
    });
  });

  describe('ajouts enchaînés', () => {
    it('n’affiche ni décompte ni pastille tant que rien n’est entré', async () => {
      const { nativeElement } = await render();

      expect(nativeElement.querySelector('.tally-count')).toBeNull();
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

    it('porte une sortie permanente : « Fermer » à vide, « Terminé » ensuite', async () => {
      // La sortie vit dans l'en-tête, toujours présente et atteignable au
      // clavier ; son libellé dit s'il s'agit d'annuler (rien ajouté) ou de
      // conclure une série.
      const empty = await render([BASE], true, []);
      expect(empty.nativeElement.querySelector('.done').textContent).toContain(
        'Fermer',
      );

      const chained = await render([BASE], true, [ADDED]);
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
