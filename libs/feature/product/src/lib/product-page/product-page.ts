import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Store } from '@ngrx/store';
import { ProductId } from '@shopping-list/core/crdt';
import {
  catalogActions,
  displayEmoji,
  selectCatalog,
} from '@shopping-list/data-access/shopping';
import { ProductAvatar } from '@shopping-list/ui';
import { AISLES, AISLE_INFO } from '@shopping-list/util/categories';

/** Quelques emoji courants, pour ne pas imposer le clavier système. */
const EMOJI_CHOICES = [
  '🍎',
  '🍌',
  '🥕',
  '🥬',
  '🥔',
  '🍅',
  '🍇',
  '🍋',
  '🥩',
  '🍗',
  '🐟',
  '🥓',
  '🧀',
  '🥛',
  '🥚',
  '🧈',
  '🥖',
  '🥐',
  '🍞',
  '🍝',
  '🍚',
  '🥫',
  '🧂',
  '🫒',
  '🍫',
  '🍪',
  '🍯',
  '🥣',
  '☕',
  '🍵',
  '🧃',
  '💧',
  '🍺',
  '🍷',
  '🧊',
  '🍦',
  '🧴',
  '🧼',
  '🧻',
  '🪥',
  '🧺',
  '🧽',
  '🗑️',
  '🔋',
  '💡',
  '🍼',
  '🐾',
  '🛒',
];

/**
 * Fiche d'un produit du catalogue.
 *
 * Elle modifie le **catalogue**, pas la ligne de liste : corriger une
 * description ou une image ici se répercute sur toutes les listes, passées et
 * futures. C'est ce qui rend l'historique utilisable dans la durée.
 */
@Component({
  selector: 'sl-product-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ProductAvatar],
  templateUrl: './product-page.html',
  styleUrl: './product-page.scss',
})
export class ProductPage {
  /** Alimenté par `withComponentInputBinding()` depuis le paramètre de route. */
  readonly productId = input.required<ProductId>();

  private readonly store = inject(Store);
  private readonly location = inject(Location);

  private readonly catalog = this.store.selectSignal(selectCatalog);

  protected readonly product = computed(() => this.catalog()[this.productId()]);
  protected readonly aisles = AISLES.map((aisle) => ({
    key: aisle,
    ...AISLE_INFO[aisle],
  }));
  protected readonly emojiChoices = EMOJI_CHOICES;

  protected readonly label = signal('');
  protected readonly description = signal('');
  protected readonly defaultQty = signal('');
  protected readonly category = signal('');
  protected readonly emoji = signal('🛒');

  protected readonly canSave = computed(() => '' !== this.label().trim());

  constructor() {
    // Le produit peut arriver après le premier rendu : IndexedDB restaure de
    // façon asynchrone, et un delta distant peut le créer plus tard encore.
    effect(() => {
      const product = this.product();
      if (undefined === product) {
        return;
      }

      this.label.set(product.label);
      this.description.set(product.description);
      this.defaultQty.set(product.defaultQty);
      this.category.set(product.category);
      this.emoji.set(displayEmoji(product));
    });
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }

    this.store.dispatch(
      catalogActions.produitModifié({
        productId: this.productId(),
        patch: {
          label: this.label().trim(),
          description: this.description().trim(),
          defaultQty: this.defaultQty().trim(),
          category: this.category(),
        },
      }),
    );
    this.store.dispatch(
      catalogActions.imageModifiée({
        productId: this.productId(),
        imageRef: `emoji:${this.emoji()}`,
      }),
    );

    this.close();
  }

  protected archive(): void {
    this.store.dispatch(
      catalogActions.produitArchivé({ productId: this.productId() }),
    );
    this.close();
  }

  protected close(): void {
    this.location.back();
  }
}
