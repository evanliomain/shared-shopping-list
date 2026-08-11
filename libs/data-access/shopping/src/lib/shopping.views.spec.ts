import { Product, ProductId } from '@shopping-list/core/crdt';

import {
  asCount,
  displayEmoji,
  displayQty,
  productUsage,
} from './shopping.views';

function product(values: Partial<Product> = {}): Product {
  return {
    id: 'p1' as ProductId,
    label: 'Lait',
    description: '',
    defaultQty: '',
    category: 'cremerie',
    imageRef: null,
    usage: {},
    lastUsedAt: 0,
    archivedAt: null,
    ...values,
  };
}

describe('displayEmoji', () => {
  it('affiche l’emoji choisi pour le produit', () => {
    expect(displayEmoji(product({ imageRef: 'emoji:🥛' }))).toBe('🥛');
  });

  it('retombe sur l’emoji du rayon quand le produit n’a pas d’image', () => {
    expect(displayEmoji(product({ imageRef: null }))).toBe('🥛');
  });

  it('garde un emoji de repli derrière une photo', () => {
    // Une photo peut n'être pas encore téléchargée — le cas normal juste après
    // un échange par QR code. L'emoji tient la place en attendant.
    expect(displayEmoji(product({ imageRef: 'blob:aaaa' }))).toBe('🥛');
  });

  it('range sous « divers » un rayon qu’il ne connaît pas', () => {
    // Un produit peut arriver d'un appareil plus récent : mieux vaut un caddie
    // que rien du tout.
    expect(displayEmoji(product({ category: 'rayon-du-futur' }))).toBe('🛒');
  });
});

describe('productUsage', () => {
  it('somme les compteurs de tous les appareils', () => {
    // C'est un G-Counter : la case d'un appareil ne dit pas combien de fois le
    // foyer a acheté le produit, seule la somme le dit.
    expect(
      productUsage(product({ usage: { 'device-A': 4, 'device-B': 3 } })),
    ).toBe(7);
  });

  it('vaut zéro pour un produit jamais repris', () => {
    expect(productUsage(product())).toBe(0);
  });
});

describe('displayQty', () => {
  it('préfixe un compte pur d’un « × »', () => {
    expect(displayQty('4')).toBe('×4');
  });

  it('n’affiche pas le compte 1 — c’est le défaut', () => {
    expect(displayQty('1')).toBe('');
  });

  it('laisse une quantité libre telle quelle', () => {
    expect(displayQty('500 g')).toBe('500 g');
    expect(displayQty('un pack de 4')).toBe('un pack de 4');
  });

  it('rend une chaîne vide pour l’absence de quantité', () => {
    expect(displayQty('')).toBe('');
  });
});

describe('asCount', () => {
  it('lit un compte pur comme un nombre', () => {
    expect(asCount('4')).toBe(4);
    expect(asCount('1')).toBe(1);
  });

  it('rend null pour une quantité libre — elle ne se compte pas', () => {
    expect(asCount('500 g')).toBeNull();
    expect(asCount('un pack de 4')).toBeNull();
    expect(asCount('')).toBeNull();
  });
});
