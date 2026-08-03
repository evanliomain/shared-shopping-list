import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { ThemeStore } from './theme';

describe('ThemeStore', () => {
  function store(): ThemeStore {
    TestBed.configureTestingModule({});
    return TestBed.inject(ThemeStore);
  }

  /**
   * Un document dont le stockage est refusé, comme en navigation privée : jsdom
   * livre toujours un `localStorage`, il faut donc le remplacer. Le service ne
   * lit rien d'autre que `documentElement` et `defaultView`.
   */
  function documentSansStockage(): Document {
    return {
      documentElement: document.createElement('html'),
      defaultView: {
        get localStorage(): Storage {
          throw new DOMException('stockage refusé', 'SecurityError');
        },
      },
    } as unknown as Document;
  }

  /** L'effet qui pose l'attribut ne tourne qu'à la synchronisation suivante. */
  function settle(): void {
    TestBed.tick();
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  it('suit le système tant que rien n’a été choisi', () => {
    const theme = store();
    settle();

    expect(theme.theme()).toBe('system');
    // Pas d'attribut : c'est la requête média qui décide, et qui continuera de
    // décider quand le téléphone basculera au coucher du soleil.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('pose l’attribut que lisent les jetons de style', () => {
    const theme = store();

    theme.set('dark');
    settle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    theme.set('light');
    settle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('retire l’attribut en revenant au système', () => {
    // Sans ce retrait, « système » resterait figé sur le dernier choix.
    const theme = store();
    theme.set('dark');
    settle();

    theme.set('system');
    settle();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('retrouve le choix au démarrage suivant', () => {
    const first = store();
    first.set('dark');
    settle();

    TestBed.resetTestingModule();
    expect(store().theme()).toBe('dark');
  });

  it('ignore une valeur de stockage qu’il ne connaît pas', () => {
    // Une clé bricolée à la main, ou écrite par une version future.
    localStorage.setItem('sl.theme', 'sépia');

    expect(store().theme()).toBe('system');
  });

  it('habille quand même la page si le stockage est refusé', () => {
    // Navigation privée, cookies bloqués : le thème du système est un repli
    // valable, et le choix de la session doit malgré tout se voir à l'écran.
    const sansStockage = documentSansStockage();
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: sansStockage }],
    });
    const theme = TestBed.inject(ThemeStore);

    expect(theme.theme()).toBe('system');

    theme.set('dark');
    settle();

    expect(sansStockage.documentElement.getAttribute('data-theme')).toBe(
      'dark',
    );
  });
});
