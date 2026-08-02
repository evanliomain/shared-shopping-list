/**
 * Types du domaine, tels qu'ils sortent du CRDT.
 *
 * Ce sont des objets JavaScript ordinaires et immuables : le reste de
 * l'application (store NgRx, selectors, composants) ne manipule jamais de
 * structures Yjs. La frontière est ici.
 */

export type ProductId = string;
export type ListId = string;
export type ItemId = string;
export type DeviceId = string;

/**
 * Référence d'image. Jamais des pixels dans le CRDT — voir
 * `docs/architecture.md`, section « Les images vivent en dehors du CRDT ».
 *
 * - `emoji:🍦`      — le cas courant, ~8 octets
 * - `blob:a3f9c2…`  — une photo, stockée hors CRDT et adressée par son SHA-256
 */
export type ImageRef = `emoji:${string}` | `blob:${string}`;

/**
 * Une entrée du catalogue : ce qu'on achète, indépendamment de toute liste.
 *
 * C'est l'historique réutilisable. « Yaourt / à la vanille » et
 * « Yaourt / Firen, pour le petit » sont deux produits distincts.
 */
export interface Product {
  readonly id: ProductId;
  readonly label: string;
  /** Ce qui distingue deux produits de même libellé. Peut être vide. */
  readonly description: string;
  /** Quantité proposée par défaut quand on remet le produit dans une liste. */
  readonly defaultQty: string;
  /** Clé de rayon — voir `@shopping-list/util/categories`. */
  readonly category: string;
  readonly imageRef: ImageRef | null;
  /**
   * G-Counter : un compteur par appareil, sommé à la lecture.
   * Un entier simple perdrait les incréments concurrents.
   */
  readonly usage: Readonly<Record<DeviceId, number>>;
  readonly lastUsedAt: number;
  /** Archivé = exclu des suggestions, mais jamais supprimé. */
  readonly archivedAt: number | null;
}

/** Une ligne de liste : une référence au catalogue, plus le ponctuel. */
export interface ListItem {
  readonly id: ItemId;
  readonly productId: ProductId;
  /** Surcharge de `defaultQty` pour cette course. `null` = on garde le défaut. */
  readonly qty: string | null;
  /** Précision valable pour cette course seulement. */
  readonly note: string | null;
  readonly checked: boolean;
  readonly addedBy: string;
  readonly createdAt: number;
  /**
   * Tombstone. On ne supprime jamais vraiment tout de suite : une suppression
   * Yjs gagnerait contre une édition concurrente, alors qu'un tombstone reste
   * réconciliable — et ça donne l'annulation.
   */
  readonly removedAt: number | null;
}

export interface ShoppingList {
  readonly id: ListId;
  readonly name: string;
  readonly createdAt: number;
  readonly items: Readonly<Record<ItemId, ListItem>>;
}

/**
 * Photographie complète du Y.Doc en objets ordinaires.
 *
 * Recalculée intégralement à chaque changement : pour une liste de courses
 * (quelques centaines de produits au grand maximum) c'est négligeable, et ça
 * évite toute la complexité d'une projection incrémentale.
 */
export interface CrdtSnapshot {
  readonly catalog: Readonly<Record<ProductId, Product>>;
  readonly lists: Readonly<Record<ListId, ShoppingList>>;
}

export const EMPTY_SNAPSHOT: CrdtSnapshot = { catalog: {}, lists: {} };

/** Champs modifiables d'un produit, tels que les expose l'interface. */
export interface ProductDraft {
  readonly label: string;
  readonly description?: string;
  readonly defaultQty?: string;
  readonly category?: string;
  readonly imageRef?: ImageRef | null;
}
