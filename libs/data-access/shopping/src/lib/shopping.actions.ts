import {
  CrdtSnapshot,
  ImageCredit,
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
    /**
     * Le produit vient d'être créé. Un constat, pas une intention.
     *
     * Il existe pour une seule raison : c'est le seul endroit où l'on connaît à
     * la fois l'identifiant tout neuf et le fait qu'aucun emoji n'a reconnu le
     * libellé. Sans lui, la recherche d'image d'office devrait retrouver le
     * produit à tâtons dans le catalogue, par son libellé — ce qui désignerait
     * le mauvais dès qu'on ajoute deux fois le même nom.
     */
    'Produit créé': props<{
      productId: ProductId;
      label: string;
      emojiFound: boolean;
    }>(),
    'Article coché': props<{ itemId: ItemId; checked: boolean }>(),
    'Article retiré': props<{ itemId: ItemId }>(),
    'Article restauré': props<{ itemId: ItemId }>(),
    'Quantité modifiée': props<{ itemId: ItemId; qty: string | null }>(),
    'Note modifiée': props<{ itemId: ItemId; note: string | null }>(),
    'Articles cochés vidés': emptyProps(),
    /** Repart d'une liste vide, sans toucher au catalogue. */
    'Liste vidée': emptyProps(),
    /**
     * Fixe l'ordre de parcours des rayons. `order` peut être partiel ; un
     * tableau vide revient au parcours par défaut.
     */
    'Rayons réordonnés': props<{ order: readonly string[] }>(),
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
    /**
     * Change l'image affichée, sans toucher à celle que la banque a fournie.
     *
     * C'est aussi par elle que passent le retrait d'une image de banque — vers
     * l'emoji — et sa remise, vers `bankImageRef`. Retirer n'oublie donc rien.
     */
    'Image modifiée': props<{
      productId: ProductId;
      imageRef: ImageRef | null;
    }>(),
    /**
     * Une image de la banque a été adoptée : elle est déjà stockée localement.
     *
     * L'action arrive après les entrées-sorties, jamais avant : le téléchargement
     * et la réduction en WebP sont faits par `ProductBankImages`, comme la page
     * produit le fait déjà pour une photo prise sur place.
     */
    'Image de banque choisie': props<{
      productId: ProductId;
      imageRef: ImageRef;
      credit: ImageCredit;
    }>(),
    'Produit archivé': props<{ productId: ProductId }>(),
    'Produit désarchivé': props<{ productId: ProductId }>(),
  },
});
