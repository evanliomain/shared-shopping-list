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
import { TranslocoPipe } from '@jsverse/transloco';
import { Store } from '@ngrx/store';
import { BlobService } from '@shopping-list/core/blobs';
import { ImageRef, ProductId } from '@shopping-list/core/crdt';
import {
  catalogActions,
  displayEmoji,
  ProductImages,
  selectCatalog,
} from '@shopping-list/data-access/shopping';
import { EmptyState, ProductAvatar } from '@shopping-list/ui';
import { AISLE_EMOJI, AISLES } from '@shopping-list/util/categories';

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
  imports: [EmptyState, FormsModule, ProductAvatar, TranslocoPipe],
  templateUrl: './product-page.html',
  styleUrl: './product-page.scss',
})
export class ProductPage {
  /** Alimenté par `withComponentInputBinding()` depuis le paramètre de route. */
  readonly productId = input.required<ProductId>();

  private readonly store = inject(Store);
  private readonly location = inject(Location);
  private readonly blobs = inject(BlobService);
  protected readonly images = inject(ProductImages);

  private readonly catalog = this.store.selectSignal(selectCatalog);

  protected readonly product = computed(() => this.catalog()[this.productId()]);
  protected readonly aisles = AISLES.map((aisle) => ({
    key: aisle,
    emoji: AISLE_EMOJI[aisle],
  }));
  protected readonly emojiChoices = EMOJI_CHOICES;

  protected readonly label = signal('');
  protected readonly description = signal('');
  protected readonly defaultQty = signal('');
  protected readonly category = signal('');
  protected readonly emoji = signal('🛒');
  /** Photo choisie : prend le pas sur l'emoji tant qu'elle est renseignée. */
  protected readonly photoRef = signal<ImageRef | null>(null);
  protected readonly photoUrl = signal<string | null>(null);
  protected readonly photoBusy = signal(false);

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

      const ref = product.imageRef;
      const isPhoto = null !== ref && ref.startsWith('blob:');
      this.photoRef.set(isPhoto ? ref : null);
      if (isPhoto) {
        this.images.ensure([ref]);
        this.photoUrl.set(this.images.urlFor(ref));
      } else {
        this.photoUrl.set(null);
      }
    });
  }

  /**
   * Prend une photo et la range immédiatement.
   *
   * On enregistre avant même que l'utilisateur valide la fiche : la photo est
   * adressée par son contenu, donc la stocker deux fois ne coûte rien, et une
   * photo perdue parce qu'on a quitté l'écran serait irritante.
   */
  protected async onPhotoPicked(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (undefined === file) {
      return;
    }

    this.photoBusy.set(true);
    try {
      const ref = await this.blobs.store(file);
      this.photoRef.set(ref);
      this.images.ensure([ref]);
      this.photoUrl.set(this.images.urlFor(ref));
    } finally {
      this.photoBusy.set(false);
    }
  }

  /** Revenir à l'emoji : la photo reste en cache, seule la référence change. */
  protected clearPhoto(): void {
    this.photoRef.set(null);
    this.photoUrl.set(null);
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
    const imageRef = this.photoRef() ?? `emoji:${this.emoji()}`;
    this.store.dispatch(
      catalogActions.imageModifiée({ productId: this.productId(), imageRef }),
    );

    // Publication en tâche de fond : le dépôt n'est pas sur le chemin critique
    // de l'enregistrement.
    void this.images.publishToRemote(this.photoRef());

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
