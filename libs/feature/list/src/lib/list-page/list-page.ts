import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
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
  selectRemainingCount,
  selectSuggestions,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { RouterLink } from '@angular/router';
import { SyncRegistry } from '@shopping-list/core/sync';
import { EmptyState, SyncBadge, SyncBadgeStatus } from '@shopping-list/ui';
import { normalize } from '@shopping-list/util/categories';

import { AddBar } from '../add-bar/add-bar';
import { ItemRow } from '../item-row/item-row';
import { ListUiStore } from '../list-ui.store';

@Component({
  selector: 'sl-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AddBar, EmptyState, ItemRow, RouterLink, SyncBadge],
  providers: [ListUiStore],
  templateUrl: './list-page.html',
  styleUrl: './list-page.scss',
})
export class ListPage {
  private readonly store = inject(Store);
  protected readonly ui = inject(ListUiStore);

  protected readonly listName = this.store.selectSignal(selectListName);
  protected readonly loaded = this.store.selectSignal(selectLoaded);
  protected readonly groups = this.store.selectSignal(selectPendingByAisle);
  protected readonly checkedItems = this.store.selectSignal(selectCheckedItems);
  protected readonly remaining = this.store.selectSignal(selectRemainingCount);
  protected readonly checkedCount = this.store.selectSignal(selectCheckedCount);
  protected readonly isEmpty = this.store.selectSignal(selectIsEmpty);

  private readonly registry = inject(SyncRegistry);

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

  protected addExisting(suggestion: SuggestionView): void {
    this.store.dispatch(
      listActions.produitAjouté({ productId: suggestion.productId }),
    );
    this.ui.clearQuery();
  }

  protected createAndAdd(label: string): void {
    this.store.dispatch(
      listActions.produitCrééEtAjouté({ draft: { label: label.trim() } }),
    );
    this.ui.clearQuery();
  }

  protected toggle(item: ItemView, checked: boolean): void {
    this.store.dispatch(listActions.articleCoché({ itemId: item.id, checked }));
  }

  protected remove(item: ItemView): void {
    this.ui.closeMenu();
    this.store.dispatch(listActions.articleRetiré({ itemId: item.id }));
  }

  protected clearChecked(): void {
    this.store.dispatch(listActions.articlesCochésVidés());
  }
}
