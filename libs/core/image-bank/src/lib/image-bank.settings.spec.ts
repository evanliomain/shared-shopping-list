import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { ImageBankSettings } from './image-bank.settings';

describe('ImageBankSettings', () => {
  function settings(): ImageBankSettings {
    TestBed.configureTestingModule({});
    return TestBed.inject(ImageBankSettings);
  }

  /** Un document dont le stockage est refusé, comme en navigation privée. */
  function documentSansStockage(): Document {
    return {
      defaultView: {
        get localStorage(): Storage {
          throw new DOMException('stockage refusé', 'SecurityError');
        },
      },
    } as unknown as Document;
  }

  /** L'effet qui persiste ne tourne qu'à la synchronisation suivante. */
  function settle(): void {
    TestBed.tick();
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('cherche une image d’office tant que rien n’a été refusé', () => {
    // C'est le comportement demandé : un article sans emoji reconnu mérite
    // mieux qu'un caddie générique.
    expect(settings().auto()).toBe(true);
  });

  it('retrouve le refus au démarrage suivant', () => {
    const premier = settings();
    premier.set(false);
    settle();

    TestBed.resetTestingModule();
    expect(settings().auto()).toBe(false);
  });

  it('retrouve l’autorisation rendue', () => {
    // Le retour en arrière compte autant que le refus : sans lui, couper
    // l'automatisme serait définitif.
    const premier = settings();
    premier.set(false);
    settle();
    premier.set(true);
    settle();

    TestBed.resetTestingModule();
    expect(settings().auto()).toBe(true);
  });

  it('bascule d’un geste', () => {
    const réglage = settings();

    réglage.toggle();
    expect(réglage.auto()).toBe(false);

    réglage.toggle();
    expect(réglage.auto()).toBe(true);
  });

  it('reste utilisable si le stockage est refusé', () => {
    // Navigation privée : le choix vaut pour la session, sans lever d'erreur.
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: documentSansStockage() }],
    });
    const réglage = TestBed.inject(ImageBankSettings);

    expect(réglage.auto()).toBe(true);

    réglage.set(false);
    settle();

    expect(réglage.auto()).toBe(false);
  });
});
