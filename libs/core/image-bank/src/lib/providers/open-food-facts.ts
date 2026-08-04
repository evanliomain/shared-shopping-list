import { TranslatableError } from '@shopping-list/util/i18n';

import { BankImage, BankProvider, PER_PROVIDER } from '../bank-image';

/**
 * [Open Food Facts](https://openfoodfacts.org) — les vrais produits.
 *
 * C'est le fournisseur le plus juste pour une liste de courses, et le seul dont
 * les images soient des photos d'emballage prises en magasin plutôt que des
 * photographies d'auteur : « Yaourt vanille » y rend des yaourts à la vanille,
 * là où les banques généralistes rendent des gousses de vanille.
 *
 * Deux limites, assumées :
 *
 *  - **il ne connaît que l'alimentaire.** Le papier toilette et la lessive n'y
 *    sont pas — ils vivent dans les bases sœurs. D'où les autres fournisseurs ;
 *  - **il tombe.** Son infrastructure est régulièrement saturée et rend un 503.
 *    C'est précisément ce que la recherche à plusieurs fournisseurs encaisse :
 *    celui qui ne répond pas est ignoré, et les autres remplissent la grille.
 *
 * Le domaine `fr` plutôt que `world` : les libellés sont tapés en français, et
 * c'est l'index français qui les reconnaît.
 */
const ENDPOINT = 'https://fr.openfoodfacts.org/cgi/search.pl';

/**
 * Les photos sont sous CC BY-SA, versées par les contributeurs.
 *
 * L'API de recherche ne dit pas qui a pris quelle photo — l'information existe
 * mais demanderait un appel par produit. Créditer le projet est la pratique
 * admise, et c'est ce que fait leur propre documentation.
 */
const AUTHOR = 'Open Food Facts';
const LICENSE = 'CC BY-SA 3.0';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/3.0/';

function url(query: string): string {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: `${PER_PROVIDER}`,
    fields: 'code,product_name,brands,image_front_small_url',
  });

  return `${ENDPOINT}?${params.toString()}`;
}

interface Product {
  readonly code?: string;
  readonly product_name?: string;
  readonly brands?: string;
  readonly image_front_small_url?: string;
}

interface OpenFoodFactsResponse {
  readonly products?: readonly Product[];
}

/**
 * Le titre porte la marque quand elle est connue.
 *
 * Deux packshots de yaourt à la vanille se ressemblent ; c'est la marque qui
 * permet de reconnaître le sien dans la grille.
 */
function title(product: Product): string {
  const name = product.product_name ?? '';
  const brand = (product.brands ?? '').split(',')[0].trim();

  return '' === brand || name.toLowerCase().includes(brand.toLowerCase())
    ? name
    : `${name} — ${brand}`;
}

function toBankImage(product: Product): BankImage | null {
  const { code, image_front_small_url: thumbUrl } = product;

  // Beaucoup de fiches n'ont pas encore de photo : c'est le cas le plus courant
  // à écarter, pas une anomalie.
  if (undefined === code || undefined === thumbUrl) {
    return null;
  }

  return {
    id: code,
    provider: 'openfoodfacts',
    thumbUrl,
    credit: {
      title: title(product),
      author: AUTHOR,
      license: LICENSE,
      licenseUrl: LICENSE_URL,
      sourceUrl: `https://fr.openfoodfacts.org/produit/${code}`,
    },
  };
}

async function search(
  query: string,
  fetchImpl: typeof fetch,
): Promise<readonly BankImage[]> {
  const response = await fetchImpl(url(query));

  if (!response.ok) {
    throw new TranslatableError('errors.imageBank.providerFailed', {
      provider: 'Open Food Facts',
      status: response.status,
    });
  }

  const body = (await response.json()) as OpenFoodFactsResponse;

  return (body.products ?? [])
    .map(toBankImage)
    .filter((image): image is BankImage => null !== image);
}

export const openFoodFactsProvider: BankProvider = {
  id: 'openfoodfacts',
  search,
};
