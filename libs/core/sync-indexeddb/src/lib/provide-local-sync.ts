import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { SYNC_PROVIDERS } from '@shopping-list/core/sync';

import { BroadcastChannelSyncProvider } from './broadcast-channel.provider';
import { IndexeddbSyncProvider } from './indexeddb.provider';

/**
 * Enregistre les deux canaux purement locaux : persistance IndexedDB et
 * synchronisation entre onglets.
 *
 * Ils ne dépendent d'aucune configuration et n'ont aucun coût réseau, donc ils
 * sont toujours actifs — y compris avant tout appairage.
 */
export function provideLocalSync(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: SYNC_PROVIDERS,
      multi: true,
      useFactory: () => inject(IndexeddbSyncProvider),
    },
    {
      provide: SYNC_PROVIDERS,
      multi: true,
      useFactory: () => inject(BroadcastChannelSyncProvider),
    },
  ]);
}
