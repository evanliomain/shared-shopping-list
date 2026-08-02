import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { ItemId } from '@shopping-list/core/crdt';

interface ListUiState {
  /** Saisie en cours dans la barre d'ajout. */
  readonly query: string;
  /** Le panneau de suggestions est-il déployé ? */
  readonly picking: boolean;
  /** Le bloc « Dans le panier » est-il déployé ? */
  readonly showChecked: boolean;
  /** Ligne dont le menu est ouvert, s'il y en a une. */
  readonly openMenuFor: ItemId | null;
}

const initial: ListUiState = {
  query: '',
  picking: false,
  showChecked: false,
  openMenuFor: null,
};

/**
 * État d'écran de la page liste.
 *
 * Ces valeurs ne survivent pas à un rechargement et n'ont aucun intérêt dans
 * les DevTools de synchronisation : elles n'ont donc rien à faire dans le
 * Store NgRx. C'est exactement la frontière posée dans `docs/architecture.md` —
 * ce qui meurt avec le composant vit dans un SignalStore.
 */
export const ListUiStore = signalStore(
  withState(initial),
  withComputed(({ query }) => ({
    trimmedQuery: computed(() => query().trim()),
    hasQuery: computed(() => '' !== query().trim()),
  })),
  withMethods((store) => ({
    setQuery(query: string): void {
      // Taper ouvre le panneau : on ne veut pas d'un geste supplémentaire.
      patchState(store, { query, picking: true });
    },
    startPicking(): void {
      patchState(store, { picking: true });
    },
    stopPicking(): void {
      patchState(store, { picking: false, query: '' });
    },
    /** Après un ajout : on vide la saisie mais on laisse le panneau ouvert. */
    clearQuery(): void {
      patchState(store, { query: '' });
    },
    toggleChecked(): void {
      patchState(store, ({ showChecked }) => ({ showChecked: !showChecked }));
    },
    toggleMenu(itemId: ItemId): void {
      patchState(store, ({ openMenuFor }) => ({
        openMenuFor: openMenuFor === itemId ? null : itemId,
      }));
    },
    closeMenu(): void {
      patchState(store, { openMenuFor: null });
    },
  })),
);
