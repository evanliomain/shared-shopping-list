import { createSelector } from '@ngrx/store';
import { ListItem, Product } from '@shopping-list/core/crdt';
import {
  AISLES,
  aisleOf,
  emojiForAisle,
  normalize,
  orderedAisles,
} from '@shopping-list/util/categories';
import { fuzzyScore } from '@shopping-list/util/search';
import { chain, filter, length, map, partition, sortBy } from 'taninsam';

import {
  selectCatalog,
  selectItems,
  selectLoaded,
  shoppingFeature,
} from './shopping.feature';
import {
  AisleGroup,
  ItemView,
  SuggestionView,
  displayEmoji,
  productUsage,
} from './shopping.views';

/**
 * Toute la dérivation vit ici.
 *
 * Le reducer se contente de recopier la projection du CRDT ; c'est aux
 * selectors de joindre, grouper, trier et compter. Ils sont mémoïsés, donc
 * recalculés uniquement quand la tranche change.
 */

/**
 * Tous les rayons, dans l'ordre de parcours effectif de la liste.
 *
 * Le réglage stocké dans le CRDT est possiblement partiel ; `orderedAisles` le
 * complète avec l'ordre par défaut. C'est la source unique du classement, et la
 * liste que l'écran de réglage affiche.
 */
export const selectOrderedAisles = createSelector(
  shoppingFeature.selectAisleOrder,
  orderedAisles,
);

/** Le rang de chaque rayon dans un parcours donné. */
function ranksOf(ordered: readonly string[]): ReadonlyMap<string, number> {
  return new Map(ordered.map((aisle, index) => [aisle, index]));
}

function rankOf(ranks: ReadonlyMap<string, number>, aisle: string): number {
  // Le rayon sort toujours d'`aisleOf`, donc d'`AISLES`, et `orderedAisles`
  // range tout rayon connu : le repli est un garde-fou de typage, pas un cas
  // possible.
  /* v8 ignore next -- repli inatteignable, voir ci-dessus */
  return ranks.get(aisle) ?? AISLES.length;
}

/** Les lignes réellement présentes : les tombstones ne s'affichent jamais. */
export const selectActiveItems = createSelector(selectItems, (items) =>
  chain(Object.values(items))
    .chain(filter((item: ListItem) => null === item.removedAt))
    .value(),
);

export const selectItemViews = createSelector(
  selectActiveItems,
  selectCatalog,
  selectOrderedAisles,
  (items, catalog, ordered) => {
    const ranks = ranksOf(ordered);
    return chain([...items])
      .chain(map((item: ListItem) => toItemView(item, catalog[item.productId])))
      .chain(
        sortBy<ItemView>(
          (v) => rankOf(ranks, v.aisle),
          (v) => normalize(v.label),
        ),
      )
      .value() as ItemView[];
  },
);

function toItemView(item: ListItem, product: Product | undefined): ItemView {
  // Le produit peut manquer transitoirement : un delta qui ajoute la ligne peut
  // arriver avant celui qui crée le produit. On affiche quelque chose de
  // correct plutôt que de planter au milieu des courses.
  return {
    id: item.id,
    productId: item.productId,
    label: product?.label ?? '',
    unknownProduct: undefined === product,
    description: product?.description ?? '',
    qty: item.qty ?? product?.defaultQty ?? '',
    note: item.note,
    checked: item.checked,
    imageRef: product?.imageRef ?? null,
    emoji: undefined === product ? emojiForAisle('') : displayEmoji(product),
    aisle: aisleOf(product?.category ?? ''),
    addedBy: item.addedBy,
    createdAt: item.createdAt,
  };
}

export const selectPendingItems = createSelector(selectItemViews, (views) =>
  chain([...views])
    .chain(filter((v: ItemView) => !v.checked))
    .value(),
);

export const selectCheckedItems = createSelector(selectItemViews, (views) =>
  chain([...views])
    .chain(filter((v: ItemView) => v.checked))
    .value(),
);

/**
 * Les articles restants, groupés par rayon dans l'ordre de parcours.
 *
 * `partition` regroupe par clé ; on trie ensuite les groupes par rang de rayon
 * pour que la liste suive le trajet réel dans le magasin plutôt que l'ordre de
 * saisie.
 */
export const selectPendingByAisle = createSelector(
  selectPendingItems,
  selectOrderedAisles,
  (items, ordered) => {
    const ranks = ranksOf(ordered);
    return chain([...items])
      .chain(partition<ItemView, string>((item) => item.aisle))
      .chain(
        map((group: readonly ItemView[]) => ({
          aisle: group[0].aisle,
          emoji: emojiForAisle(group[0].aisle),
          items: group,
        })),
      )
      .chain(sortBy<AisleGroup>((g) => rankOf(ranks, g.aisle)))
      .value() as AisleGroup[];
  },
);

/**
 * Les articles restants, du plus récemment ajouté au plus ancien.
 *
 * La vue de validation d'ajout : on vient d'entrer plusieurs articles et on
 * veut les voir remonter en tête pour vérifier qu'ils sont bien arrivés, sans
 * les traquer chacun dans son rayon. `createdAt` décroissant ; à égalité — deux
 * lignes nées dans la même milliseconde —, l'ordre alphabétique départage pour
 * que l'affichage reste stable.
 */
export const selectPendingByRecency = createSelector(
  selectPendingItems,
  (items) =>
    chain([...items])
      .chain(
        sortBy<ItemView>(
          (v) => -v.createdAt,
          (v) => normalize(v.label),
        ),
      )
      .value() as ItemView[],
);

export const selectRemainingCount = createSelector(
  selectPendingItems,
  (items) =>
    chain([...items])
      .chain(length())
      .value(),
);

export const selectCheckedCount = createSelector(selectCheckedItems, (items) =>
  chain([...items])
    .chain(length())
    .value(),
);

export const selectIsEmpty = createSelector(
  selectItemViews,
  selectLoaded,
  (views, loaded) => loaded && 0 === views.length,
);

/**
 * L'historique proposable, du plus pertinent au moins pertinent.
 *
 * Le classement combine le total du G-Counter (à quel point on achète ce
 * produit) et la récence. Les produits archivés sont exclus ; ceux déjà dans la
 * liste restent visibles mais marqués, parce que les masquer donnerait
 * l'impression qu'on les a perdus.
 */
export const selectSuggestions = createSelector(
  selectCatalog,
  selectActiveItems,
  (catalog, items) => {
    const inList = new Set(items.map((item) => item.productId));

    return chain(Object.values(catalog))
      .chain(filter((product: Product) => null === product.archivedAt))
      .chain(
        map(
          (product: Product): SuggestionView => ({
            productId: product.id,
            label: product.label,
            description: product.description,
            defaultQty: product.defaultQty,
            imageRef: product.imageRef,
            emoji: displayEmoji(product),
            aisle: aisleOf(product.category),
            usage: productUsage(product),
            lastUsedAt: product.lastUsedAt,
            alreadyInList: inList.has(product.id),
          }),
        ),
      )
      .chain(
        sortBy<SuggestionView>(
          (s) => (s.alreadyInList ? 1 : 0),
          (s) => -s.usage,
          (s) => -s.lastUsedAt,
          (s) => normalize(s.label),
        ),
      )
      .value() as SuggestionView[];
  },
);

/**
 * Filtre et reclasse les suggestions sur une saisie libre.
 *
 * Volontairement une fonction pure et non un selector : la requête change à
 * chaque frappe, ce qui invaliderait la mémoïsation à chaque caractère.
 *
 * La recherche est **approximative** : « lat » sort « Lait », « choc » sort
 * « Chocolat noir ». Une sous-chaîne exacte était une exigence d'exactitude
 * posée à la mauvaise personne — celle qui tape d'un pouce, en marchant.
 *
 * Elle porte sur le libellé **et** la description, sinon taper « vanille » ne
 * retrouverait pas « Yaourt / à la vanille » — précisément le cas qui motive
 * la description.
 *
 * Pas de score plancher : « lat » ne vaut que 0,36 contre « Lait », et
 * l'écarter reviendrait à refuser la faute de frappe qui justifie tout ceci.
 * C'est le classement qui trie, pas un seuil.
 *
 * Les produits déjà dans la liste restent derrière les autres, comme sans
 * saisie : ils sont là pour dire « tu l'as déjà », pas pour être ajoutés.
 */
export function filterSuggestions(
  suggestions: readonly SuggestionView[],
  query: string,
): readonly SuggestionView[] {
  return (
    chain([...suggestions])
      .chain(
        map((s: SuggestionView) => ({
          suggestion: s,
          score: fuzzyScore(query, ...haystacks(s)),
        })),
      )
      .chain(filter((scored) => null !== scored.score))
      // Un tri stable : à score égal — le cas de toute la liste quand la saisie
      // est vide — l'ordre d'usage et de récence reçu est conservé.
      .chain(
        sortBy(
          (scored) => (scored.suggestion.alreadyInList ? 1 : 0),
          // Le `filter` ci-dessus a écarté tous les scores nuls ; le repli
          // n'est là que parce que le type ne le sait pas.
          /* v8 ignore next -- repli inatteignable, voir ci-dessus */
          (scored) => -(scored.score ?? 0),
        ),
      )
      .chain(map((scored) => scored.suggestion))
      .value() as SuggestionView[]
  );
}

/**
 * Les textes qu'une saisie peut atteindre sur un produit.
 *
 * Les deux champs séparément — c'est là que le score est le plus franc, et
 * c'est ce qu'affiche l'écran — mais aussi leur concaténation, sans laquelle
 * « yaourt vanille » ne trouverait rien : la moitié des lettres est dans le
 * libellé, l'autre dans la description.
 */
function haystacks(suggestion: SuggestionView): readonly string[] {
  const { label, description } = suggestion;

  return '' === description
    ? [label]
    : [label, description, `${label} ${description}`];
}

/**
 * Tout le catalogue, **archivés compris**, du plus utilisé au moins utilisé.
 *
 * Distinct de `selectSuggestions`, qui masque les archivés : ici on vient
 * justement pour retrouver et désarchiver.
 */
export const selectCatalogEntries = createSelector(
  selectCatalog,
  selectActiveItems,
  (catalog, items) => {
    const inList = new Set(items.map((item) => item.productId));

    return chain(Object.values(catalog))
      .chain(
        map(
          (product: Product): SuggestionView => ({
            productId: product.id,
            label: product.label,
            description: product.description,
            defaultQty: product.defaultQty,
            imageRef: product.imageRef,
            emoji: displayEmoji(product),
            aisle: aisleOf(product.category),
            usage: productUsage(product),
            lastUsedAt: product.lastUsedAt,
            alreadyInList: inList.has(product.id),
          }),
        ),
      )
      .chain(
        sortBy<SuggestionView>(
          (s) => -s.usage,
          (s) => normalize(s.label),
        ),
      )
      .value() as SuggestionView[];
  },
);

/** Empreintes des produits archivés, pour les distinguer à l'affichage. */
export const selectArchivedIds = createSelector(
  selectCatalog,
  (catalog) =>
    new Set(
      Object.values(catalog)
        .filter((product) => null !== product.archivedAt)
        .map((product) => product.id),
    ),
);
