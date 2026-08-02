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

  it('bascule l’affichage du panier', () => {
    const ui = store();

    ui.toggleChecked();
    expect(ui.showChecked()).toBe(true);

    ui.toggleChecked();
    expect(ui.showChecked()).toBe(false);
  });
});
