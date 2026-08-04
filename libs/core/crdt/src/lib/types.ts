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
 * À qui appartient une image venue de la banque.
 *
 * Les images de la banque sont sous licence Creative Commons : la plupart
 * exigent de nommer l'auteur et la licence. Le crédit doit donc voyager avec
 * l'image — l'appareil qui la reçoit par la synchro ne pourrait pas le
 * retrouver tout seul, n'ayant jamais fait la recherche.
 *
 * Il est indexé par l'empreinte du contenu et non par produit : le crédit
 * appartient à l'image, et deux produits qui choisissent la même image partagent
 * les mêmes octets, donc le même auteur.
 */
export interface ImageCredit {
  readonly title: string;
  readonly author: string;
  /** Déjà mise en forme, et jamais traduite : « CC BY 2.0 ». */
  readonly license: string;
  readonly licenseUrl: string;
  readonly sourceUrl: string;
}

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
   * L'image venue de la banque, mémorisée même quand elle n'est pas affichée.
   *
   * C'est ce qui permet de retirer une image proposée d'office **puis de la
   * remettre**. Sans ce second champ, la retirer écraserait `imageRef` et il ne
   * resterait rien à remettre : il faudrait refaire la recherche, en espérant
   * du réseau et le même premier résultat.
   *
   * Elle survit aussi à une photo prise par-dessus : reprendre l'image de la
   * banque après avoir essayé sa propre photo ne demande donc rien au réseau.
   */
  readonly bankImageRef: ImageRef | null;
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
  /** Crédits des images de la banque, indexés par empreinte de contenu. */
  readonly credits: Readonly<Record<string, ImageCredit>>;
}

export const EMPTY_SNAPSHOT: CrdtSnapshot = {
  catalog: {},
  lists: {},
  credits: {},
};

/** Champs modifiables d'un produit, tels que les expose l'interface. */
export interface ProductDraft {
  readonly label: string;
  readonly description?: string;
  readonly defaultQty?: string;
  readonly category?: string;
  readonly imageRef?: ImageRef | null;
}
