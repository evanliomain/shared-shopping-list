import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ItemView,
  ProductImages,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { DictationPad } from '../dictation-pad/dictation-pad';
import { DictationReview } from '../dictation-review/dictation-review';
import { FakeProductImages } from '../testing/fake-product-images';
import { Dictation, DictationReceipt, DictationRequantify } from './dictation';

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

function entry(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: 'item-1',
    productId: 'product-1',
    label: 'Yaourt nature',
    description: '',
    qty: '1',
    note: null,
    checked: false,
    imageRef: null,
    emoji: '🍦',
    aisle: 'cremerie',
    unknownProduct: false,
    addedBy: 'Evan',
    createdAt: 0,
    ...overrides,
  };
}

interface Options {
  readonly open?: boolean;
  readonly retracted?: boolean;
  readonly query?: string;
  readonly suggestions?: readonly SuggestionView[];
  readonly receipt?: DictationReceipt | null;
  readonly entries?: readonly ItemView[];
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
    fixture.componentRef.setInput('entries', options.entries ?? []);
    fixture.componentRef.setInput('fabLabel', 'Ajouter un article');
    fixture.componentRef.setInput('placeholder', 'Article dicté…');
    await fixture.whenStable();
    return fixture;
  }

  function counts(fixture: ComponentFixture<Dictation>): HTMLButtonElement[] {
    return [...fixture.nativeElement.querySelectorAll('.count')];
  }

  function pad(fixture: ComponentFixture<Dictation>): DictationPad {
    return fixture.debugElement.query(By.directive(DictationPad))
      .componentInstance as DictationPad;
  }

  function review(fixture: ComponentFixture<Dictation>): DictationReview {
    return fixture.debugElement.query(By.directive(DictationReview))
      .componentInstance as DictationReview;
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
      const { nativeElement } = await render({
        entries: [entry({ id: 'a' }), entry({ id: 'b' })],
      });

      expect(nativeElement.querySelector('.counter-num').textContent).toBe('2');
    });

    it('reste éteint tant que rien n’a été dicté', async () => {
      const { nativeElement } = await render({ entries: [] });

      expect(nativeElement.querySelector('.counter').disabled).toBe(true);
    });
  });

  describe('le pavé de saisie libre', () => {
    it('remplace la saisie par le pavé quand on tape ＋…', async () => {
      const fixture = await render({ query: 'tomates' });

      // La rangée porte ＋1/＋2/＋4 puis ＋… en dernier.
      counts(fixture)[3].click();
      await fixture.whenStable();

      // Le pavé remplace la saisie : plus de champ, mais son propre écran.
      expect(fixture.nativeElement.querySelector('.field')).toBeNull();
      expect(pad(fixture).article()).toBe('tomates');
    });

    it('revient à la saisie au « Retour » du pavé', async () => {
      const fixture = await render({ query: 'tomates' });
      counts(fixture)[3].click();
      await fixture.whenStable();

      pad(fixture).back.emit();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.surface')).not.toBeNull();
      expect(fixture.debugElement.query(By.directive(DictationPad))).toBeNull();
    });

    it('remonte la quantité libre puis rend la saisie', async () => {
      const fixture = await render({ query: 'tomates' });
      const posed: string[] = [];
      fixture.componentInstance.freeQuantified.subscribe((q) => posed.push(q));
      counts(fixture)[3].click();
      await fixture.whenStable();

      pad(fixture).submitted.emit('500 g');
      await fixture.whenStable();

      expect(posed).toEqual(['500 g']);
      expect(fixture.nativeElement.querySelector('.surface')).not.toBeNull();
    });
  });

  describe('la relecture', () => {
    it('ouvre la relecture au tap du compteur', async () => {
      const fixture = await render({ entries: [entry()] });

      fixture.nativeElement.querySelector('.counter').click();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.field')).toBeNull();
      expect(review(fixture).entries()).toHaveLength(1);
    });

    async function openReview(query = '') {
      const fixture = await render({ query, entries: [entry()] });
      fixture.nativeElement.querySelector('.counter').click();
      await fixture.whenStable();
      return fixture;
    }

    it('revient à la saisie quand la relecture se referme', async () => {
      const fixture = await openReview();

      review(fixture).dismissed.emit();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.field')).not.toBeNull();
      expect(fixture.debugElement.query(By.directive(DictationReview))).toBeNull();
    });

    it('remonte le compte visé par le stepper, retrait sous 1', async () => {
      const fixture = await openReview();
      const changes: DictationRequantify[] = [];
      fixture.componentInstance.requantified.subscribe((c) => changes.push(c));
      const line = entry({ id: 'x', qty: '4' });

      review(fixture).stepped.emit({ item: line, count: 5 });
      review(fixture).stepped.emit({ item: line, count: 0 });

      expect(changes).toEqual([
        { item: line, qty: '5' },
        { item: line, qty: null },
      ]);
    });

    it('rouvre le pavé, amorcé, sur un ✎', async () => {
      const fixture = await openReview();

      review(fixture).edit.emit(entry({ label: 'Tomates', qty: '500 g' }));
      await fixture.whenStable();

      expect(pad(fixture).article()).toBe('Tomates');
      expect(
        (fixture.nativeElement.querySelector('.value-num') as HTMLInputElement)
          .value,
      ).toBe('500');
      expect(
        fixture.nativeElement.querySelector('.unit.chosen')?.textContent?.trim(),
      ).toBe('g');
    });

    it('repose la quantité rééditée et revient à la relecture', async () => {
      const fixture = await openReview();
      const changes: DictationRequantify[] = [];
      fixture.componentInstance.requantified.subscribe((c) => changes.push(c));
      const line = entry({ id: 'x', qty: '500 g' });
      review(fixture).edit.emit(line);
      await fixture.whenStable();

      pad(fixture).submitted.emit('750 g');
      await fixture.whenStable();

      expect(changes).toEqual([{ item: line, qty: '750 g' }]);
      expect(review(fixture).entries()).toHaveLength(1);
    });

    it('revient à la relecture au « Retour » d’une réédition', async () => {
      const fixture = await openReview();
      review(fixture).edit.emit(entry({ qty: '500 g' }));
      await fixture.whenStable();

      pad(fixture).back.emit();
      await fixture.whenStable();

      expect(fixture.debugElement.query(By.directive(DictationReview))).not.toBeNull();
      expect(fixture.debugElement.query(By.directive(DictationPad))).toBeNull();
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
