import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductImages, SuggestionView } from '@shopping-list/data-access/shopping';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { FakeProductImages } from '../testing/fake-product-images';
import { Dictation, DictationReceipt } from './dictation';

const YAOURT: SuggestionView = {
  productId: 'product-1',
  label: 'Yaourt nature',
  description: '',
  defaultQty: '',
  imageRef: 'blob:a3f9c2d1e8b47f05',
  emoji: '🍦',
  aisle: 'cremerie',
  usage: 3,
  lastUsedAt: 0,
  alreadyInList: false,
};

interface Options {
  readonly open?: boolean;
  readonly retracted?: boolean;
  readonly query?: string;
  readonly suggestions?: readonly SuggestionView[];
  readonly receipt?: DictationReceipt | null;
  readonly counter?: number;
}

describe('Dictation', () => {
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function render(options: Options = {}) {
    const fixture = TestBed.createComponent(Dictation);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('retracted', options.retracted ?? false);
    fixture.componentRef.setInput('query', options.query ?? '');
    fixture.componentRef.setInput('suggestions', options.suggestions ?? [YAOURT]);
    fixture.componentRef.setInput('receipt', options.receipt ?? null);
    fixture.componentRef.setInput('counter', options.counter ?? 0);
    fixture.componentRef.setInput('fabLabel', 'Ajouter un article');
    fixture.componentRef.setInput('placeholder', 'Article dicté…');
    await fixture.whenStable();
    return fixture;
  }

  function counts(fixture: ComponentFixture<Dictation>): HTMLButtonElement[] {
    return [...fixture.nativeElement.querySelectorAll('.count')];
  }

  describe('au repos, un bouton flottant', () => {
    it('est un bouton nommé, sans le plein écran', async () => {
      const { nativeElement } = await render({ open: false });

      expect(nativeElement.getAttribute('role')).toBe('button');
      expect(nativeElement.getAttribute('aria-label')).toBe(
        'Ajouter un article',
      );
      expect(nativeElement.querySelector('.surface')).toBeNull();
      expect(nativeElement.querySelector('.disc')).not.toBeNull();
    });

    it('ouvre la dictée quand on le tape', async () => {
      const fixture = await render({ open: false });
      let opened = false;
      fixture.componentInstance.pressed.subscribe(() => (opened = true));

      fixture.nativeElement.click();

      expect(opened).toBe(true);
    });

    it('ouvre la dictée à la touche Entrée', async () => {
      const fixture = await render({ open: false });
      let opened = false;
      fixture.componentInstance.pressed.subscribe(() => (opened = true));

      fixture.nativeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );

      expect(opened).toBe(true);
    });

    it('reflète son retrait au défilement', async () => {
      const { nativeElement } = await render({ open: false, retracted: true });

      expect(nativeElement.getAttribute('data-retracted')).toBe('true');
    });

    it('ignore le tap qui vient de l’intérieur une fois ouvert', async () => {
      // Ouvert, l'hôte n'est plus le bouton : un tap n'ouvre pas une seconde
      // fois.
      const fixture = await render({ open: true });
      let opened = false;
      fixture.componentInstance.pressed.subscribe(() => (opened = true));

      fixture.nativeElement.click();
      fixture.nativeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );

      expect(opened).toBe(false);
      expect(fixture.nativeElement.getAttribute('role')).toBeNull();
    });
  });

  describe('ouvert, le plein écran', () => {
    it('donne le focus au champ', async () => {
      const { nativeElement } = await render({ open: true });

      // Le focus attend la frame suivante : on la laisse passer avant de
      // vérifier.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      expect(nativeElement.querySelector('input')).toBe(
        nativeElement.ownerDocument.activeElement,
      );
    });

    it('remonte la saisie à chaque lettre', async () => {
      const fixture = await render();
      let query = '';
      fixture.componentInstance.queryChanged.subscribe((q) => (query = q));

      const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
      input.value = 'yao';
      input.dispatchEvent(new Event('input'));

      expect(query).toBe('yao');
    });

    it('ferme la dictée depuis « Terminé »', async () => {
      const fixture = await render();
      let dismissed = false;
      fixture.componentInstance.dismissed.subscribe(() => (dismissed = true));

      fixture.nativeElement.querySelector('.done').click();

      expect(dismissed).toBe(true);
    });

    it('ferme la dictée à Échap', async () => {
      const fixture = await render();
      let dismissed = false;
      fixture.componentInstance.dismissed.subscribe(() => (dismissed = true));

      fixture.nativeElement
        .querySelector('input')
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );

      expect(dismissed).toBe(true);
    });

    it('affiche « Fréquents » sur un champ vide', async () => {
      const { nativeElement } = await render({ query: '' });

      expect(nativeElement.querySelector('.kicker').textContent).toContain(
        'Fréquents',
      );
      expect(nativeElement.querySelector('.hint')).toBeNull();
    });

    it('annonce la création quand rien ne correspond', async () => {
      const { nativeElement } = await render({
        query: 'Rutabaga',
        suggestions: [],
      });

      expect(nativeElement.querySelector('.hint').textContent).toContain(
        'Rutabaga',
      );
      expect(nativeElement.querySelector('.kicker')).toBeNull();
    });
  });

  describe('la rangée de validation', () => {
    it('est éteinte tant que le champ est vide', async () => {
      const fixture = await render({ query: '' });

      expect(counts(fixture).every((b) => b.disabled)).toBe(true);
    });

    it('valide l’article avec le compte du bouton', async () => {
      const fixture = await render({ query: 'yao' });
      const quantities: number[] = [];
      fixture.componentInstance.quantified.subscribe((n) => quantities.push(n));

      // ＋1, ＋2, ＋4 dans l'ordre : le second porte 2.
      counts(fixture)[1].click();

      expect(quantities).toEqual([2]);
    });

    it('vaut ＋1 à la touche Entrée', async () => {
      const fixture = await render({ query: 'yao' });
      const quantities: number[] = [];
      fixture.componentInstance.quantified.subscribe((n) => quantities.push(n));

      fixture.nativeElement
        .querySelector('input')
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );

      expect(quantities).toEqual([1]);
    });

    it('n’ajoute rien à Entrée sur un champ vide', async () => {
      const fixture = await render({ query: '   ' });
      let added = false;
      fixture.componentInstance.quantified.subscribe(() => (added = true));

      fixture.nativeElement
        .querySelector('input')
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );

      expect(added).toBe(false);
    });
  });

  describe('les suggestions', () => {
    it('complètent le champ sans ajouter', async () => {
      const fixture = await render({ query: 'yao' });
      let picked: SuggestionView | null = null;
      let added = false;
      fixture.componentInstance.picked.subscribe((s) => (picked = s));
      fixture.componentInstance.quantified.subscribe(() => (added = true));

      fixture.nativeElement.querySelector('.suggestion').click();

      expect(picked).toBe(YAOURT);
      expect(added).toBe(false);
    });
  });

  describe('le reçu d’une ligne', () => {
    it('nomme le dernier ajout et sa quantité', async () => {
      const { nativeElement } = await render({
        receipt: { label: 'Yaourt nature', quantity: '×4', delta: null },
      });

      const receipt = nativeElement.querySelector('.receipt');
      expect(receipt.textContent).toContain('Yaourt nature');
      expect(receipt.textContent).toContain('×4');
      expect(receipt.querySelector('.delta')).toBeNull();
    });

    it('montre le compte tout juste ajouté sur un doublon', async () => {
      const { nativeElement } = await render({
        receipt: { label: 'Yaourt nature', quantity: '×6', delta: 2 },
      });

      expect(nativeElement.querySelector('.delta').textContent).toContain('+2');
    });

    it('défait le dernier ajout', async () => {
      const fixture = await render({
        receipt: { label: 'Yaourt nature', quantity: '×4', delta: null },
      });
      let undone = false;
      fixture.componentInstance.undone.subscribe(() => (undone = true));

      fixture.nativeElement.querySelector('.receipt .undo').click();

      expect(undone).toBe(true);
    });
  });

  describe('le compteur', () => {
    it('affiche le nombre dicté', async () => {
      const { nativeElement } = await render({ counter: 13 });

      expect(nativeElement.querySelector('.counter-num').textContent).toBe('13');
    });
  });

  describe('le clavier virtuel', () => {
    it('remonte la rangée de la hauteur du clavier', async () => {
      // Le champ est en haut ; sans ce décalage, un clavier ancré en bas
      // recouvrirait la rangée de validation.
      const listeners: Record<string, (() => void)[]> = {};
      const viewport = {
        height: 500,
        offsetTop: 0,
        addEventListener: (type: string, listener: () => void) =>
          (listeners[type] ??= []).push(listener),
        removeEventListener: (type: string, listener: () => void) => {
          listeners[type] = (listeners[type] ?? []).filter(
            (l) => l !== listener,
          );
        },
      };
      Object.defineProperty(window, 'visualViewport', {
        value: viewport,
        configurable: true,
      });
      Object.defineProperty(window, 'innerHeight', {
        value: 900,
        configurable: true,
      });

      const fixture = await render({ open: true });
      listeners['resize'].forEach((l) => l());
      await fixture.whenStable();

      expect(fixture.nativeElement.style.getPropertyValue('--sl-kb')).toBe(
        '400px',
      );

      // Détruit, il ne laisse aucun écouteur derrière lui.
      fixture.destroy();
      expect(listeners['resize']).toHaveLength(0);

      Reflect.deleteProperty(window, 'visualViewport');
    });
  });
});
