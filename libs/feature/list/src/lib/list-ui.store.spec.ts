import { TestBed } from '@angular/core/testing';

import { ListUiStore } from './list-ui.store';

describe('ListUiStore', () => {
  function store() {
    TestBed.configureTestingModule({ providers: [ListUiStore] });
    return TestBed.inject(ListUiStore);
  }

  it('démarre fermé et vide', () => {
    const ui = store();

    expect(ui.query()).toBe('');
    expect(ui.picking()).toBe(false);
    expect(ui.showChecked()).toBe(false);
    expect(ui.openMenuFor()).toBeNull();
  });

  it('ouvre le panneau dès la première frappe', () => {
    // Sans ça, taper sans avoir cliqué d'abord ne montrerait aucune suggestion.
    const ui = store();
    ui.setQuery('yao');

    expect(ui.picking()).toBe(true);
    expect(ui.trimmedQuery()).toBe('yao');
    expect(ui.hasQuery()).toBe(true);
  });

  it('ne considère pas une saisie d’espaces comme une requête', () => {
    const ui = store();
    ui.setQuery('   ');

    expect(ui.hasQuery()).toBe(false);
    expect(ui.trimmedQuery()).toBe('');
  });

  it('vide la saisie mais garde le panneau ouvert après un ajout', () => {
    // On enchaîne souvent plusieurs ajouts : refermer à chaque fois obligerait
    // à rouvrir entre chaque article.
    const ui = store();
    ui.setQuery('lait');
    ui.clearQuery();

    expect(ui.query()).toBe('');
    expect(ui.picking()).toBe(true);
  });

  it('referme et vide en quittant le panneau', () => {
    const ui = store();
    ui.setQuery('lait');
    ui.stopPicking();

    expect(ui.query()).toBe('');
    expect(ui.picking()).toBe(false);
  });

  it('n’ouvre qu’un menu de ligne à la fois', () => {
    const ui = store();

    ui.toggleMenu('item-1');
    expect(ui.openMenuFor()).toBe('item-1');

    ui.toggleMenu('item-2');
    expect(ui.openMenuFor()).toBe('item-2');

    ui.toggleMenu('item-2');
    expect(ui.openMenuFor()).toBeNull();
  });

  it('demande confirmation avant de vider la liste', () => {
    // Vider ne s'annule pas : le menu doit passer par une question.
    const ui = store();

    ui.toggleListMenu();
    expect(ui.listMenu()).toBe('open');

    ui.askClearList();
    expect(ui.listMenu()).toBe('confirmingClear');

    ui.closeListMenu();
    expect(ui.listMenu()).toBe('closed');
  });

  it('n’ouvre jamais deux popovers à la fois', () => {
    const ui = store();

    ui.toggleMenu('item-1');
    ui.toggleListMenu();
    expect(ui.openMenuFor()).toBeNull();
    expect(ui.listMenu()).toBe('open');

    ui.toggleMenu('item-1');
    expect(ui.listMenu()).toBe('closed');
    expect(ui.openMenuFor()).toBe('item-1');
  });

  it('bascule l’affichage du panier', () => {
    const ui = store();

    ui.toggleChecked();
    expect(ui.showChecked()).toBe(true);

    ui.toggleChecked();
    expect(ui.showChecked()).toBe(false);
  });

  describe('fenêtre des ajouts', () => {
    it('date l’ouverture du panneau, et l’oublie en refermant', () => {
      const ui = store();
      expect(ui.pickingSince()).toBe(0);

      ui.startPicking();
      expect(ui.pickingSince()).toBeGreaterThan(0);

      ui.stopPicking();
      expect(ui.pickingSince()).toBe(0);
    });

    it('ne redate pas un panneau déjà ouvert', () => {
      // Sinon taper dans le champ effacerait la pile de pastilles à chaque
      // caractère, et l'enchaînement perdrait son filet.
      const ui = store();
      ui.startPicking();
      const opened = ui.pickingSince();

      ui.setQuery('lai');
      ui.startPicking();

      expect(ui.pickingSince()).toBe(opened);
    });
  });

  describe('bouton flottant', () => {
    it('se retire vers l’avant de la liste et revient en remontant', () => {
      const ui = store();

      ui.noteScroll(200);
      expect(ui.fabHidden()).toBe(true);

      ui.noteScroll(150);
      expect(ui.fabHidden()).toBe(false);
    });

    it('ignore les défilements sous le seuil', () => {
      // Un pouce posé sur l'écran ne doit pas faire clignoter le bouton.
      const ui = store();
      ui.noteScroll(200);

      ui.noteScroll(196);

      expect(ui.fabHidden()).toBe(true);
    });

    it('est toujours là en haut de liste', () => {
      // C'est là qu'on arrive, et là qu'on ajoute.
      const ui = store();
      ui.noteScroll(400);
      expect(ui.fabHidden()).toBe(true);

      ui.noteScroll(0);

      expect(ui.fabHidden()).toBe(false);
    });

    it('revient en refermant le panneau', () => {
      const ui = store();
      ui.noteScroll(300);

      ui.startPicking();
      expect(ui.fabHidden()).toBe(false);

      ui.noteScroll(600);
      ui.stopPicking();
      expect(ui.fabHidden()).toBe(false);
    });
  });
});
