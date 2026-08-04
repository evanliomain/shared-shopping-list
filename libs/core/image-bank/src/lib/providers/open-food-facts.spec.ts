import { TranslatableError } from '@shopping-list/util/i18n';

import { fauxFetch } from '../testing/faux-fetch';
import { openFoodFactsProvider } from './open-food-facts';

function produit(overrides: Record<string, unknown> = {}): unknown {
  return {
    code: '3023290074374',
    product_name: 'Yaourt vanille',
    brands: "Siggi's",
    image_front_small_url:
      'https://images.openfoodfacts.org/images/products/302/front_fr.4.200.jpg',
    ...overrides,
  };
}

const cherche = (fetchImpl: typeof fetch, query = 'yaourt vanille') =>
  openFoodFactsProvider.search(query, fetchImpl);

describe('fournisseur Open Food Facts', () => {
  it('rend le packshot avec sa marque et son crédit', async () => {
    const { fetchImpl } = fauxFetch(() => ({ products: [produit()] }));

    expect(await cherche(fetchImpl)).toEqual([
      {
        id: '3023290074374',
        provider: 'openfoodfacts',
        thumbUrl:
          'https://images.openfoodfacts.org/images/products/302/front_fr.4.200.jpg',
        credit: {
          title: "Yaourt vanille — Siggi's",
          author: 'Open Food Facts',
          license: 'CC BY-SA 3.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
          sourceUrl: 'https://fr.openfoodfacts.org/produit/3023290074374',
        },
      },
    ]);
  });

  it('interroge l’index français', async () => {
    // Les libellés sont tapés en français : c'est l'index français qui les
    // reconnaît, pas le mondial.
    const { fetchImpl, appels } = fauxFetch(() => ({ products: [] }));

    await cherche(fetchImpl);

    expect(appels[0].url).toContain('fr.openfoodfacts.org');
    expect(appels[0].url).toContain('search_terms=yaourt+vanille');
  });

  it('ne répète pas la marque déjà contenue dans le nom', async () => {
    const { fetchImpl } = fauxFetch(() => ({
      products: [produit({ product_name: 'Yaourt Danone', brands: 'Danone' })],
    }));

    const [image] = await cherche(fetchImpl);

    expect(image.credit.title).toBe('Yaourt Danone');
  });

  it('ne garde que la première marque quand la fiche en cite plusieurs', async () => {
    const { fetchImpl } = fauxFetch(() => ({
      products: [produit({ brands: 'Siggi&#39;s, Siggis, Icelandic' })],
    }));

    const [image] = await cherche(fetchImpl);

    expect(image.credit.title).toBe('Yaourt vanille — Siggi&#39;s');
  });

  it('se passe de marque quand la fiche n’en a pas', async () => {
    const { fetchImpl } = fauxFetch(() => ({
      products: [produit({ brands: undefined })],
    }));

    const [image] = await cherche(fetchImpl);

    expect(image.credit.title).toBe('Yaourt vanille');
  });

  it('accepte une fiche sans nom de produit', async () => {
    const { fetchImpl } = fauxFetch(() => ({
      products: [produit({ product_name: undefined, brands: 'Danone' })],
    }));

    const [image] = await cherche(fetchImpl);

    expect(image.credit.title).toBe(' — Danone');
  });

  it('écarte les fiches sans photo, qui sont légion', async () => {
    // Beaucoup de fiches n'ont pas encore d'image : c'est le cas courant à
    // écarter, pas une anomalie.
    const { fetchImpl } = fauxFetch(() => ({
      products: [
        produit({ image_front_small_url: undefined }),
        produit({ code: undefined }),
        produit(),
      ],
    }));

    expect(await cherche(fetchImpl)).toHaveLength(1);
  });

  it('tolère une réponse sans produits', async () => {
    const { fetchImpl } = fauxFetch(() => ({}));

    expect(await cherche(fetchImpl)).toEqual([]);
  });

  it('signale l’indisponibilité du service', async () => {
    // Son infrastructure est régulièrement saturée : ce 503 est le cas
    // ordinaire, et c'est pour l'encaisser que la recherche a trois
    // fournisseurs.
    const { fetchImpl } = fauxFetch(() => new Response('', { status: 503 }));

    await expect(cherche(fetchImpl)).rejects.toThrow(TranslatableError);
  });
});
