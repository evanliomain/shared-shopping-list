import {
  ImageRef,
  ItemId,
  Product,
  ProductId,
  usageTotal,
} from '@shopping-list/core/crdt';
import { emojiForAisle } from '@shopping-list/util/categories';

/** Une ligne de liste, déjà jointe à son produit — prête à afficher. */
export interface ItemView {
  readonly id: ItemId;
  readonly productId: ProductId;
  readonly label: string;
  readonly description: string;
  /** Quantité effective : celle de la ligne, sinon celle du produit. */
  readonly qty: string;
  readonly note: string | null;
  readonly checked: boolean;
  readonly imageRef: ImageRef | null;
  /** Emoji de repli, toujours renseigné, même sans image. */
  readonly emoji: string;
  readonly aisle: string;
  readonly addedBy: string;
  readonly createdAt: number;
}

/** Les articles d'un rayon, dans l'ordre de parcours du magasin. */
export interface AisleGroup {
  readonly aisle: string;
  readonly label: string;
  readonly emoji: string;
  readonly items: readonly ItemView[];
}

/** Une proposition issue de l'historique. */
export interface SuggestionView {
  readonly productId: ProductId;
  readonly label: string;
  readonly description: string;
  readonly defaultQty: string;
  readonly imageRef: ImageRef | null;
  readonly emoji: string;
  readonly aisle: string;
  readonly usage: number;
  readonly lastUsedAt: number;
  /** Déjà dans la liste en cours : on l'affiche, mais grisé. */
  readonly alreadyInList: boolean;
}

/**
 * Emoji à afficher pour un produit.
 *
 * Une photo (`blob:`) est rendue par `<sl-product-image>` ; l'emoji reste
 * calculé pour servir de repli tant que l'image n'est pas téléchargée, ce qui
 * est le cas normal juste après un échange par QR code.
 */
export function displayEmoji(product: Product): string {
  const ref = product.imageRef;
  return null !== ref && ref.startsWith('emoji:')
    ? ref.slice('emoji:'.length)
    : emojiForAisle(product.category);
}

export function productUsage(product: Product): number {
  return usageTotal(product.usage);
}
