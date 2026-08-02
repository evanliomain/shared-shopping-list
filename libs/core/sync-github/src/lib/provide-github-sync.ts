import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { SYNC_PROVIDERS } from '@shopping-list/core/sync';

import { GithubSyncProvider } from './github.provider';

/**
 * Enregistre la synchronisation GitHub.
 *
 * Sans appairage, le provider reste inerte : l'application fonctionne
 * exactement pareil, en solo. C'est ce qui permet de l'activer d'emblée sans
 * imposer de configuration au premier lancement.
 */
export function provideGithubSync(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: SYNC_PROVIDERS,
      multi: true,
      useFactory: () => inject(GithubSyncProvider),
    },
  ]);
}
