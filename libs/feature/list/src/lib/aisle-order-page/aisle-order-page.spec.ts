import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Action, provideStore, Store } from '@ngrx/store';
import {
  ensureList,
  readSnapshot,
  setAisleOrder,
} from '@shopping-list/core/crdt';
import {
  crdtActions,
  DEFAULT_LIST_ID,
  listActions,
  shoppingFeature,
} from '@shopping-list/data-access/shopping';
import { AISLES } from '@shopping-list/util/categories';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';
import * as Y from 'yjs';

import { AisleOrderPage } from './aisle-order-page';

const NOW = 1_764_000_000_000;

/**
 * On sème l'ordre par le vrai CRDT puis on projette, comme l'application : ce
 * que la page affiche ne peut donc pas être un état impossible à produire.
 */
async function render(seed?: (doc: Y.Doc) => void) {
  const doc = new Y.Doc({ gc: true });
  ensureList(doc, DEFAULT_LIST_ID, 'Maison', NOW);
  seed?.(doc);

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      provideTestI18n(),
      provideStore({ [shoppingFeature.name]: shoppingFeature.reducer }),
    ],
  });

  const store = TestBed.inject(Store);
  store.dispatch(crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }));

  // La page ne parle au CRDT que par des actions, interceptées par un effect :
  // les recueillir suffit à savoir ce qu'elle a demandé.
  const dispatched: Action[] = [];
  store.dispatch = ((action: Action) => dispatched.push(action)) as never;

  const fixture = TestBed.createComponent(AisleOrderPage);
  await fixture.whenStable();

  return { fixture, dispatched, el: fixture.nativeElement as HTMLElement };
}

function rows(el: HTMLElement): HTMLLIElement[] {
  return [...el.querySelectorAll('li')];
}

function labels(el: HTMLElement): string[] {
  return rows(el).map((li) =>
    (li.querySelector('.label')?.textContent ?? '').trim(),
  );
}

/** Les deux flèches d'une ligne : [monter, descendre]. */
function moves(li: HTMLElement): HTMLButtonElement[] {
  return [...li.querySelectorAll<HTMLButtonElement>('.move')];
}

function lastOrder(dispatched: readonly Action[]): readonly string[] {
  const action = dispatched.at(-1) as ReturnType<
    typeof listActions.rayonsRéordonnés
  >;
  expect(action.type).toBe(listActions.rayonsRéordonnés.type);
  return action.order;
}

describe('AisleOrderPage', () => {
  it('liste tous les rayons dans l’ordre de parcours par défaut', async () => {
    const { el } = await render();

    expect(rows(el)).toHaveLength(AISLES.length);
    expect(labels(el)[0]).toBe('Fruits & légumes');
    expect(labels(el).at(-1)).toBe('Divers');
  });

  it('reflète l’ordre déjà réglé pour la liste', async () => {
    const { el } = await render((doc) =>
      setAisleOrder(doc, DEFAULT_LIST_ID, ['auto', 'cave']),
    );

    expect(labels(el).slice(0, 2)).toEqual(['Auto & moto', 'Cave']);
  });

  it('descend un rayon et enregistre l’ordre entier', async () => {
    const { el, dispatched } = await render();

    moves(rows(el)[0])[1].click();

    const expected = [...AISLES];
    [expected[0], expected[1]] = [expected[1], expected[0]];
    expect(lastOrder(dispatched)).toEqual(expected);
  });

  it('monte un rayon d’un cran', async () => {
    const { el, dispatched } = await render();

    moves(rows(el)[1])[0].click();

    const expected = [...AISLES];
    [expected[0], expected[1]] = [expected[1], expected[0]];
    expect(lastOrder(dispatched)).toEqual(expected);
  });

  it('bloque la montée du premier et la descente du dernier', async () => {
    // Une extrémité ne bouge pas dans ce sens : le bouton est désactivé plutôt
    // que d'échanger avec un voisin qui n'existe pas.
    const { el } = await render();

    expect(moves(rows(el)[0])[0].disabled).toBe(true);
    expect(moves(rows(el)[0])[1].disabled).toBe(false);

    const last = rows(el).at(-1) as HTMLElement;
    expect(moves(last)[0].disabled).toBe(false);
    expect(moves(last)[1].disabled).toBe(true);
  });

  it('rétablit le parcours par défaut par un ordre vide', async () => {
    const { el, dispatched } = await render((doc) =>
      setAisleOrder(doc, DEFAULT_LIST_ID, ['auto', 'cave']),
    );

    el.querySelector<HTMLButtonElement>('.reset')?.click();

    expect(lastOrder(dispatched)).toEqual([]);
  });

  it('revient en arrière sans toucher au reste', async () => {
    const { el } = await render();
    const back = vi.spyOn(TestBed.inject(Location), 'back');

    el.querySelector<HTMLButtonElement>('.back')?.click();

    expect(back).toHaveBeenCalledOnce();
  });

  it('nomme le rayon dans l’intitulé des flèches', async () => {
    // Un glyphe seul ne dit rien : « Monter Cave » se lit, « ▲ » non.
    const { el } = await render((doc) =>
      setAisleOrder(doc, DEFAULT_LIST_ID, ['cave']),
    );

    const [up, down] = moves(rows(el)[0]);
    expect(up.getAttribute('aria-label')).toBe('Monter Cave');
    expect(down.getAttribute('aria-label')).toBe('Descendre Cave');
  });
});
