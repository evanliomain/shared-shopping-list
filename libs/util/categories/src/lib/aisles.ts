/**
 * Rayons de supermarché, dans l'ordre où on les traverse habituellement.
 * L'ordre est celui du parcours par défaut ; il est surchargeable par liste
 * via `meta.aisleOrder`.
 */
export const AISLES = [
  'fruits-legumes',
  'boucherie',
  'poissonnerie',
  'cremerie',
  'boulangerie',
  'epicerie-salee',
  'epicerie-sucree',
  'boissons',
  'surgeles',
  'hygiene',
  'pharmacie',
  'entretien',
  'bebe',
  'animaux',
  // Le non-alimentaire ferme la marche : dans un hypermarché, la culture et
  // le multimédia sont du côté des caisses, pas du côté des rayons frais.
  'librairie',
  'multimedia',
  'divers',
] as const;

export type Aisle = (typeof AISLES)[number];

/**
 * Emoji par rayon.
 *
 * Le libellé, lui, n'est pas ici : il dépend de la langue, et cette
 * bibliothèque est pure. Il vit sous la clé `aisles.<rayon>` de `util/i18n`,
 * et c'est la clé de rayon qui voyage jusqu'au template, traduite au dernier
 * moment. C'est aussi ce que réclame le CRDT : ce qui est stocké et
 * synchronisé doit être la clé, identique sur tous les appareils, quelle que
 * soit la langue de chacun.
 */
export const AISLE_EMOJI: Readonly<Record<Aisle, string>> = {
  'fruits-legumes': '🥕',
  boucherie: '🥩',
  poissonnerie: '🐟',
  cremerie: '🧀',
  boulangerie: '🥖',
  'epicerie-salee': '🥫',
  'epicerie-sucree': '🍪',
  boissons: '🧃',
  surgeles: '🧊',
  hygiene: '🧴',
  pharmacie: '💊',
  entretien: '🧽',
  bebe: '🍼',
  animaux: '🐾',
  librairie: '📚',
  multimedia: '🎧',
  divers: '🛒',
};

export const DEFAULT_AISLE: Aisle = 'divers';

/**
 * Ramène n'importe quelle catégorie stockée sur un rayon connu.
 *
 * Le CRDT accepte des chaînes libres, et un produit peut arriver d'un appareil
 * plus récent avec un rayon qu'on ne connaît pas encore. Mieux vaut le ranger
 * dans « divers » que le faire disparaître de l'écran.
 */
export function aisleOf(category: string): Aisle {
  return Object.hasOwn(AISLE_EMOJI, category)
    ? (category as Aisle)
    : DEFAULT_AISLE;
}
