import { compress, decompress, isCompressionAvailable } from './compression';

/** La clé globale sous laquelle le code de production cherche l'API. */
const API = 'CompressionStream';

const holder = globalThis as unknown as Record<string, unknown>;

describe('compression deflate-raw', () => {
  it('fait un aller-retour fidèle', async () => {
    const charge = new Uint8Array(3000).map((_, i) => (i * 31) % 256);

    expect(await decompress(await compress(charge))).toEqual(charge);
  });

  it('raccourcit nettement une charge répétitive', async () => {
    // Les deltas Yjs se répètent beaucoup, et chaque octet gagné est de la
    // place reprise dans le QR code.
    const charge = new Uint8Array(5000).fill(42);

    const compressée = await compress(charge);

    expect(compressée.length).toBeLessThan(charge.length / 10);
    expect(await decompress(compressée)).toEqual(charge);
  });

  it('traverse une charge vide sans rien inventer', async () => {
    expect(await decompress(await compress(new Uint8Array()))).toEqual(
      new Uint8Array(),
    );
  });

  it('recompose une charge rendue en plusieurs morceaux', async () => {
    // Au-delà de quelques dizaines de kilo-octets, le flux rend plusieurs
    // blocs : ils doivent être recollés dans l'ordre, sans trou ni doublon.
    const charge = new Uint8Array(120_000).map((_, i) => (i * 7) % 256);

    expect(await decompress(await compress(charge))).toEqual(charge);
  });
});

describe('disponibilité de la compression', () => {
  it('reconnaît un environnement capable de compresser', () => {
    expect(isCompressionAvailable()).toBe(true);
  });

  it('le dit quand le navigateur ne sait pas compresser', () => {
    // Safari avant 16.4 : l'échange de proximité doit pouvoir s'annoncer
    // indisponible plutôt que casser au premier scan.
    const original = holder[API];
    delete holder[API];

    try {
      expect(isCompressionAvailable()).toBe(false);
    } finally {
      holder[API] = original;
    }
  });
});
