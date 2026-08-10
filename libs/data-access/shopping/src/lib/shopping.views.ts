import {
  ImageRef,
  ItemId,
  Product,
  ProductId,
  usageTotal,
} from '@shopping-list/core/crdt';
import { Aisle, emojiForAisle } from '@shopping-list/util/categories';

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
  /** Rayon connu : la vue ne laisse jamais passer une catégorie inconnue. */
  readonly aisle: Aisle;
  /**
   * Le produit correspondant manque encore.
   *
   * L'écran doit alors afficher un libellé traduit, ce que seul un template
   * peut faire — d'où un drapeau plutôt qu'une phrase toute faite ici.
   */
  readonly unknownProduct: boolean;
  readonly addedBy: string;
  readonly createdAt: number;
}

/**
 * Les articles d'un rayon, dans l'ordre de parcours du magasin.
 *
 * Pas de libellé : la clé de rayon suffit, et c'est le template qui la traduit
 * — un selector est pur et mémoïsé, il n'a rien à savoir de la langue.
 */
export interface AisleGroup {
  readonly aisle: Aisle;
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
  readonly aisle: Aisle;
  readonly usage: number;
  readonly lastUsedAt: number;
  /** Déjà dans la liste en cours : on l'affiche, mais grisé. */
  readonly alreadyInList: boolean;
}

/**
 * Emoji à afficher pour un produit.
 *
 * Une photo (`blob:`) est rendue par `<sl-product-avatar>` ; l'emoji reste
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

/**
 * Quantité prête à afficher. Un compte pur devient « ×4 » ; une quantité libre
 * (« 500 g », « un pack de 4 ») s'affiche telle quelle. Le compte 1 ne s'écrit
 * pas — c'est le défaut, un « ×1 » n'apprendrait rien et alourdirait la ligne.
 */
export function displayQty(qty: string): string {
  if (/^\d+$/.test(qty)) {
    return '1' === qty ? '' : `×${qty}`;
  }
  return qty;
}

/**
 * La quantité lue comme un compte, ou `null` quand c'est une quantité libre.
 *
 * C'est la frontière entre les deux natures de `qty` : un compte pur (« 4 »)
 * s'incrémente et se relit au pas d'un stepper ; une quantité libre (« 500 g »)
 * ne se compte pas — elle se réédite au pavé. Le reçu, l'annulation et la
 * relecture s'appuient tous sur cette distinction, d'où un seul endroit qui la
 * tranche.
 */
export function asCount(qty: string): number | null {
  return /^\d+$/.test(qty) ? parseInt(qty, 10) : null;
}
