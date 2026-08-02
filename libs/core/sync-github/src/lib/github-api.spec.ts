import { toBase64 } from './base64';
import {
  checkAccess,
  GithubAuthError,
  GithubConfig,
  GithubRateLimitError,
  readState,
  writeState,
} from './github-api';

const CONFIG: GithubConfig = {
  owner: 'evanliomain',
  repo: 'shopping-list-data',
  token: 'github_pat_xxx',
  branch: 'main',
  path: 'state.bin',
};

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(respond: (call: Call) => Response): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];

  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;

  return { fetch: impl, calls };
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('readState', () => {
  it('envoie le jeton et cible la bonne branche', async () => {
    const { fetch, calls } = stubFetch(
      () => new Response(null, { status: 404 }),
    );

    await readState(CONFIG, null, fetch);

    expect(calls[0].url).toBe(
      'https://api.github.com/repos/evanliomain/shopping-list-data/contents/state.bin?ref=main',
    );
    expect(
      (calls[0].init.headers as Record<string, string>)['Authorization'],
    ).toBe('Bearer github_pat_xxx');
    // Sans ça, le cache du navigateur court-circuiterait la négociation d'ETag.
    expect(calls[0].init.cache).toBe('no-store');
  });

  it('rend « absent » quand le fichier n’existe pas encore', async () => {
    const { fetch } = stubFetch(() => new Response(null, { status: 404 }));

    expect(await readState(CONFIG, null, fetch)).toEqual({ kind: 'absent' });
  });

  it('rend « unchanged » sur 304, sans lire de corps', async () => {
    const { fetch } = stubFetch(() => new Response(null, { status: 304 }));

    expect(await readState(CONFIG, '"abc"', fetch)).toEqual({
      kind: 'unchanged',
    });
  });

  it('joint l’ETag connu en requête conditionnelle', async () => {
    const { fetch, calls } = stubFetch(
      () => new Response(null, { status: 304 }),
    );

    await readState(CONFIG, '"abc"', fetch);

    expect(
      (calls[0].init.headers as Record<string, string>)['If-None-Match'],
    ).toBe('"abc"');
  });

  it('décode le contenu et remonte l’ETag', async () => {
    const update = new Uint8Array([1, 2, 3, 250]);
    const { fetch } = stubFetch(() =>
      json(200, { sha: 'sha-1', content: toBase64(update) }, { etag: '"v1"' }),
    );

    const result = await readState(CONFIG, null, fetch);

    expect(result).toEqual({
      kind: 'loaded',
      sha: 'sha-1',
      update,
      etag: '"v1"',
    });
  });

  it('accepte le base64 découpé en lignes que renvoie GitHub', async () => {
    const update = new Uint8Array(200).map((_, i) => i % 256);
    const wrapped = (toBase64(update).match(/.{1,60}/g) ?? []).join('\n');
    const { fetch } = stubFetch(() =>
      json(200, { sha: 'sha-1', content: wrapped }),
    );

    const result = await readState(CONFIG, null, fetch);

    expect(result).toMatchObject({ kind: 'loaded', update });
  });

  it('distingue un jeton invalide d’un quota épuisé', async () => {
    const unauthorized = stubFetch(() => new Response(null, { status: 401 }));
    await expect(readState(CONFIG, null, unauthorized.fetch)).rejects.toThrow(
      GithubAuthError,
    );

    // GitHub renvoie 403 pour les deux : c'est l'en-tête qui tranche.
    const forbidden = stubFetch(
      () =>
        new Response(null, {
          status: 403,
          headers: { 'x-ratelimit-remaining': '42' },
        }),
    );
    await expect(readState(CONFIG, null, forbidden.fetch)).rejects.toThrow(
      GithubAuthError,
    );

    const throttled = stubFetch(
      () =>
        new Response(null, {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1764000000',
          },
        }),
    );
    await expect(readState(CONFIG, null, throttled.fetch)).rejects.toThrow(
      GithubRateLimitError,
    );
  });
});

describe('writeState', () => {
  const update = new Uint8Array([9, 8, 7]);

  it('envoie le contenu en base64 avec le sha connu', async () => {
    const { fetch, calls } = stubFetch(() =>
      json(200, { content: { sha: 'sha-2' } }),
    );

    const result = await writeState(CONFIG, update, 'sha-1', 'message', fetch);

    expect(result).toEqual({ kind: 'written', sha: 'sha-2' });
    expect(calls[0].init.method).toBe('PUT');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      message: 'message',
      content: toBase64(update),
      branch: 'main',
      sha: 'sha-1',
    });
  });

  it('omet le sha à la création du fichier', async () => {
    const { fetch, calls } = stubFetch(() =>
      json(200, { content: { sha: 'sha-1' } }),
    );

    await writeState(CONFIG, update, null, 'création', fetch);

    expect(JSON.parse(calls[0].init.body as string).sha).toBeUndefined();
  });

  it.each([409, 422])(
    'traite le statut %i comme un conflit',
    async (status) => {
      // 422 arrive quand on tente une création alors que le fichier existe déjà.
      const { fetch } = stubFetch(() => new Response(null, { status }));

      expect(await writeState(CONFIG, update, null, 'm', fetch)).toEqual({
        kind: 'conflict',
      });
    },
  );

  it('remonte une erreur d’authentification plutôt qu’un conflit', async () => {
    const { fetch } = stubFetch(() => new Response(null, { status: 401 }));

    await expect(
      writeState(CONFIG, update, 'sha-1', 'm', fetch),
    ).rejects.toThrow(GithubAuthError);
  });
});

describe('checkAccess', () => {
  it('passe quand le dépôt répond', async () => {
    const { fetch } = stubFetch(() => json(200, { full_name: 'x/y' }));

    await expect(checkAccess(CONFIG, fetch)).resolves.toBeUndefined();
  });

  it('explique qu’un dépôt est introuvable', async () => {
    const { fetch } = stubFetch(() => new Response(null, { status: 404 }));

    await expect(checkAccess(CONFIG, fetch)).rejects.toThrow(
      'errors.github.repoNotFound',
    );
  });

  it('rejette un jeton sans droit', async () => {
    const { fetch } = stubFetch(
      () =>
        new Response(null, {
          status: 403,
          headers: { 'x-ratelimit-remaining': '100' },
        }),
    );

    await expect(checkAccess(CONFIG, fetch)).rejects.toThrow(GithubAuthError);
  });
});
