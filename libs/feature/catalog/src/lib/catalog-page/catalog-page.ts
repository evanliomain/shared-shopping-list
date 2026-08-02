import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import {
  catalogActions,
  filterSuggestions,
  listActions,
  ProductImages,
  selectArchivedIds,
  selectCatalogEntries,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { EmptyState, ProductAvatar } from '@shopping-list/ui';
import { labelForAisle } from '@shopping-list/util/categories';

/**
 * Gestion de l'historique.
 *
 * Contrepartie nécessaire du catalogue : puisque **tout** article saisi y entre
 * automatiquement, il faut un endroit pour retrouver, corriger et ranger. Sans
 * ça, l'historique se remplirait d'essais et de fautes de frappe, et les
 * suggestions perdraient leur intérêt.
 *
 * On archive, on ne supprime pas : un produit archivé disparaît des
 * suggestions mais reste consultable, et son compteur d'usage est préservé si
 * on le réactive.
 */
@Component({
  selector: 'sl-catalog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, ProductAvatar],
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.scss',
})
export class CatalogPage {
  private readonly store = inject(Store);
  private readonly location = inject(Location);
  protected readonly images = inject(ProductImages);

  private readonly entries = this.store.selectSignal(selectCatalogEntries);
  protected readonly archived = this.store.selectSignal(selectArchivedIds);

  protected readonly query = signal('');
  protected readonly showArchived = signal(false);

  protected readonly visible = computed(() => {
    const all = filterSuggestions(this.entries(), this.query());
    return this.showArchived()
      ? all
      : all.filter((entry) => !this.archived().has(entry.productId));
  });

  protected readonly archivedCount = computed(() => this.archived().size);
  protected readonly total = computed(() => this.entries().length);

  constructor() {
    effect(() =>
      this.images.ensure(this.visible().map((entry) => entry.imageRef)),
    );
  }

  protected aisleOf(entry: SuggestionView): string {
    return labelForAisle(entry.aisle);
  }

  protected isArchived(entry: SuggestionView): boolean {
    return this.archived().has(entry.productId);
  }

  protected addToList(entry: SuggestionView): void {
    this.store.dispatch(
      listActions.produitAjouté({ productId: entry.productId }),
    );
  }

  protected toggleArchive(entry: SuggestionView): void {
    this.store.dispatch(
      this.isArchived(entry)
        ? catalogActions.produitDésarchivé({ productId: entry.productId })
        : catalogActions.produitArchivé({ productId: entry.productId }),
    );
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected close(): void {
    this.location.back();
  }
}
