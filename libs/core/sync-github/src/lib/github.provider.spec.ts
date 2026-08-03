import { TestBed } from '@angular/core/testing';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';
import * as Y from 'yjs';

import { fromBase64, toBase64 } from './base64';
import { GithubConfig } from './github-api';
import { GithubConfigService } from './github-config.service';
import {
  GithubSyncProvider,
  POLL_INTERVAL_MS,
  PUSH_DEBOUNCE_MS,
} from './github.provider';

const CONFIG: GithubConfig = {
  owner: 'evanliomain',
  repo: 'shopping-list-data',
  token: 'github_pat_xxx',
  branch: 'main',
  path: 'state.bin',
};

/** Capturé avant l'installation des faux minuteurs, pour rester réel. */
const macrotask = setTimeout;

/**
 * Laisse retomber les promesses en vol.
 *
 * Une macrotâche réelle vide toute la file de microtâches : c'est ce qu'il faut
 * pour que la chaîne `load` → `start` → `pull` aboutisse, alors même que
 * l'horloge est simulée.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => macrotask(resolve, 0));
}

/** Fait tourner l'horloge simulée, puis laisse retomber ce qu'elle a déclenché. */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

interface Imposed {
  readonly status: number;
  readonly headers?: Record<string, string>;
}

/**
 * L'API Contents de GitHub, en mémoire.
 *
 * Elle négocie l'ETag comme la vraie — c'est ce qui fait le 304 du régime
 * normal — mais accepte n'importe quel `sha` en écriture : la résolution de
 * conflit est l'affaire du moteur, et elle est éprouvée de son côté.
 */
class FakeGithub {
  update: Uint8Array | null = null;
  /** Requêtes reçues, comptées à l'entrée pour voir celles qu'on retient. */
  reads = 0;
  writes = 0;
  readonly messages: string[] = [];
  /** Statut imposé à la prochaine réponse, quelle que soit la requête. */
  failWith: Imposed | null = null;

  private revision = 0;
  private holding = false;
  private held: Array<() => void> = [];

  /** Retient les requêtes suivantes, pour observer un envoi en vol. */
  hold(): void {
    this.holding = true;
  }

  release(): void {
    this.holding = false;
    const waiting = this.held;
    this.held = [];
    for (const resume of waiting) {
      resume();
    }
  }

  /** Publication par « l'autre téléphone », hors du provider testé. */
  publish(doc: Y.Doc): void {
    this.update = Y.encodeStateAsUpdate(doc);
    this.revision++;
  }

  readonly fetch = (async (url: string | URL, init: RequestInit = {}) => {
    if ('PUT' === init.method) {
      this.writes++;
    } else {
      this.reads++;
    }

    if (this.holding) {
      await new Promise<void>((resume) => this.held.push(resume));
    }

    const imposed = this.failWith;
    if (null !== imposed) {
      this.failWith = null;
      return new Response(null, imposed);
    }

    return 'PUT' === init.method
      ? this.write(init)
      : this.read(init.headers as Record<string, string>);
  }) as unknown as typeof fetch;

  private read(headers: Record<string, string>): Response {
    if (null === this.update) {
      return new Response(null, { status: 404 });
    }

    const etag = `"sha-${this.revision}"`;
    if (etag === headers['If-None-Match']) {
      return new Response(null, { status: 304 });
    }

    return new Response(
      JSON.stringify({
        sha: `sha-${this.revision}`,
        content: toBase64(this.update),
      }),
      { status: 200, headers: { etag } },
    );
  }

  private write(init: RequestInit): Response {
    const body = JSON.parse(init.body as string) as {
      message: string;
      content: string;
    };
    this.messages.push(body.message);
    this.update = fromBase64(body.content);
    this.revision++;

    return new Response(
      JSON.stringify({ content: { sha: `sha-${this.revision}` } }),
      { status: 200 },
    );
  }
}

class FakeConfigService {
  stored: GithubConfig | null = CONFIG;

  async load(): Promise<GithubConfig | null> {
    return this.stored;
  }
}

/** jsdom livre ces deux valeurs en lecture seule : on les rend pilotables. */
function stubEnvironment(): {
  setOnline(value: boolean): void;
  setVisibility(value: DocumentVisibilityState): void;
  restore(): void;
} {
  const state = {
    online: true,
    visibility: 'visible' as DocumentVisibilityState,
  };

  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => state.online,
  });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state.visibility,
  });

  return {
    setOnline: (value) => {
      state.online = value;
    },
    setVisibility: (value) => {
      state.visibility = value;
    },
    restore: () => {
      delete (navigator as unknown as Record<string, unknown>)['onLine'];
      delete (document as unknown as Record<string, unknown>)[
        'visibilityState'
      ];
    },
  };
}

function courses(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>('courses');
}

describe('GithubSyncProvider', () => {
  let github: FakeGithub;
  let configService: FakeConfigService;
  let environment: ReturnType<typeof stubEnvironment>;
  let previousFetch: typeof fetch;
  let attached: GithubSyncProvider[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    github = new FakeGithub();
    configService = new FakeConfigService();
    environment = stubEnvironment();
    previousFetch = globalThis.fetch;
    globalThis.fetch = github.fetch;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideTestI18n(),
        { provide: GithubConfigService, useValue: configService },
      ],
    });
  });

  afterEach(() => {
    // Sans ça, les écouteurs `visibilitychange` et `online` d'un provider
    // survivraient au test et interrogeraient un dépôt démonté.
    for (const provider of attached) {
      provider.disconnect();
    }
    attached = [];
    globalThis.fetch = previousFetch;
    environment.restore();
    vi.useRealTimers();
  });

  function provider(): GithubSyncProvider {
    const instance = TestBed.inject(GithubSyncProvider);
    attached.push(instance);
    return instance;
  }

  /** Provider branché sur un document, premier tour d'interrogation compris. */
  async function connected(): Promise<{
    sync: GithubSyncProvider;
    doc: Y.Doc;
  }> {
    const sync = provider();
    const doc = new Y.Doc();
    sync.connect(doc);
    await settle();
    return { sync, doc };
  }

  describe('connexion', () => {
    it('reste en solo tant que rien n’est appairé', async () => {
      // Le premier lancement ne doit rien coûter en réseau, et surtout ne rien
      // signaler comme une panne.
      configService.stored = null;
      const sync = provider();

      sync.connect(new Y.Doc());
      await settle();

      expect(sync.status()).toBe('idle');
      expect(sync.lastError()).toBeNull();
      expect(github.reads).toBe(0);
    });

    it('annonce la connexion avant que la première lecture aboutisse', async () => {
      github.hold();
      const sync = provider();

      sync.connect(new Y.Doc());
      await settle();
      expect(sync.status()).toBe('connecting');

      github.release();
      await settle();
      expect(sync.status()).toBe('live');
    });

    it('applique l’état du dépôt dès la connexion', async () => {
      const other = new Y.Doc();
      courses(other).set('a', 'Lait');
      github.publish(other);

      const { sync, doc } = await connected();

      expect([...courses(doc).values()]).toEqual(['Lait']);
      expect(sync.status()).toBe('live');
    });

    it('ne remet pas en attente ce qui vient d’arriver du dépôt', async () => {
      // Sans le marquage d'origine, chaque lecture repartirait aussitôt en
      // écriture, et les deux téléphones se renverraient le même delta.
      const other = new Y.Doc();
      courses(other).set('a', 'Lait');
      github.publish(other);

      const { sync } = await connected();
      await advance(PUSH_DEBOUNCE_MS);

      expect(sync.pending()).toBe(0);
      expect(github.writes).toBe(0);
    });

    it('démarre sur un dépôt encore vide', async () => {
      const { sync } = await connected();

      expect(sync.status()).toBe('live');
      expect(sync.lastError()).toBeNull();
    });
  });

  describe('publication', () => {
    it('publie une modification locale après temporisation', async () => {
      const { sync, doc } = await connected();

      courses(doc).set('a', 'Lait');
      expect(sync.pending()).toBe(1);
      // Rien n'est parti : on laisse retomber la frappe.
      expect(github.writes).toBe(0);

      await advance(PUSH_DEBOUNCE_MS);

      expect(github.writes).toBe(1);
      expect(sync.pending()).toBe(0);
      expect(sync.status()).toBe('live');

      const published = new Y.Doc();
      Y.applyUpdate(published, github.update as Uint8Array);
      expect([...courses(published).values()]).toEqual(['Lait']);
    });

    it('n’envoie qu’une fois une rafale de frappe', async () => {
      const { sync, doc } = await connected();

      courses(doc).set('a', 'L');
      await advance(PUSH_DEBOUNCE_MS / 2);
      courses(doc).set('a', 'La');
      await advance(PUSH_DEBOUNCE_MS / 2);
      courses(doc).set('a', 'Lait');
      await advance(PUSH_DEBOUNCE_MS);

      expect(github.writes).toBe(1);
      expect(sync.pending()).toBe(0);
    });

    it('date chaque commit', async () => {
      const { doc } = await connected();

      courses(doc).set('a', 'Lait');
      await advance(PUSH_DEBOUNCE_MS);

      expect(github.messages[0]).toMatch(
        /^Liste de courses — \d{4}-\d{2}-\d{2}T/,
      );
    });

    it('n’envoie pas deux publications en parallèle', async () => {
      // Deux envois concurrents se disputeraient le `sha` : le second serait
      // refusé, et il faudrait tout refusionner pour rien.
      const { sync, doc } = await connected();

      github.hold();
      courses(doc).set('a', 'Lait');
      await advance(PUSH_DEBOUNCE_MS);
      expect(github.writes).toBe(1);

      courses(doc).set('b', 'Pain');
      await advance(PUSH_DEBOUNCE_MS);
      // Le premier envoi est toujours en vol : le second attend son tour.
      expect(github.writes).toBe(1);

      github.release();
      await advance(PUSH_DEBOUNCE_MS * 2);

      expect(github.writes).toBe(2);
      expect(sync.pending()).toBe(0);

      const published = new Y.Doc();
      Y.applyUpdate(published, github.update as Uint8Array);
      expect([...courses(published).values()].sort()).toEqual(['Lait', 'Pain']);
    });

    it('garde en attente ce que GitHub a refusé de prendre', async () => {
      // C'est ce compteur qui rassure au fond d'un rayon : « 1 modif attend »
      // vaut mieux que de croire la liste remontée.
      const { sync, doc } = await connected();

      github.failWith = { status: 500 };
      courses(doc).set('a', 'Lait');
      await advance(PUSH_DEBOUNCE_MS);

      expect(sync.pending()).toBe(1);
      expect(sync.status()).toBe('offline');
      expect(sync.lastError()).toContain('500');
    });
  });

  describe('interrogation', () => {
    it('récupère ce que l’autre téléphone a publié', async () => {
      const { doc } = await connected();

      const other = new Y.Doc();
      courses(other).set('b', 'Pain');
      github.publish(other);

      await advance(POLL_INTERVAL_MS);

      expect([...courses(doc).values()]).toEqual(['Pain']);
    });

    it('ne consomme pas de quota quand rien n’a changé', async () => {
      // Le 304 n'est pas facturé : c'est ce qui rend le tour de 4 s tenable.
      const other = new Y.Doc();
      courses(other).set('a', 'Lait');
      github.publish(other);

      const { sync } = await connected();
      await advance(POLL_INTERVAL_MS * 5);

      expect(github.reads).toBe(6);
      expect(sync.status()).toBe('live');
    });

    it('n’interroge pas un onglet passé en arrière-plan', async () => {
      // iOS ne laisse de toute façon pas travailler une PWA en arrière-plan, et
      // insister viderait la batterie.
      const { sync } = await connected();
      const before = github.reads;

      environment.setVisibility('hidden');
      await advance(POLL_INTERVAL_MS * 3);

      expect(github.reads).toBe(before);
      // Le réseau est là : rien ne justifie d'annoncer « hors ligne ».
      expect(sync.status()).toBe('live');
    });

    it('se déclare hors ligne quand le réseau tombe', async () => {
      const { sync } = await connected();

      environment.setOnline(false);
      await advance(POLL_INTERVAL_MS);

      expect(sync.status()).toBe('offline');
    });
  });

  describe('rattrapage', () => {
    it('relit en revenant au premier plan', async () => {
      const { doc } = await connected();
      environment.setVisibility('hidden');

      const other = new Y.Doc();
      courses(other).set('b', 'Pain');
      github.publish(other);

      environment.setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      // Sans ce rattrapage, il faudrait attendre le tour d'interrogation
      // suivant pour voir ce que l'autre a ajouté.
      expect([...courses(doc).values()]).toEqual(['Pain']);
    });

    it('ne fait rien en partant en arrière-plan', async () => {
      // `visibilitychange` se déclenche aussi au départ, pas seulement au retour.
      const { doc } = await connected();
      const before = github.reads;

      environment.setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      courses(doc).set('a', 'Lait');
      await advance(PUSH_DEBOUNCE_MS);

      expect(github.reads).toBe(before);
    });

    it('repart avec ce qui attend quand le réseau revient', async () => {
      // Les articles cochés hors ligne ne doivent pas attendre la prochaine
      // modification pour remonter : on rentrerait du magasin sans les avoir
      // publiés.
      const { sync, doc } = await connected();

      environment.setOnline(false);
      courses(doc).set('a', 'Lait');
      await advance(PUSH_DEBOUNCE_MS);

      expect(github.writes).toBe(0);
      expect(sync.status()).toBe('offline');
      expect(sync.pending()).toBe(1);

      environment.setOnline(true);
      globalThis.dispatchEvent(new Event('online'));
      await advance(PUSH_DEBOUNCE_MS);

      expect(github.writes).toBe(1);
      expect(sync.pending()).toBe(0);
      expect(sync.status()).toBe('live');
    });
  });

  describe('signalement des pannes', () => {
    it('s’arrête sur un jeton refusé', async () => {
      // Un jeton expiré ne repartira pas tout seul : il faut le dire, et en
      // français.
      const { sync } = await connected();

      github.failWith = { status: 401 };
      await advance(POLL_INTERVAL_MS);

      expect(sync.status()).toBe('error');
      expect(sync.lastError()).toBe(
        'Le jeton GitHub est invalide ou a expiré.',
      );
    });

    it('s’arrête sur un quota épuisé', async () => {
      const { sync } = await connected();

      github.failWith = {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      };
      await advance(POLL_INTERVAL_MS);

      expect(sync.status()).toBe('error');
      expect(sync.lastError()).toBe('Quota GitHub épuisé.');
    });

    it('réessaie sans alarmer quand GitHub répond mal', async () => {
      const { sync } = await connected();

      github.failWith = { status: 502 };
      await advance(POLL_INTERVAL_MS);
      expect(sync.status()).toBe('offline');
      expect(sync.lastError()).toContain('502');

      await advance(POLL_INTERVAL_MS);
      expect(sync.status()).toBe('live');
      expect(sync.lastError()).toBeNull();
    });
  });

  describe('cycle de vie', () => {
    it('reprend la synchronisation dès l’appairage', async () => {
      // La page d'appairage relance le canal sans recharger l'application.
      configService.stored = null;
      const { sync } = await connected();
      expect(sync.status()).toBe('idle');

      sync.restart(CONFIG);
      await settle();

      expect(sync.status()).toBe('live');
      expect(github.reads).toBe(1);
    });

    it('reste inerte si on le relance avant d’avoir un document', async () => {
      const sync = provider();

      sync.restart(CONFIG);
      await settle();

      expect(sync.status()).toBe('idle');
      expect(github.reads).toBe(0);
    });

    it('se détache proprement', async () => {
      const { sync, doc } = await connected();
      courses(doc).set('a', 'Lait');
      const reads = github.reads;

      sync.disconnect();

      expect(sync.status()).toBe('idle');
      await advance(POLL_INTERVAL_MS * 3);
      // Ni le tour d'interrogation ni la publication en attente ne survivent.
      expect(github.reads).toBe(reads);
      expect(github.writes).toBe(0);

      courses(doc).set('b', 'Pain');
      await advance(POLL_INTERVAL_MS);
      expect(github.writes).toBe(0);
    });

    it('n’essaie plus de publier après s’être détaché', async () => {
      // La publication en vol se termine, mais ce qui restait en attente ne
      // doit pas repartir vers un dépôt dont on s'est détaché.
      const { sync, doc } = await connected();

      github.hold();
      courses(doc).set('a', 'Lait');
      await advance(PUSH_DEBOUNCE_MS);
      courses(doc).set('b', 'Pain');
      await advance(PUSH_DEBOUNCE_MS);

      sync.disconnect();
      github.release();
      await advance(PUSH_DEBOUNCE_MS * 4);

      expect(github.writes).toBe(1);
    });
  });
});
