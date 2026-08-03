import { TestBed } from '@angular/core/testing';

import {
  GithubConfigService,
  parsePairingPayload,
} from './github-config.service';
import { FakeIndexedDb, installFakeIndexedDb } from './testing/fake-indexeddb';

describe('parsePairingPayload', () => {
  const valid = {
    v: 1,
    owner: 'evanliomain',
    repo: 'shopping-list-data',
    token: 'github_pat_xxx',
  };

  it('accepte un appairage complet', () => {
    expect(parsePairingPayload(JSON.stringify(valid))).toEqual(valid);
  });

  it('conserve branche et chemin quand ils sont fournis', () => {
    const withPaths = { ...valid, branch: 'principale', path: 'etat.bin' };

    expect(parsePairingPayload(JSON.stringify(withPaths))).toMatchObject({
      branch: 'principale',
      path: 'etat.bin',
    });
  });

  it('rejette ce qui n’est pas du JSON', () => {
    // La caméra lit toutes sortes de codes-barres : celui d'un paquet de pâtes
    // ne doit pas être pris pour un appairage.
    expect(() => parsePairingPayload('3760020507350')).toThrow(
      'errors.pairing.invalidCode',
    );
  });

  it('rejette un code qui n’est même pas analysable', () => {
    // Le plus courant sur un produit : l'étiquette encode une URL.
    expect(() =>
      parsePairingPayload('https://fr.openfoodfacts.org/produit/376002050735'),
    ).toThrow('errors.pairing.invalidCode');
  });

  it.each([
    ['version absente', { owner: 'a', repo: 'b', token: 'c' }],
    ['version inconnue', { ...valid, v: 2 }],
    ['dépôt manquant', { v: 1, owner: 'a', token: 'c' }],
    ['jeton manquant', { v: 1, owner: 'a', repo: 'b' }],
  ])('rejette un appairage incomplet : %s', (_, payload) => {
    expect(() => parsePairingPayload(JSON.stringify(payload))).toThrow(
      'errors.pairing.invalidCode',
    );
  });
});

const PAYLOAD = {
  v: 1,
  owner: 'evanliomain',
  repo: 'shopping-list-data',
  token: 'github_pat_xxx',
} as const;

/** Réponse fixe de l'API GitHub ; rend une fonction de démontage. */
function stubFetch(status: number): () => void {
  const previous = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ full_name: 'evanliomain/shopping-list-data' }),
      {
        status,
      },
    )) as unknown as typeof fetch;

  return () => {
    globalThis.fetch = previous;
  };
}

describe('GithubConfigService', () => {
  let base: FakeIndexedDb;
  let restoreFetch: () => void;

  function service(): GithubConfigService {
    TestBed.configureTestingModule({});
    return TestBed.inject(GithubConfigService);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    base = installFakeIndexedDb();
    restoreFetch = stubFetch(200);
  });

  afterEach(() => {
    restoreFetch();
    base.restore();
  });

  describe('load', () => {
    it('n’a rien à restituer au premier lancement', async () => {
      const config = service();

      expect(await config.load()).toBeNull();
      expect(config.config()).toBeNull();
      // La page d'appairage attend ce drapeau pour savoir qu'elle peut décider.
      expect(config.loaded()).toBe(true);
    });

    it('retrouve l’appairage au démarrage suivant', async () => {
      await service().pair(PAYLOAD);

      TestBed.resetTestingModule();
      const next = service();

      expect(await next.load()).toMatchObject({ owner: 'evanliomain' });
      expect(next.config()).toMatchObject({ repo: 'shopping-list-data' });
    });

    it('reste utilisable quand le stockage refuse de s’ouvrir', async () => {
      // Navigation privée : mieux vaut démarrer en solo que ne pas démarrer.
      base.failNextOpen();
      const config = service();

      expect(await config.load()).toBeNull();
      expect(config.config()).toBeNull();
      expect(config.loaded()).toBe(true);
    });
  });

  describe('pair', () => {
    it('complète la branche et le chemin par défaut', async () => {
      expect(await service().pair(PAYLOAD)).toMatchObject({
        branch: 'main',
        path: 'state.bin',
      });
    });

    it('complète aussi quand ils n’ont que des espaces', async () => {
      // Un champ laissé vide dans le formulaire d'appairage arrive comme ça.
      expect(
        await service().pair({ ...PAYLOAD, branch: '  ', path: ' ' }),
      ).toMatchObject({ branch: 'main', path: 'state.bin' });
    });

    it('respecte la branche et le chemin demandés', async () => {
      expect(
        await service().pair({
          ...PAYLOAD,
          branch: 'principale',
          path: 'etat.bin',
        }),
      ).toMatchObject({ branch: 'principale', path: 'etat.bin' });
    });

    it('rogne les espaces autour des champs recopiés à la main', async () => {
      // Un copier-coller de jeton ramène presque toujours une espace, et GitHub
      // refuserait l'en-tête sans un mot d'explication.
      expect(
        await service().pair({
          ...PAYLOAD,
          owner: ' evanliomain ',
          repo: '\tshopping-list-data\n',
          token: ' github_pat_xxx ',
        }),
      ).toEqual({
        owner: 'evanliomain',
        repo: 'shopping-list-data',
        token: 'github_pat_xxx',
        branch: 'main',
        path: 'state.bin',
      });
    });

    it('n’enregistre rien quand le jeton est refusé', async () => {
      // Découvrir un jeton invalide au milieu des courses serait bien pire
      // qu'un refus immédiat.
      restoreFetch();
      restoreFetch = stubFetch(401);
      const config = service();

      await expect(config.pair(PAYLOAD)).rejects.toThrow(
        'errors.github.tokenInvalid',
      );
      expect(config.config()).toBeNull();

      TestBed.resetTestingModule();
      expect(await service().load()).toBeNull();
    });
  });

  it('oublie l’appairage, y compris au démarrage suivant', async () => {
    const config = service();
    await config.pair(PAYLOAD);

    await config.unpair();

    expect(config.config()).toBeNull();
    // Le jeton doit avoir quitté le stockage, pas seulement le signal.
    TestBed.resetTestingModule();
    expect(await service().load()).toBeNull();
  });

  describe('toPairingPayload', () => {
    it('n’a rien à encoder sans appairage', () => {
      expect(service().toPairingPayload()).toBeNull();
    });

    it('transporte de quoi appairer le second téléphone', async () => {
      const config = service();
      await config.pair({ ...PAYLOAD, branch: 'principale' });

      const payload = config.toPairingPayload();

      expect(payload).toEqual({
        v: 1,
        owner: 'evanliomain',
        repo: 'shopping-list-data',
        token: 'github_pat_xxx',
        branch: 'principale',
        path: 'state.bin',
      });
      // Ce qui sort du QR doit pouvoir y rentrer.
      expect(parsePairingPayload(JSON.stringify(payload))).toEqual(payload);
    });
  });
});
