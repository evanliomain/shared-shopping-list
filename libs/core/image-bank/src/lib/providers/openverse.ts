import { TranslatableError } from '@shopping-list/util/i18n';

import {
  BankImage,
  BankProvider,
  formatLicense,
  PER_PROVIDER,
} from '../bank-image';

/**
 * [Openverse](https://openverse.org) — l'agrégateur.
 *
 * Il indexe Flickr, Wikimedia Commons et des collections de musées : c'est celui
 * qui rend les photos les plus flatteuses, et le seul à répondre quelque chose
 * sur un libellé qui n'est pas un produit alimentaire.
 *
 * Aucune clé, CORS ouvert sur la recherche **et** sur les vignettes, licences
 * explicites sur chaque résultat.
 */
const ENDPOINT = 'https://api.openverse.org/v1/images/';

/**
 * La forme des résultats, telle que l'API les rend.
 *
 * Tout est facultatif à dessein : c'est un service tiers, et un champ manquant
 * doit écarter un résultat, pas casser l'écran.
 */
interface OpenverseResult {
  readonly id?: string;
  readonly title?: string;
  readonly thumbnail?: string;
  readonly creator?: string;
  readonly license?: string;
  readonly license_version?: string;
  readonly license_url?: string;
  readonly foreign_landing_url?: string;
}

interface OpenverseResponse {
  readonly results?: readonly OpenverseResult[];
}

/**
 * Un résultat n'est retenu que s'il porte de quoi être montré **et** crédité.
 *
 * Sans vignette il n'y a rien à afficher ; sans auteur ni licence on ne peut pas
 * créditer, et une image qu'on ne peut pas créditer n'a pas à être proposée —
 * l'application la republie dans le dépôt de synchro.
 */
function toBankImage(result: OpenverseResult): BankImage | null {
  const { id, thumbnail, creator, license } = result;

  if (
    undefined === id ||
    undefined === thumbnail ||
    undefined === creator ||
    undefined === license
  ) {
    return null;
  }

  return {
    id,
    provider: 'openverse',
    thumbUrl: thumbnail,
    credit: {
      title: result.title ?? '',
      author: creator,
      license: formatLicense(license, result.license_version ?? ''),
      licenseUrl: result.license_url ?? '',
      sourceUrl: result.foreign_landing_url ?? '',
    },
  };
}

/**
 * La vignette demandée est celle que **la banque** sert, pas l'original.
 *
 * C'est ce qui rend la fonctionnalité possible : il faut lire les octets pour
 * les réduire en WebP de 160 px, donc il faut le CORS — que Flickr accorde, mais
 * pas tous les hébergeurs qu'Openverse agrège. Son proxy, lui, l'accorde
 * toujours.
 *
 * Le filtre de contenu sensible n'est pas demandé parce qu'il est le défaut de
 * l'API — mais il vaut d'être dit : c'est une liste de courses familiale, et les
 * résultats passent sous les yeux sans qu'on les ait choisis.
 */
async function search(
  query: string,
  fetchImpl: typeof fetch,
): Promise<readonly BankImage[]> {
  const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&page_size=${PER_PROVIDER}`;
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new TranslatableError('errors.imageBank.providerFailed', {
      provider: 'Openverse',
      status: response.status,
    });
  }

  const body = (await response.json()) as OpenverseResponse;

  return (body.results ?? [])
    .map(toBankImage)
    .filter((image): image is BankImage => null !== image);
}

export const openverseProvider: BankProvider = { id: 'openverse', search };
