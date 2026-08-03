import * as Y from 'yjs';

import { BroadcastChannelSyncProvider } from './broadcast-channel.provider';

/**
 * `BroadcastChannel` livre ses messages de façon asynchrone : on rend la main
 * à la boucle d'événements entre chaque assertion.
 */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

function textOf(doc: Y.Doc): string[] {
  return [...doc.getMap<string>('courses').values()];
}

describe('BroadcastChannelSyncProvider', () => {
  let tabs: BroadcastChannelSyncProvider[] = [];

  afterEach(() => {
    for (const tab of tabs) {
      tab.disconnect();
    }
    tabs = [];
  });

  function openTab(doc: Y.Doc): BroadcastChannelSyncProvider {
    const provider = new BroadcastChannelSyncProvider();
    tabs.push(provider);
    provider.connect(doc);
    return provider;
  }

  it('passe à « live » une fois connecté', () => {
    const provider = openTab(new Y.Doc());

    expect(provider.status()).toBe('live');
    expect(provider.lastError()).toBeNull();
  });

  it('propage une modification vers l’autre onglet', async () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    openTab(first);
    openTab(second);
    await settle();

    first.getMap<string>('courses').set('a', 'Lait');
    await settle();

    expect(textOf(second)).toEqual(['Lait']);
  });

  it('rattrape un onglet ouvert après coup', async () => {
    // Le nouvel onglet annonce son vecteur d'état ; l'ancien lui répond avec
    // le delta manquant. Sans ce rattrapage, un onglet ouvert plus tard
    // resterait vide jusqu'au prochain changement.
    const existing = new Y.Doc();
    openTab(existing);
    existing.getMap<string>('courses').set('a', 'Pain');
    await settle();

    const late = new Y.Doc();
    openTab(late);
    await settle();

    expect(textOf(late)).toEqual(['Pain']);
  });

  it('fusionne des modifications concurrentes des deux côtés', async () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    openTab(first);
    openTab(second);
    await settle();

    first.getMap<string>('courses').set('a', 'Lait');
    second.getMap<string>('courses').set('b', 'Pain');
    await settle();

    expect(textOf(first).sort()).toEqual(['Lait', 'Pain']);
    expect(textOf(second).sort()).toEqual(['Lait', 'Pain']);
  });

  it('ne renvoie pas à l’expéditeur ce qu’il vient d’émettre', async () => {
    // Sans le marquage d'origine, chaque mise à jour reçue serait rediffusée
    // et les deux onglets se renverraient le même delta indéfiniment.
    const first = new Y.Doc();
    const second = new Y.Doc();
    openTab(first);
    openTab(second);
    await settle();

    let updatesOnFirst = 0;
    first.on('update', () => updatesOnFirst++);

    second.getMap<string>('courses').set('a', 'Lait');
    await settle();
    await settle();

    expect(updatesOnFirst).toBe(1);
  });

  it('se détache proprement', async () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    const provider = openTab(first);
    openTab(second);
    await settle();

    provider.disconnect();
    expect(provider.status()).toBe('idle');

    second.getMap<string>('courses').set('a', 'Lait');
    await settle();

    expect(textOf(first)).toEqual([]);
  });

  it('ignore une seconde connexion et reste sur le premier document', async () => {
    // Rebrancher sur un autre document laisserait deux écouteurs de mise à jour
    // sur le même canal, et l'onglet diffuserait des deltas de deux documents
    // qui n'ont rien à voir.
    const premier = new Y.Doc();
    const ignore = new Y.Doc();
    const autre = new Y.Doc();
    const provider = openTab(premier);
    provider.connect(ignore);
    openTab(autre);
    await settle();

    ignore.getMap<string>('courses').set('a', 'Lait');
    await settle();
    expect(textOf(autre)).toEqual([]);

    premier.getMap<string>('courses').set('b', 'Pain');
    await settle();
    expect(textOf(autre)).toEqual(['Pain']);
  });
});

/**
 * Le `BroadcastChannel` de Node livre les messages sans jamais échouer et
 * n'existe pas partout : ces deux situations-là ne s'atteignent qu'en
 * remplaçant la classe globale.
 */
describe('BroadcastChannelSyncProvider — canal doublé', () => {
  let restaurations: Array<() => void> = [];

  afterEach(() => {
    for (const restaure of restaurations.reverse()) {
      restaure();
    }
    restaurations = [];
  });

  interface FauxCanal {
    onmessage: ((event: MessageEvent) => void) | null;
    readonly envoyes: unknown[];
  }

  /** Remplace `BroadcastChannel` ; `echoue` fait rater chaque envoi. */
  function doubleLeCanal(echoue?: () => never): FauxCanal[] {
    const canaux: FauxCanal[] = [];
    const global = globalThis as unknown as Record<string, unknown>;
    const precedent = global['BroadcastChannel'];

    global['BroadcastChannel'] = class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      readonly envoyes: unknown[] = [];

      constructor() {
        canaux.push(this);
      }

      postMessage(message: unknown): void {
        echoue?.();
        this.envoyes.push(message);
      }

      close(): void {
        this.onmessage = null;
      }
    };

    restaurations.push(() => {
      global['BroadcastChannel'] = precedent;
    });

    return canaux;
  }

  function retireLeCanal(): void {
    const global = globalThis as unknown as Record<string, unknown>;
    const precedent = global['BroadcastChannel'];
    delete global['BroadcastChannel'];

    restaurations.push(() => {
      global['BroadcastChannel'] = precedent;
    });
  }

  it('reste inerte là où BroadcastChannel n’existe pas', () => {
    // Rare, mais l'application doit rester utilisable : les autres canaux
    // suffisent, celui-ci se contente de ne rien annoncer.
    retireLeCanal();
    const provider = new BroadcastChannelSyncProvider();

    expect(() => provider.connect(new Y.Doc())).not.toThrow();
    expect(provider.status()).toBe('idle');
    expect(provider.lastError()).toBeNull();
  });

  it('signale un envoi refusé sans interrompre la connexion', () => {
    const provider = new BroadcastChannelSyncProvider();
    doubleLeCanal(() => {
      throw new Error('canal fermé');
    });

    provider.connect(new Y.Doc());

    // L'échec porte sur l'annonce du vecteur d'état : les autres onglets ne
    // sauront pas qu'on est là, mais l'onglet lui-même reste opérationnel.
    expect(provider.status()).toBe('live');
    expect(provider.lastError()).toBe('canal fermé');
  });

  it('décrit un refus qui n’est pas une Error', () => {
    const provider = new BroadcastChannelSyncProvider();
    doubleLeCanal(() => {
      throw 'charge non clonable';
    });

    provider.connect(new Y.Doc());

    expect(provider.lastError()).toBe('charge non clonable');
  });

  it('ne répond plus à un message arrivé après le détachement', () => {
    // Un message déjà en vol quand l'onglet se détache : sans la garde, on
    // encoderait le delta d'un document qu'on ne suit plus.
    const canaux = doubleLeCanal();
    const provider = new BroadcastChannelSyncProvider();
    provider.connect(new Y.Doc());

    const canal = canaux[0];
    const repondre = canal.onmessage;
    provider.disconnect();
    const envoyesAvant = canal.envoyes.length;

    repondre?.(
      new MessageEvent('message', {
        data: {
          kind: 'state-vector',
          vector: Y.encodeStateVector(new Y.Doc()),
        },
      }),
    );

    expect(canal.envoyes).toHaveLength(envoyesAvant);
  });
});
