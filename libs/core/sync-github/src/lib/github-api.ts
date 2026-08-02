import { TranslatableError } from '@shopping-list/util/i18n';

import { fromBase64, toBase64 } from './base64';

/** Où et avec quoi lire et écrire l'état partagé. */
export interface GithubConfig {
  readonly owner: string;
  readonly repo: string;
  /** PAT fine-grained, limité à `Contents: Read & Write` sur ce seul dépôt. */
  readonly token: string;
  readonly branch: string;
  readonly path: string;
}

export const DEFAULT_BRANCH = 'main';
export const DEFAULT_STATE_PATH = 'state.bin';

/** Le jeton est refusé ou expiré : réappairage nécessaire, inutile de réessayer. */
export class GithubAuthError extends TranslatableError {
  constructor(readonly status: number) {
    super(
      401 === status
        ? 'errors.github.tokenInvalid'
        : 'errors.github.tokenForbidden',
    );
    this.name = 'GithubAuthError';
  }
}

/** Quota horaire épuisé. Rare : le polling conditionnel n'en consomme presque pas. */
export class GithubRateLimitError extends TranslatableError {
  constructor(readonly resetAt: Date | null) {
    super('errors.github.rateLimited');
    this.name = 'GithubRateLimitError';
  }
}

export type ReadResult =
  /** 304 : rien de neuf, et **cette requête n'a pas consommé de quota**. */
  | { readonly kind: 'unchanged' }
  /** Le fichier n'existe pas encore : premier envoi. */
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'loaded';
      readonly sha: string;
      readonly update: Uint8Array;
      readonly etag: string | null;
    };

export type WriteResult =
  | { readonly kind: 'written'; readonly sha: string }
  /** Le `sha` fourni est périmé : quelqu'un a écrit entre-temps. */
  | { readonly kind: 'conflict' };

function contentsUrl(config: GithubConfig): string {
  const { owner, repo, path } = config;
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}

function headers(config: GithubConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function assertUsable(response: Response): void {
  if (401 === response.status || 403 === response.status) {
    // GitHub renvoie 403 aussi bien pour un quota épuisé que pour un droit
    // manquant ; c'est l'en-tête qui tranche.
    if ('0' === response.headers.get('x-ratelimit-remaining')) {
      const reset = response.headers.get('x-ratelimit-reset');
      throw new GithubRateLimitError(
        null === reset ? null : new Date(Number(reset) * 1000),
      );
    }
    throw new GithubAuthError(response.status);
  }
}

/**
 * Lit l'état distant, en requête conditionnelle si on connaît un ETag.
 *
 * Une réponse 304 **ne compte pas** dans le quota horaire, ce qui autorise à
 * interroger toutes les quelques secondes sans jamais s'approcher des 5000
 * requêtes/heure.
 */
export async function readState(
  config: GithubConfig,
  etag: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadResult> {
  const response = await fetchImpl(
    `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`,
    {
      headers:
        null === etag
          ? headers(config)
          : { ...headers(config), 'If-None-Match': etag },
      // Le cache HTTP du navigateur court-circuiterait la négociation d'ETag.
      cache: 'no-store',
    },
  );

  if (304 === response.status) {
    return { kind: 'unchanged' };
  }
  if (404 === response.status) {
    return { kind: 'absent' };
  }

  assertUsable(response);

  if (!response.ok) {
    throw new TranslatableError('errors.github.readFailed', {
      status: response.status,
    });
  }

  const body = (await response.json()) as { sha: string; content: string };

  return {
    kind: 'loaded',
    sha: body.sha,
    update: fromBase64(body.content),
    etag: response.headers.get('etag'),
  };
}

/**
 * Écrit l'état, en contrôle de concurrence optimiste.
 *
 * `sha` est celui de la version qu'on croit être la dernière. S'il est périmé,
 * GitHub refuse et on renvoie `conflict` — c'est à l'appelant de refusionner et
 * de rejouer. Le CRDT garantit que cette boucle converge.
 */
export async function writeState(
  config: GithubConfig,
  update: Uint8Array,
  sha: string | null,
  message: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WriteResult> {
  const response = await fetchImpl(contentsUrl(config), {
    method: 'PUT',
    headers: { ...headers(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: toBase64(update),
      branch: config.branch,
      ...(null === sha ? {} : { sha }),
    }),
  });

  // 409 : sha périmé. 422 : GitHub renvoie aussi ce code quand le fichier
  // existe déjà alors qu'on a envoyé la création sans sha.
  if (409 === response.status || 422 === response.status) {
    return { kind: 'conflict' };
  }

  assertUsable(response);

  if (!response.ok) {
    throw new TranslatableError('errors.github.writeFailed', {
      status: response.status,
    });
  }

  const body = (await response.json()) as { content: { sha: string } };
  return { kind: 'written', sha: body.content.sha };
}

/** Vérifie qu'un appairage est utilisable, avant de l'enregistrer. */
export async function checkAccess(
  config: GithubConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${config.owner}/${config.repo}`,
    { headers: headers(config), cache: 'no-store' },
  );

  assertUsable(response);

  if (404 === response.status) {
    throw new TranslatableError('errors.github.repoNotFound', {
      owner: config.owner,
      repo: config.repo,
    });
  }
  if (!response.ok) {
    throw new TranslatableError('errors.github.repoUnreachable', {
      status: response.status,
    });
  }
}
