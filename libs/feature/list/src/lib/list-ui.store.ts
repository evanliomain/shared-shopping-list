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
 * En deçà de ce défilement, le bouton flottant est toujours là : le haut de la
 * liste est l'endroit où l'on arrive, et où l'on ajoute.
 */
const FAB_REVEAL_PX = 24;

/**
 * Amplitude en dessous de laquelle un défilement ne compte pas. Sans ce seuil,
 * un pouce posé sur l'écran ferait clignoter le bouton.
 */
const FAB_SLOP_PX = 8;

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
  /**
   * Instant d'ouverture du panneau, en millisecondes. Ce qui est entré dans la
   * liste depuis fait la pile de pastilles annulables. Zéro : panneau fermé.
   */
  readonly pickingSince: number;
  /**
   * Le bouton flottant s'est retiré, parce qu'on défile vers l'avant de la
   * liste. Il revient dès qu'on remonte.
   */
  readonly fabHidden: boolean;
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
  pickingSince: 0,
  fabHidden: false,
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

    /**
     * Dernier défilement observé. Hors de l'état pour la même raison : on ne le
     * lit que pour en déduire un sens, jamais pour l'afficher.
     */
    let lastScrollTop = 0;

    /**
     * Ouvrir le panneau redémarre la pile d'ajouts. Idempotent : taper dans un
     * champ déjà ouvert ne doit pas effacer les pastilles de la session.
     */
    const startPicking = (): void => {
      if (store.picking()) {
        return;
      }

      patchState(store, {
        picking: true,
        pickingSince: Date.now(),
        fabHidden: false,
      });
    };

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
        startPicking();
        patchState(store, { query });
      },
      startPicking,
      stopPicking(): void {
        patchState(store, {
          picking: false,
          pickingSince: 0,
          query: '',
          fabHidden: false,
        });
      },
      /**
       * Note un défilement du corps de liste, et en déduit le sort du bouton
       * flottant : il se retire vers l'avant de la liste, revient dès qu'on
       * remonte. Lire sa liste ne se fait pas avec un bouton posé dessus.
       */
      noteScroll(top: number): void {
        const previous = lastScrollTop;
        lastScrollTop = top;

        if (FAB_REVEAL_PX >= top) {
          patchState(store, { fabHidden: false });
          return;
        }

        const delta = top - previous;
        if (FAB_SLOP_PX > Math.abs(delta)) {
          return;
        }

        patchState(store, { fabHidden: 0 < delta });
      },
      /** Après un ajout : on vide la saisie mais on laisse le panneau ouvert. */
      clearQuery(): void {
        patchState(store, { query: '' });
      },
      toggleChecked(): void {
        patchState(store, ({ showChecked }) => ({ showChecked: !showChecked }));
      },
      toggleMenu(itemId: ItemId): void {
        patchState(
          store,
          ({ openMenuFor }): Partial<ListUiState> => ({
            openMenuFor: openMenuFor === itemId ? null : itemId,
            // Deux popovers ouverts en même temps, sur un écran de téléphone,
            // c'est un de trop.
            listMenu: 'closed',
          }),
        );
      },
      closeMenu(): void {
        patchState(store, { openMenuFor: null });
      },
      toggleListMenu(): void {
        patchState(
          store,
          ({ listMenu }): Partial<ListUiState> => ({
            listMenu: 'closed' === listMenu ? 'open' : 'closed',
            openMenuFor: null,
          }),
        );
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
