import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import { PluralPipe } from '@shopping-list/util/i18n';
import { Store } from '@ngrx/store';
import {
  filterSuggestions,
  ItemView,
  listActions,
  selectCheckedCount,
  selectCheckedItems,
  selectIsEmpty,
  selectListName,
  selectLoaded,
  selectPendingByAisle,
  selectItemViews,
  selectRemainingCount,
  ProductImages,
  selectSuggestions,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { RouterLink } from '@angular/router';
import { SyncRegistry } from '@shopping-list/core/sync';
import { EmptyState, SyncBadge, SyncBadgeStatus } from '@shopping-list/ui';
import { normalize } from '@shopping-list/util/categories';

import { AddBar } from '../add-bar/add-bar';
import { HistoryPane } from '../history-pane/history-pane';
import { ItemRow } from '../item-row/item-row';
import { ListUiStore } from '../list-ui.store';

@Component({
  selector: 'sl-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddBar,
    EmptyState,
    HistoryPane,
    ItemRow,
    PluralPipe,
    RouterLink,
    SyncBadge,
    TranslocoPipe,
  ],
  providers: [ListUiStore],
  templateUrl: './list-page.html',
  styleUrl: './list-page.scss',
})
export class ListPage {
  private readonly store = inject(Store);
  protected readonly ui = inject(ListUiStore);

  private readonly storedName = this.store.selectSignal(selectListName);
  private readonly fallbackName = translateSignal('app.defaultListName');

  /**
   * Le nom vient du CRDT, donc il manque avant le premier snapshot. Un titre
   * vide le temps qu'IndexedDB réponde serait pire qu'un nom par défaut.
   */
  protected readonly listName = computed(
    () => this.storedName() || this.fallbackName(),
  );

  protected readonly loaded = this.store.selectSignal(selectLoaded);
  protected readonly groups = this.store.selectSignal(selectPendingByAisle);
  protected readonly checkedItems = this.store.selectSignal(selectCheckedItems);
  protected readonly remaining = this.store.selectSignal(selectRemainingCount);
  protected readonly checkedCount = this.store.selectSignal(selectCheckedCount);
  protected readonly isEmpty = this.store.selectSignal(selectIsEmpty);

  /**
   * « 9 restants sur 13 » plutôt que « 9 articles à prendre » : le même
   * chiffre, mais qui dit aussi le chemin parcouru.
   */
  protected readonly total = computed(
    () => this.remaining() + this.checkedCount(),
  );

  protected readonly progress = computed(() => {
    const total = this.total();
    return 0 === total ? 0 : (this.checkedCount() / total) * 100;
  });

  private readonly registry = inject(SyncRegistry);
  protected readonly images = inject(ProductImages);

  /**
   * Sans appairage, on dit « appareil seul » plutôt que « hors ligne » : rien
   * n'est en panne, il n'y a simplement personne à qui parler.
   */
  protected readonly syncStatus = computed<SyncBadgeStatus>(() => {
    const github = this.registry.states().find((s) => 'github' === s.id);
    return undefined === github || 'idle' === github.status
      ? 'unpaired'
      : (github.status as SyncBadgeStatus);
  });

  protected readonly syncPending = computed(
    () => this.registry.states().find((s) => 'github' === s.id)?.pending ?? 0,
  );

  private readonly allSuggestions = this.store.selectSignal(selectSuggestions);

  private readonly itemImageRefs = computed(() =>
    this.store
      .selectSignal(selectItemViews)()
      .map((view) => view.imageRef),
  );

  /**
   * Le filtrage vit ici et non dans un selector : la requête change à chaque
   * frappe, ce qui invaliderait la mémoïsation à chaque caractère.
   */
  protected readonly suggestions = computed(() =>
    filterSuggestions(this.allSuggestions(), this.ui.trimmedQuery()),
  );

  /**
   * Proposer « Créer » seulement si rien d'existant ne porte exactement ce
   * libellé — sinon on fabriquerait des doublons dans l'historique, ce qui
   * ruinerait précisément ce à quoi il sert.
   */
  protected readonly canCreate = computed(() => {
    const query = normalize(this.ui.trimmedQuery());
    if ('' === query) {
      return false;
    }

    return !this.allSuggestions().some((s) => normalize(s.label) === query);
  });

  /**
   * Vrai quand l'écran est assez large pour afficher l'historique à côté.
   *
   * Un signal plutôt qu'une règle CSS : la colonne compte plusieurs centaines
   * de lignes, et les rendre pour les masquer coûterait sur téléphone
   * exactement là où on ne peut pas se le permettre.
   */
  protected readonly wide = signal(false);

  constructor() {
    // Les photos se résolvent au fil de l'eau, sans jamais retarder
    // l'affichage : `ensure` est idempotent et ne rend pas la main.
    effect(() => this.images.ensure(this.itemImageRefs()));

    this.watchWidth();
  }

  private watchWidth(): void {
    const view = inject(DOCUMENT).defaultView;
    if ('function' !== typeof view?.matchMedia) {
      return;
    }

    const query = view.matchMedia('(min-width: 1040px)');
    this.wide.set(query.matches);

    const onChange = (event: MediaQueryListEvent): void =>
      this.wide.set(event.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() =>
      query.removeEventListener('change', onChange),
    );
  }

  protected addExisting(suggestion: SuggestionView): void {
    this.store.dispatch(
      listActions.produitAjouté({ productId: suggestion.productId }),
    );
    this.ui.clearQuery();
  }

  /** Depuis la colonne historique : la barre d'ajout n'est pas concernée. */
  protected addFromHistory(suggestion: SuggestionView): void {
    this.store.dispatch(
      listActions.produitAjouté({ productId: suggestion.productId }),
    );
  }

  protected createAndAdd(label: string): void {
    this.store.dispatch(
      listActions.produitCrééEtAjouté({ draft: { label: label.trim() } }),
    );
    this.ui.clearQuery();
  }

  /** Une carte de rayon laisse dépasser son popover si le menu y est ouvert. */
  protected hasOpenMenu(items: readonly ItemView[]): boolean {
    const open = this.ui.openMenuFor();
    return null !== open && items.some((item) => item.id === open);
  }

  protected toggle(item: ItemView, checked: boolean): void {
    this.store.dispatch(listActions.articleCoché({ itemId: item.id, checked }));

    // Cocher fait disparaître la ligne du corps de liste. Décocher la fait
    // revenir : c'est déjà son propre retour en arrière, pas la peine d'un
    // bandeau.
    if (checked) {
      this.ui.noteChecked({ itemId: item.id, label: item.label });
    } else {
      this.ui.dismissUndo();
    }
  }

  protected undo(): void {
    const undoable = this.ui.undoable();
    if (null === undoable) {
      return;
    }

    this.ui.dismissUndo();
    this.store.dispatch(
      listActions.articleCoché({ itemId: undoable.itemId, checked: false }),
    );
  }

  protected remove(item: ItemView): void {
    this.ui.closeMenu();
    this.store.dispatch(listActions.articleRetiré({ itemId: item.id }));
  }

  protected clearChecked(): void {
    this.ui.dismissUndo();
    this.store.dispatch(listActions.articlesCochésVidés());
  }
}
