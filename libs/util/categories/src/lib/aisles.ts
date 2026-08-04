/**
 * Rayons de supermarché, dans l'ordre où on les traverse habituellement.
 * L'ordre est celui du parcours par défaut ; il est surchargeable par liste
 * via `meta.aisleOrder`.
 */
export const AISLES = [
  'fruits-legumes',
  'boucherie',
  'traiteur',
  'poissonnerie',
  'cremerie',
  'boulangerie',
  'epicerie-salee',
  'epicerie-sucree',
  'boissons',
  'cave',
  'surgeles',
  'hygiene',
  'pharmacie',
  'entretien',
  'bebe',
  'animaux',
  // Le non-alimentaire ferme la marche : dans un hypermarché, le bazar, le
  // textile et la culture sont du côté des caisses, pas des rayons frais. On
  // garde ce bloc dans l'ordre où un grand Leclerc l'aligne — maison et
  // électroménager d'abord, l'auto tout au bout près des sorties.
  'maison',
  'electromenager',
  'bricolage',
  'jardin',
  'textile',
  'sport',
  'jouets',
  'fournitures',
  'librairie',
  'multimedia',
  'auto',
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
  traiteur: '🥓',
  poissonnerie: '🐟',
  cremerie: '🧀',
  boulangerie: '🥖',
  'epicerie-salee': '🥫',
  'epicerie-sucree': '🍪',
  boissons: '🧃',
  cave: '🍷',
  surgeles: '🧊',
  hygiene: '🧴',
  pharmacie: '💊',
  entretien: '🧽',
  bebe: '🍼',
  animaux: '🐾',
  maison: '🏠',
  electromenager: '🔌',
  bricolage: '🔧',
  jardin: '🌱',
  textile: '👕',
  sport: '⚽',
  jouets: '🧸',
  fournitures: '🎒',
  librairie: '📚',
  multimedia: '🎧',
  auto: '🚗',
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

/**
 * Ordonne **tous** les rayons connus selon une préférence de parcours.
 *
 * `stored` est l'ordre choisi pour une liste — possiblement partiel, et venu du
 * CRDT donc pas forcément à jour. On le respecte d'abord, en écartant ce qui
 * n'est pas un rayon connu (un rayon retiré d'une version future) et les
 * doublons ; puis on complète avec les rayons restants dans leur ordre par
 * défaut. Un rayon que le réglage ne cite pas — parce qu'une mise à jour vient
 * de l'ajouter — se range donc derrière les rayons cités, sans jamais
 * disparaître de la liste.
 *
 * Le résultat contient toujours chaque rayon exactement une fois : c'est ce qui
 * en fait à la fois la source du classement et la liste que l'écran de réglage
 * affiche.
 */
export function orderedAisles(stored: readonly string[]): Aisle[] {
  const known = new Set<string>(AISLES);
  const seen = new Set<Aisle>();
  const ordered: Aisle[] = [];

  for (const key of stored) {
    if (known.has(key) && !seen.has(key as Aisle)) {
      seen.add(key as Aisle);
      ordered.push(key as Aisle);
    }
  }
  for (const aisle of AISLES) {
    if (!seen.has(aisle)) {
      ordered.push(aisle);
    }
  }

  return ordered;
}
