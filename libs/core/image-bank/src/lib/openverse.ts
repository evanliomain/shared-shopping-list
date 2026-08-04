import { TranslatableError } from '@shopping-list/util/i18n';

import { BankImage, formatLicense } from './bank-image';

/**
 * La banque d'images : [Openverse](https://openverse.org).
 *
 * Trois raisons de celle-là plutôt qu'une autre :
 *
 *  - **aucune clé d'API.** Le front est servi par GitHub Pages depuis un dépôt
 *    public : une clé y serait lisible par tout le monde. Les banques les plus
 *    léchées — Unsplash, Pexels — en exigent une, et Google Images n'a plus
 *    d'API publique du tout depuis 2011 ;
 *  - **le CORS est ouvert**, sur la recherche comme sur les vignettes. Sans lui
 *    le navigateur ne peut pas lire les octets, donc ne peut pas les réduire en
 *    WebP de 160 px : la fonctionnalité serait impossible, pas seulement moins
 *    commode ;
 *  - **les licences sont explicites.** Chaque résultat dit son auteur et sa
 *    licence, ce qui permet de créditer. L'application republie chaque image
 *    dans le dépôt de synchro : sans licence, ce serait une republication sans
 *    droit.
 *
 * Elle agrège Flickr, Wikimedia Commons et des collections de musées — la
 * variété d'un moteur de recherche, avec des licences en règle.
 */
const ENDPOINT = 'https://api.openverse.org/v1/images/';

/** De quoi remplir une grille de résultats sans avoir à la faire défiler. */
export const BANK_PAGE_SIZE = 12;

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
 * Sans vignette il n'y a rien à afficher ; sans auteur ni licence on ne peut
 * pas créditer, et une image qu'on ne peut pas créditer n'a pas à être
 * proposée.
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
 * Cherche des images pour une requête.
 *
 * Une requête vide ne part pas : c'est l'état du champ de recherche à
 * l'ouverture, et l'API répondrait par une erreur.
 *
 * Le filtre de contenu sensible n'est pas demandé parce qu'il est le défaut de
 * l'API — mais il vaut d'être dit : c'est une liste de courses familiale, et
 * les résultats passent sous les yeux sans qu'on les ait choisis.
 */
export async function searchBankImages(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly BankImage[]> {
  const trimmed = query.trim();

  if ('' === trimmed) {
    return [];
  }

  const url = `${ENDPOINT}?q=${encodeURIComponent(trimmed)}&page_size=${BANK_PAGE_SIZE}`;
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new TranslatableError('errors.imageBank.unreachable', {
      status: response.status,
    });
  }

  const body = (await response.json()) as OpenverseResponse;

  return (body.results ?? [])
    .map(toBankImage)
    .filter((image): image is BankImage => null !== image);
}

/**
 * L'image à proposer d'office pour un libellé, s'il en existe une.
 *
 * Deux tentatives au plus, et la seconde est ce qui fait la différence en
 * pratique. La recherche automatique se déclenche là où le dictionnaire d'emoji
 * n'a rien reconnu — donc sur des libellés inhabituels, souvent en français et
 * souvent à plusieurs mots, que la banque ne connaît pas tels quels. « Yaourt
 * vanille » ne rend presque rien ; « yaourt » rend ce qu'il faut.
 *
 * On n'élargit qu'après un échec complet, jamais pour compléter une réponse
 * maigre : un seul résultat exact vaut mieux que douze résultats approximatifs.
 */
export async function findBankImage(
  label: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BankImage | null> {
  const exact = await searchBankImages(label, fetchImpl);

  if (0 < exact.length) {
    return exact[0];
  }

  const firstWord = label.trim().split(/\s+/)[0];

  if (firstWord === label.trim()) {
    return null;
  }

  const broadened = await searchBankImages(firstWord, fetchImpl);
  return broadened[0] ?? null;
}
