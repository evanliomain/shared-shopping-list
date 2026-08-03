import { TestBed } from '@angular/core/testing';
import { SYNC_PROVIDERS } from '@shopping-list/core/sync';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { GithubSyncProvider } from './github.provider';
import { provideGithubSync } from './provide-github-sync';

describe('provideGithubSync', () => {
  it('inscrit le canal GitHub parmi les canaux de synchronisation', () => {
    TestBed.configureTestingModule({
      providers: [provideTestI18n(), provideGithubSync()],
    });

    const providers = TestBed.inject(SYNC_PROVIDERS);

    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(GithubSyncProvider);
    // Le registre s'en sert comme clé dans le store.
    expect(providers[0].id).toBe('github');
  });

  it('n’engage rien avant d’être branché sur un document', () => {
    // C'est ce qui permet d'activer le canal d'emblée : sans appairage — et
    // même sans `connect` — il reste inerte.
    TestBed.configureTestingModule({
      providers: [provideTestI18n(), provideGithubSync()],
    });

    expect(TestBed.inject(SYNC_PROVIDERS)[0].status()).toBe('idle');
  });
});
