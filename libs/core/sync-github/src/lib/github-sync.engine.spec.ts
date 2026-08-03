import * as Y from 'yjs';

import { ReadResult, WriteResult } from './github-api';
import { GithubSyncEngine, SyncPort } from './github-sync.engine';

const ORIGIN = Symbol('distant');

/**
 * Dépôt distant simulé : un contenu, un `sha`, un ETag.
 *
 * Assez fidèle pour éprouver ce qui compte — la négociation d'ETag et le refus
 * d'écriture sur `sha` périmé — sans toucher au réseau.
 */
class FakeRepo implements SyncPort {
  content: Uint8Array | null = null;
  sha: string | null = null;
  private revision = 0;

  readonly reads: Array<string | null> = [];
  readonly writes: Array<string | null> = [];
  /** Nombre de lectures ayant réellement transféré du contenu (non-304). */
  billedReads = 0;

  async read(etag: string | null): Promise<ReadResult> {
    this.reads.push(etag);

    if (null === this.content || null === this.sha) {
      return { kind: 'absent' };
    }

    if (null !== etag && etag === this.etagOf(this.sha)) {
      return { kind: 'unchanged' };
    }

    this.billedReads++;
    return {
      kind: 'loaded',
      sha: this.sha,
      update: this.content,
      etag: this.etagOf(this.sha),
    };
  }

  async write(update: Uint8Array, sha: string | null): Promise<WriteResult> {
    this.writes.push(sha);

    if (sha !== this.sha) {
      return { kind: 'conflict' };
    }

    this.content = update;
    this.sha = `sha-${++this.revision}`;
    return { kind: 'written', sha: this.sha };
  }

  /** Écriture par « l'autre téléphone », hors du moteur testé. */
  writeExternally(doc: Y.Doc): void {
    this.content = Y.encodeStateAsUpdate(doc);
    this.sha = `sha-${++this.revision}`;
  }

  private etagOf(sha: string): string {
    return `"${sha}"`;
  }
}

function engineOn(doc: Y.Doc, repo: FakeRepo, maxAttempts = 5) {
  return new GithubSyncEngine(doc, repo, ORIGIN, {
    maxAttempts,
    wait: () => Promise.resolve(),
  });
}

function courses(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>('courses');
}

describe('GithubSyncEngine', () => {
  describe('pull', () => {
    it('signale l’absence de fichier au premier démarrage', async () => {
      const repo = new FakeRepo();
      const engine = engineOn(new Y.Doc(), repo);

      expect(await engine.pull()).toBe('absent');
    });

    it('applique le contenu distant', async () => {
      const remote = new Y.Doc();
      courses(remote).set('a', 'Lait');

      const repo = new FakeRepo();
      repo.writeExternally(remote);

      const local = new Y.Doc();
      await engineOn(local, repo).pull();

      expect([...courses(local).values()]).toEqual(['Lait']);
    });

    it('ne consomme pas de quota quand rien n’a changé', async () => {
      // Le point qui rend le polling à 4 s tenable : GitHub ne facture pas les
      // réponses 304.
      const remote = new Y.Doc();
      courses(remote).set('a', 'Lait');

      const repo = new FakeRepo();
      repo.writeExternally(remote);

      const engine = engineOn(new Y.Doc(), repo);
      await engine.pull();
      expect(repo.billedReads).toBe(1);

      for (let i = 0; i < 20; i++) {
        expect(await engine.pull()).toBe('unchanged');
      }

      expect(repo.billedReads).toBe(1);
      // Les 20 lectures suivantes ont bien été conditionnelles.
      expect(repo.reads.slice(1).every((etag) => null !== etag)).toBe(true);
    });

    it('marque les mises à jour distantes de l’origine fournie', async () => {
      const remote = new Y.Doc();
      courses(remote).set('a', 'Lait');
      const repo = new FakeRepo();
      repo.writeExternally(remote);

      const local = new Y.Doc();
      const origins: unknown[] = [];
      local.on('update', (_u: Uint8Array, origin: unknown) =>
        origins.push(origin),
      );

      await engineOn(local, repo).pull();

      // Sans ce marquage, le provider rediffuserait vers GitHub ce qu'il vient
      // d'en recevoir.
      expect(origins).toEqual([ORIGIN]);
    });
  });

  describe('push', () => {
    it('crée le fichier au premier envoi', async () => {
      const repo = new FakeRepo();
      const doc = new Y.Doc();
      courses(doc).set('a', 'Lait');

      await engineOn(doc, repo).push();

      expect(repo.content).not.toBeNull();
      expect(repo.writes).toEqual([null]);
    });

    it('n’écrit qu’une requête quand personne n’a touché au dépôt', async () => {
      const repo = new FakeRepo();
      const doc = new Y.Doc();
      const engine = engineOn(doc, repo);

      courses(doc).set('a', 'Lait');
      await engine.push();
      const afterFirst = repo.reads.length;

      courses(doc).set('b', 'Pain');
      await engine.push();

      // Le second envoi ne relit pas : il réutilise le sha rendu par le premier.
      expect(repo.reads.length).toBe(afterFirst);
    });

    it('fusionne et rejoue quand le dépôt a changé entre-temps', async () => {
      // Les deux téléphones publient sans s'être vus. Rien ne doit se perdre.
      const repo = new FakeRepo();

      const wife = new Y.Doc();
      courses(wife).set('b', 'Pain');
      repo.writeExternally(wife);

      const mine = new Y.Doc();
      courses(mine).set('a', 'Lait');
      await engineOn(mine, repo).push();

      const check = new Y.Doc();
      Y.applyUpdate(check, repo.content as Uint8Array);

      expect([...courses(check).values()].sort()).toEqual(['Lait', 'Pain']);
      // Un refus, puis une réussite.
      expect(repo.writes).toHaveLength(2);
    });

    it('converge malgré plusieurs refus consécutifs', async () => {
      const repo = new FakeRepo();
      const intruder = new Y.Doc();
      courses(intruder).set('x', 'Sel');
      repo.writeExternally(intruder);

      // Un tiers réécrit juste avant chacune des deux premières tentatives.
      const originalWrite = repo.write.bind(repo);
      let interference = 2;
      repo.write = async (update, sha) => {
        const result = await originalWrite(update, sha);
        if ('conflict' === result.kind && interference-- > 0) {
          courses(intruder).set(`y${interference}`, `Article ${interference}`);
          repo.writeExternally(intruder);
        }
        return result;
      };

      const mine = new Y.Doc();
      courses(mine).set('a', 'Lait');
      await engineOn(mine, repo).push();

      const check = new Y.Doc();
      Y.applyUpdate(check, repo.content as Uint8Array);

      expect([...courses(check).values()]).toContain('Lait');
      expect([...courses(check).values()]).toContain('Sel');
    });

    it('abandonne explicitement après trop de refus', async () => {
      const repo = new FakeRepo();
      // Le dépôt refuse toujours : le sha bouge sans que le moteur le voie.
      repo.write = async () => ({ kind: 'conflict' });

      const doc = new Y.Doc();
      courses(doc).set('a', 'Lait');

      await expect(engineOn(doc, repo, 3).push()).rejects.toThrow(
        'errors.github.publishFailed',
      );
    });

    it('force une relecture complète après un envoi', async () => {
      // L'ETag mémorisé portait sur l'ancien contenu : le conserver ferait
      // croire au prochain pull que rien n'a changé.
      const repo = new FakeRepo();
      const doc = new Y.Doc();
      const engine = engineOn(doc, repo);

      courses(doc).set('a', 'Lait');
      await engine.push();

      repo.reads.length = 0;
      await engine.pull();

      expect(repo.reads).toEqual([null]);
    });
  });

  describe('convergence à deux appareils', () => {
    it('aboutit au même état des deux côtés', async () => {
      const repo = new FakeRepo();

      const phoneA = new Y.Doc();
      const phoneB = new Y.Doc();
      const engineA = engineOn(phoneA, repo);
      const engineB = engineOn(phoneB, repo);

      courses(phoneA).set('a', 'Lait');
      await engineA.push();

      await engineB.pull();
      courses(phoneB).set('b', 'Pain');
      await engineB.push();

      await engineA.pull();

      expect([...courses(phoneA).values()].sort()).toEqual(['Lait', 'Pain']);
      expect([...courses(phoneB).values()].sort()).toEqual(['Lait', 'Pain']);
    });

    it('supporte des envois croisés sans lecture préalable', async () => {
      const repo = new FakeRepo();

      const phoneA = new Y.Doc();
      const phoneB = new Y.Doc();
      const engineA = engineOn(phoneA, repo);
      const engineB = engineOn(phoneB, repo);

      // Chacun a fait ses ajouts hors ligne, puis retrouve le réseau.
      courses(phoneA).set('a', 'Lait');
      courses(phoneB).set('b', 'Pain');

      await engineA.push();
      await engineB.push();
      await engineA.pull();

      expect([...courses(phoneA).values()].sort()).toEqual(['Lait', 'Pain']);
      expect([...courses(phoneB).values()].sort()).toEqual(['Lait', 'Pain']);
    });
  });

  describe('réglages par défaut', () => {
    afterEach(() => vi.useRealTimers());

    it('espace les tentatives d’un recul exponentiel plafonné', async () => {
      // Sans recul, deux téléphones qui se disputent le fichier se
      // resynchroniseraient en cadence et se refuseraient indéfiniment. La
      // gigue casse cette cadence, et le plafond évite d'attendre une minute.
      vi.useFakeTimers();

      const delays: number[] = [];
      const scheduled = globalThis.setTimeout;
      globalThis.setTimeout = ((run: () => void, ms: number) => {
        delays.push(ms);
        return scheduled(run, ms);
      }) as typeof globalThis.setTimeout;

      const repo = new FakeRepo();
      repo.write = async () => ({ kind: 'conflict' });

      const doc = new Y.Doc();
      courses(doc).set('a', 'Lait');
      // Aucune option : ni le nombre de tentatives ni l'attente ne sont fournis.
      // L'assertion est posée avant de faire tourner l'horloge, sinon le rejet
      // survient sans personne pour l'attendre.
      const failure = expect(
        new GithubSyncEngine(doc, repo, ORIGIN).push(),
      ).rejects.toThrow('errors.github.publishFailed');

      await vi.advanceTimersByTimeAsync(60_000);
      await failure;

      // Cinq tentatives par défaut, donc cinq attentes.
      const bases = [250, 500, 1000, 2000, 4000];
      expect(delays).toHaveLength(bases.length);
      delays.forEach((delay, attempt) => {
        expect(delay).toBeGreaterThanOrEqual(bases[attempt]);
        expect(delay).toBeLessThan(bases[attempt] + 250);
      });
    });
  });

  it('conserve son sha quand la relecture ne rend rien de neuf', async () => {
    // Un port qui répond « inchangé » à une relecture inconditionnelle ne
    // renseigne rien : effacer le sha ferait repartir l'envoi suivant en
    // création, et GitHub le refuserait encore.
    const shas: Array<string | null> = [];
    let attempt = 0;
    const port: SyncPort = {
      read: async () => ({ kind: 'unchanged' }),
      write: async (_update, sha) => {
        shas.push(sha);
        attempt++;
        return 2 === attempt
          ? { kind: 'conflict' }
          : { kind: 'written', sha: `sha-${attempt}` };
      },
    };

    const engine = new GithubSyncEngine(new Y.Doc(), port, ORIGIN, {
      wait: () => Promise.resolve(),
    });
    await engine.push();
    await engine.push();

    expect(shas).toEqual([null, 'sha-1', 'sha-1']);
  });

  it('reset oublie ETag et sha', async () => {
    const repo = new FakeRepo();
    const doc = new Y.Doc();
    const engine = engineOn(doc, repo);

    courses(doc).set('a', 'Lait');
    await engine.push();
    await engine.pull();

    engine.reset();
    repo.reads.length = 0;
    await engine.pull();

    expect(repo.reads).toEqual([null]);
  });
});
