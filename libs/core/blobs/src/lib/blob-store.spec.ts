import {
  deleteBlob,
  hasBlob,
  listBlobHashes,
  readBlob,
  StoredBlob,
  writeBlob,
} from './blob-store';
import { FakeIndexedDb, installFakeIndexedDb } from './testing/fake-indexeddb';

const NOW = 1_764_000_000_000;
const MIME = 'image/webp';
const BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

function entry(hash: string): StoredBlob {
  return { hash, mime: MIME, bytes: BYTES, storedAt: NOW };
}

describe('blob-store', () => {
  let db: FakeIndexedDb;

  afterEach(() => {
    db.restore();
  });

  describe('sur une base neuve', () => {
    beforeEach(() => {
      db = installFakeIndexedDb();
    });

    it('crée le magasin à la première ouverture', async () => {
      await writeBlob('a1', BYTES, MIME, NOW);

      expect(db.created).toEqual(['blobs']);
    });

    it('rend une photo telle qu’elle a été rangée', async () => {
      await writeBlob('a1', BYTES, MIME, NOW);

      expect(await readBlob('a1')).toEqual({
        hash: 'a1',
        mime: MIME,
        bytes: BYTES,
        storedAt: NOW,
      });
    });

    it('ne rend rien pour une empreinte inconnue', async () => {
      // Après un échange par QR, les produits arrivent sans leurs photos :
      // l'absence est un état normal, pas une erreur.
      expect(await readBlob('jamais-rangée')).toBeNull();
    });

    it('dit si une photo est déjà là', async () => {
      // C'est ce qui évite de réécrire une image déjà stockée.
      await writeBlob('a1', BYTES, MIME, NOW);

      expect(await hasBlob('a1')).toBe(true);
      expect(await hasBlob('b2')).toBe(false);
    });

    it('énumère les empreintes rangées', async () => {
      await writeBlob('a1', BYTES, MIME, NOW);
      await writeBlob('b2', BYTES, MIME, NOW);

      expect((await listBlobHashes()).sort()).toEqual(['a1', 'b2']);
    });

    it('n’énumère rien quand rien n’a été rangé', async () => {
      expect(await listBlobHashes()).toEqual([]);
    });

    it('efface une photo sans toucher aux autres', async () => {
      await writeBlob('a1', BYTES, MIME, NOW);
      await writeBlob('b2', BYTES, MIME, NOW);

      await deleteBlob('a1');

      expect(await listBlobHashes()).toEqual(['b2']);
      expect(await readBlob('a1')).toBeNull();
    });

    it('n’écrase pas une entrée par une empreinte différente', async () => {
      // L'empreinte *est* le nom : deux contenus distincts cohabitent.
      await writeBlob('a1', new Uint8Array([1]), MIME, NOW);
      await writeBlob('b2', new Uint8Array([2]), MIME, NOW);

      expect(db.rows().map((row) => row.bytes)).toEqual([
        new Uint8Array([1]),
        new Uint8Array([2]),
      ]);
    });

    it('referme la connexion après chaque opération', async () => {
      // Une connexion laissée ouverte bloquerait la montée de version suivante.
      await writeBlob('a1', BYTES, MIME, NOW);
      await readBlob('a1');
      await deleteBlob('a1');

      expect(db.closes).toBe(3);
    });
  });

  describe('sur une base déjà pourvue de son magasin', () => {
    beforeEach(() => {
      db = installFakeIndexedDb({ entries: [entry('a1')] });
    });

    it('ne recrée pas le magasin, donc ne perd pas les photos', async () => {
      expect(await readBlob('a1')).toMatchObject({ hash: 'a1' });
      expect(db.created).toEqual([]);
    });
  });

  describe('quand IndexedDB refuse', () => {
    beforeEach(() => {
      db = installFakeIndexedDb();
    });

    it('remonte une base impossible à ouvrir', async () => {
      // Navigation privée sur Safari, ou stockage désactivé : l'appelant doit
      // pouvoir retomber sur les emoji plutôt que rester bloqué.
      db.failing.add('open');

      await expect(readBlob('a1')).rejects.toThrow('open indisponible');
    });

    it('remonte une écriture refusée en refermant la connexion', async () => {
      // Le quota dépassé, par exemple. Sans le `finally`, la connexion resterait
      // ouverte et l'opération suivante attendrait indéfiniment.
      db.failing.add('put');

      await expect(writeBlob('a1', BYTES, MIME, NOW)).rejects.toThrow(
        'put indisponible',
      );
      expect(db.closes).toBe(1);
    });

    it('remonte un inventaire refusé', async () => {
      db.failing.add('getAllKeys');

      await expect(listBlobHashes()).rejects.toThrow('getAllKeys indisponible');
    });
  });
});
