import { createSelector } from '@ngrx/store';
import { ListItem, Product } from '@shopping-list/core/crdt';
import {
  AISLES,
  labelForAisle,
  emojiForAisle,
  normalize,
} from '@shopping-list/util/categories';
import { chain, filter, length, map, partition, sortBy } from 'taninsam';

import { selectCatalog, selectItems, selectLoaded } from './shopping.feature';
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

/** Rang d'un rayon dans le parcours du magasin. Inconnu → à la fin. */
const AISLE_RANK: Readonly<Record<string, number>> = Object.fromEntries(
  AISLES.map((aisle, index) => [aisle, index]),
);

function rankOf(aisle: string): number {
  return AISLE_RANK[aisle] ?? AISLES.length;
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
  (items, catalog) =>
    chain([...items])
      .chain(map((item: ListItem) => toItemView(item, catalog[item.productId])))
      .chain(
        sortBy<ItemView>(
          (v) => rankOf(v.aisle),
          (v) => normalize(v.label),
        ),
      )
      .value() as ItemView[],
);

function toItemView(item: ListItem, product: Product | undefined): ItemView {
  // Le produit peut manquer transitoirement : un delta qui ajoute la ligne peut
  // arriver avant celui qui crée le produit. On affiche quelque chose de
  // correct plutôt que de planter au milieu des courses.
  const label = product?.label ?? 'Article inconnu';
  const aisle = product?.category ?? '';

  return {
    id: item.id,
    productId: item.productId,
    label,
    description: product?.description ?? '',
    qty: item.qty ?? product?.defaultQty ?? '',
    note: item.note,
    checked: item.checked,
    imageRef: product?.imageRef ?? null,
    emoji: undefined === product ? emojiForAisle('') : displayEmoji(product),
    aisle,
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
  (items) =>
    chain([...items])
      .chain(partition<ItemView, string>((item) => item.aisle))
      .chain(
        map((group: readonly ItemView[]) => ({
          aisle: group[0].aisle,
          label: labelForAisle(group[0].aisle),
          emoji: emojiForAisle(group[0].aisle),
          items: group,
        })),
      )
      .chain(sortBy<AisleGroup>((g) => rankOf(g.aisle)))
      .value() as AisleGroup[],
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
            aisle: product.category,
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
 * Filtre les suggestions sur une saisie libre.
 *
 * Volontairement une fonction pure et non un selector : la requête change à
 * chaque frappe, ce qui invaliderait la mémoïsation à chaque caractère.
 *
 * La recherche porte sur le libellé **et** la description, sinon taper
 * « vanille » ne retrouverait pas « Yaourt / à la vanille » — précisément le
 * cas qui motive la description.
 */
export function filterSuggestions(
  suggestions: readonly SuggestionView[],
  query: string,
): readonly SuggestionView[] {
  const needle = normalize(query);
  if ('' === needle) {
    return suggestions;
  }

  const terms = needle.split(' ');

  return chain([...suggestions])
    .chain(
      filter((s: SuggestionView) => {
        const haystack = normalize(`${s.label} ${s.description}`);
        return terms.every((term) => haystack.includes(term));
      }),
    )
    .value();
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
            aisle: product.category,
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
