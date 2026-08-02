import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { ItemId } from '@shopping-list/core/crdt';

/** Un article qu'on vient de cocher, et qu'on peut encore remettre. */
export interface UndoableCheck {
  readonly itemId: ItemId;
  readonly label: string;
}

/** Durée du bandeau d'annulation. Assez pour se rendre compte, pas plus. */
const UNDO_MS = 5000;

/**
 * Le menu de la liste, et son étape de confirmation.
 *
 * Un seul champ à trois valeurs plutôt que deux booléens : « fermé mais en
 * cours de confirmation » n'existe pas, et un état impossible qu'on ne peut
 * pas écrire est un état qu'on n'a pas à tester.
 */
export type ListMenuState = 'closed' | 'open' | 'confirmingClear';

interface ListUiState {
  /** Saisie en cours dans la barre d'ajout. */
  readonly query: string;
  /** Le panneau de suggestions est-il déployé ? */
  readonly picking: boolean;
  /** Le bloc « Dans le panier » est-il déployé ? */
  readonly showChecked: boolean;
  /** Ligne dont le menu est ouvert, s'il y en a une. */
  readonly openMenuFor: ItemId | null;
  /** Dernier article coché, tant que le bandeau d'annulation est affiché. */
  readonly undoable: UndoableCheck | null;
  /** Le menu de l'en-tête, celui qui porte « Vider la liste ». */
  readonly listMenu: ListMenuState;
}

const initial: ListUiState = {
  query: '',
  picking: false,
  showChecked: false,
  openMenuFor: null,
  undoable: null,
  listMenu: 'closed',
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
  withMethods((store) => {
    /**
     * Le minuteur du bandeau vit ici plutôt que dans l'état : sa valeur ne se
     * lit jamais, elle ne fait que s'annuler. La mettre dans le signal ferait
     * un rendu par article coché sans que rien ne change à l'écran.
     */
    let undoTimer: ReturnType<typeof setTimeout> | null = null;

    const stopUndoTimer = (): void => {
      if (null !== undoTimer) {
        clearTimeout(undoTimer);
        undoTimer = null;
      }
    };

    const dismissUndo = (): void => {
      stopUndoTimer();
      patchState(store, { undoable: null });
    };

    return {
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
        patchState(store, ({ openMenuFor }): Partial<ListUiState> => ({
          openMenuFor: openMenuFor === itemId ? null : itemId,
          // Deux popovers ouverts en même temps, sur un écran de téléphone,
          // c'est un de trop.
          listMenu: 'closed',
        }));
      },
      closeMenu(): void {
        patchState(store, { openMenuFor: null });
      },
      toggleListMenu(): void {
        patchState(store, ({ listMenu }): Partial<ListUiState> => ({
          listMenu: 'closed' === listMenu ? 'open' : 'closed',
          openMenuFor: null,
        }));
      },
      /**
       * Vider la liste ne s'annule pas : on demande confirmation dans le menu
       * lui-même, là où le doigt est déjà, plutôt que par une boîte système.
       */
      askClearList(): void {
        patchState(store, { listMenu: 'confirmingClear' });
      },
      closeListMenu(): void {
        patchState(store, { listMenu: 'closed' });
      },
      /**
       * Ouvre le bandeau d'annulation sur l'article qu'on vient de cocher.
       *
       * Seul le fait de cocher est annulable : c'est le geste qu'on fait au
       * jugé, en marchant, et le seul qui fasse disparaître une ligne de
       * l'écran. Décocher la fait revenir, ce qui est déjà son propre retour
       * en arrière.
       */
      noteChecked(undoable: UndoableCheck): void {
        stopUndoTimer();
        patchState(store, { undoable });
        undoTimer = setTimeout(dismissUndo, UNDO_MS);
      },
      dismissUndo,
      stopUndoTimer,
    };
  }),
  withHooks({
    // Quitter la page pendant les 5 secondes ne doit pas laisser un minuteur
    // qui écrira dans un store détruit.
    onDestroy: (store) => store.stopUndoTimer(),
  }),
);
