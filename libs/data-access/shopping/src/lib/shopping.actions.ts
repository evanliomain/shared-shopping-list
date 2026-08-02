import {
  CrdtSnapshot,
  ImageRef,
  ItemId,
  ProductDraft,
  ProductId,
} from '@shopping-list/core/crdt';
import { createActionGroup, emptyProps, props } from '@ngrx/store';

/**
 * La **seule** action que les reducers écoutent pour peupler l'état.
 *
 * Elle est émise à chaque changement du Y.Doc, que le changement soit local
 * (l'utilisateur a coché) ou distant (arrivé de GitHub, d'un QR code ou d'un
 * autre onglet). Les deux empruntent exactement le même chemin, il n'y a rien
 * de spécial à écrire pour le distant.
 */
export const crdtActions = createActionGroup({
  source: 'CRDT',
  events: {
    'Snapshot produit': props<{ snapshot: CrdtSnapshot }>(),
  },
});

/**
 * Intentions de l'utilisateur sur la liste.
 *
 * Aucune de ces actions ne modifie l'état : elles sont interceptées par les
 * effects, qui écrivent dans le Y.Doc. L'état revient ensuite par
 * `crdtActions.snapshotProduit`. C'est ce qui garantit une source de vérité
 * unique.
 */
export const listActions = createActionGroup({
  source: 'Liste',
  events: {
    /** Remet dans la liste un produit déjà connu du catalogue. */
    'Produit ajouté': props<{ productId: ProductId }>(),
    /** Crée le produit puis l'ajoute — c'est ce qui alimente l'historique. */
    'Produit créé et ajouté': props<{ draft: ProductDraft }>(),
    'Article coché': props<{ itemId: ItemId; checked: boolean }>(),
    'Article retiré': props<{ itemId: ItemId }>(),
    'Article restauré': props<{ itemId: ItemId }>(),
    'Quantité modifiée': props<{ itemId: ItemId; qty: string | null }>(),
    'Note modifiée': props<{ itemId: ItemId; note: string | null }>(),
    'Articles cochés vidés': emptyProps(),
  },
});

/** Intentions sur le catalogue, indépendantes de toute liste. */
export const catalogActions = createActionGroup({
  source: 'Catalogue',
  events: {
    'Produit modifié': props<{
      productId: ProductId;
      patch: Partial<ProductDraft>;
    }>(),
    'Image modifiée': props<{
      productId: ProductId;
      imageRef: ImageRef | null;
    }>(),
    'Produit archivé': props<{ productId: ProductId }>(),
    'Produit désarchivé': props<{ productId: ProductId }>(),
  },
});
