import { toBase64 } from './base64';
import { GithubAuthError, GithubConfig } from './github-api';
import { fetchImage, pushImage } from './image-sync';

const CONFIG: GithubConfig = {
  owner: 'evanliomain',
  repo: 'shopping-list-data',
  token: 'github_pat_xxx',
  branch: 'main',
  path: 'state.bin',
};

const HASH = 'a3f9c2d1e8b47f05';
const BYTES = new Uint8Array([1, 2, 3, 4]);

interface Call {
  url: string;
  method: string;
}

function stubFetch(respond: (call: Call) => Response): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];

  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET' };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;

  return { fetch: impl, calls };
}

describe('fetchImage', () => {
  it('télécharge et décode', async () => {
    const { fetch, calls } = stubFetch(
      () =>
        new Response(JSON.stringify({ content: toBase64(BYTES) }), {
          status: 200,
        }),
    );

    expect(await fetchImage(CONFIG, HASH, fetch)).toEqual({
      kind: 'found',
      bytes: BYTES,
    });
    expect(calls[0].url).toContain(`/contents/images/${HASH}.webp`);
  });

  it('traite l’absence comme un cas normal', async () => {
    // Après un échange par QR, les produits arrivent sans leurs photos :
    // l'image manquante n'est pas une erreur, juste un emoji de repli.
    const { fetch } = stubFetch(() => new Response(null, { status: 404 }));

    expect(await fetchImage(CONFIG, HASH, fetch)).toEqual({ kind: 'absent' });
  });

  it('remonte un jeton invalide', async () => {
    const { fetch } = stubFetch(() => new Response(null, { status: 401 }));

    await expect(fetchImage(CONFIG, HASH, fetch)).rejects.toThrow(
      GithubAuthError,
    );
  });
});

describe('pushImage', () => {
  it('n’envoie rien si l’image est déjà publiée', async () => {
    // Le contenu est adressé par son empreinte : réécrire ne produirait que les
    // mêmes octets.
    const { fetch, calls } = stubFetch(
      () => new Response(null, { status: 200 }),
    );

    expect(await pushImage(CONFIG, HASH, BYTES, fetch)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('HEAD');
  });

  it('envoie quand l’image manque', async () => {
    const { fetch, calls } = stubFetch((call) =>
      'HEAD' === call.method
        ? new Response(null, { status: 404 })
        : new Response(JSON.stringify({ content: { sha: 'x' } }), {
            status: 201,
          }),
    );

    expect(await pushImage(CONFIG, HASH, BYTES, fetch)).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'PUT']);
  });

  it('traite une publication concurrente comme un succès', async () => {
    // L'autre téléphone a publié la même image entre notre vérification et
    // notre envoi. Le contenu étant identique par construction, c'est le
    // résultat voulu — pas une erreur à signaler.
    const { fetch } = stubFetch((call) =>
      'HEAD' === call.method
        ? new Response(null, { status: 404 })
        : new Response(null, { status: 422 }),
    );

    expect(await pushImage(CONFIG, HASH, BYTES, fetch)).toBe(false);
  });

  it('remonte un jeton invalide', async () => {
    const { fetch } = stubFetch(() => new Response(null, { status: 401 }));

    await expect(pushImage(CONFIG, HASH, BYTES, fetch)).rejects.toThrow(
      GithubAuthError,
    );
  });
});
