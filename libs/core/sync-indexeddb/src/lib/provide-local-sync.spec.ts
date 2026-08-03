import { TestBed } from '@angular/core/testing';
import { SYNC_PROVIDERS } from '@shopping-list/core/sync';

import { BroadcastChannelSyncProvider } from './broadcast-channel.provider';
import { IndexeddbSyncProvider } from './indexeddb.provider';
import { provideLocalSync } from './provide-local-sync';

describe('provideLocalSync', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideLocalSync()] });
  });

  it('enregistre la persistance locale et la synchro entre onglets', () => {
    // Les deux canaux sont sans configuration ni coût réseau : ils sont actifs
    // avant tout appairage.
    expect(TestBed.inject(SYNC_PROVIDERS).map(({ id }) => id)).toEqual([
      'indexeddb',
      'broadcast-channel',
    ]);
  });

  it('enregistre les instances partagées plutôt que des copies', () => {
    // « Repartir de zéro » injecte `IndexeddbSyncProvider` de son côté : si le
    // registre en tenait une autre instance, l'effacement porterait sur une
    // persistance qui n'est branchée sur rien.
    const providers = TestBed.inject(SYNC_PROVIDERS);

    expect(providers[0]).toBe(TestBed.inject(IndexeddbSyncProvider));
    expect(providers[1]).toBe(TestBed.inject(BroadcastChannelSyncProvider));
  });
});
