import { fromBase64, toBase64 } from './base64';
import { GithubAuthError, GithubConfig } from './github-api';

/**
 * Synchronisation des photos, séparée du chemin chaud.
 *
 * `state.bin` est lu et écrit en permanence ; `images/` est froid : écriture
 * unique, lecture paresseuse, cache définitif. Une photo en cours d'envoi ne
 * doit jamais retarder la synchronisation de la liste — c'est pour ça que les
 * deux flux ne se croisent pas.
 *
 * Les fichiers étant nommés par l'empreinte de leur contenu, ils sont
 * **immuables** : pas de `sha` à gérer, pas de conflit possible, et un cache
 * qui n'a jamais besoin d'être invalidé.
 */
const IMAGE_DIRECTORY = 'images';

function imageUrl(config: GithubConfig, hash: string): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${IMAGE_DIRECTORY}/${hash}.webp`;
}

function headers(config: GithubConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export type ImageFetchResult =
  | { readonly kind: 'found'; readonly bytes: Uint8Array }
  | { readonly kind: 'absent' };

/** Télécharge une image. `absent` si l'autre appareil ne l'a pas encore publiée. */
export async function fetchImage(
  config: GithubConfig,
  hash: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageFetchResult> {
  const response = await fetchImpl(imageUrl(config, hash), {
    headers: headers(config),
    cache: 'no-store',
  });

  if (404 === response.status) {
    return { kind: 'absent' };
  }
  if (401 === response.status) {
    throw new GithubAuthError(401);
  }
  if (!response.ok) {
    throw new Error(`Image inaccessible (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as { content: string };
  return { kind: 'found', bytes: fromBase64(body.content) };
}

/**
 * Publie une image, si elle ne l'est pas déjà.
 *
 * Le contenu étant adressé par son empreinte, une seconde écriture ne pourrait
 * qu'écrire les mêmes octets : on vérifie donc d'abord, et un conflit (422,
 * « le fichier existe déjà ») est un succès, pas une erreur.
 *
 * @returns `true` si l'envoi a réellement eu lieu.
 */
export async function pushImage(
  config: GithubConfig,
  hash: string,
  bytes: Uint8Array,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const existing = await fetchImpl(imageUrl(config, hash), {
    method: 'HEAD',
    headers: headers(config),
    cache: 'no-store',
  });

  if (existing.ok) {
    return false;
  }
  if (401 === existing.status) {
    throw new GithubAuthError(401);
  }

  const response = await fetchImpl(imageUrl(config, hash), {
    method: 'PUT',
    headers: { ...headers(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Image ${hash}`,
      content: toBase64(bytes),
      branch: config.branch,
    }),
  });

  // Quelqu'un l'a publiée entre notre vérification et notre envoi. Comme le
  // contenu est identique par construction, c'est exactement le résultat voulu.
  if (422 === response.status || 409 === response.status) {
    return false;
  }
  if (401 === response.status) {
    throw new GithubAuthError(401);
  }
  if (!response.ok) {
    throw new Error(`Envoi de l'image impossible (HTTP ${response.status}).`);
  }

  return true;
}
