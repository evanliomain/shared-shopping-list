import { parsePairingPayload } from './github-config.service';

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
      /pas un appairage valide/,
    );
  });

  it.each([
    ['version absente', { owner: 'a', repo: 'b', token: 'c' }],
    ['version inconnue', { ...valid, v: 2 }],
    ['dépôt manquant', { v: 1, owner: 'a', token: 'c' }],
    ['jeton manquant', { v: 1, owner: 'a', repo: 'b' }],
  ])('rejette un appairage incomplet : %s', (_, payload) => {
    expect(() => parsePairingPayload(JSON.stringify(payload))).toThrow(
      /pas un appairage valide/,
    );
  });
});
