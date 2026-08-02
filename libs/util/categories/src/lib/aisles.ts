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
  'entretien',
  'bebe',
  'animaux',
  'divers',
] as const;

export type Aisle = (typeof AISLES)[number];

export interface AisleInfo {
  readonly label: string;
  readonly emoji: string;
}

export const AISLE_INFO: Record<Aisle, AisleInfo> = {
  'fruits-legumes': { label: 'Fruits & légumes', emoji: '🥕' },
  boucherie: { label: 'Boucherie', emoji: '🥩' },
  poissonnerie: { label: 'Poissonnerie', emoji: '🐟' },
  cremerie: { label: 'Crèmerie', emoji: '🧀' },
  boulangerie: { label: 'Boulangerie', emoji: '🥖' },
  'epicerie-salee': { label: 'Épicerie salée', emoji: '🥫' },
  'epicerie-sucree': { label: 'Épicerie sucrée', emoji: '🍪' },
  boissons: { label: 'Boissons', emoji: '🧃' },
  surgeles: { label: 'Surgelés', emoji: '🧊' },
  hygiene: { label: 'Hygiène', emoji: '🧴' },
  entretien: { label: 'Entretien', emoji: '🧽' },
  bebe: { label: 'Bébé', emoji: '🍼' },
  animaux: { label: 'Animaux', emoji: '🐾' },
  divers: { label: 'Divers', emoji: '🛒' },
};

export const DEFAULT_AISLE: Aisle = 'divers';
