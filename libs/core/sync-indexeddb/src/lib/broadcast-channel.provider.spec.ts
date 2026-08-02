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
});
