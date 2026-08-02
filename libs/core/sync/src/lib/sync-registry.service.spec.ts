import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as Y from 'yjs';

import { SYNC_PROVIDERS, SyncProvider, SyncStatus } from './sync-provider';
import { SyncRegistry } from './sync-registry.service';

function fakeProvider(
  id: string,
  status: SyncStatus,
  lastError: string | null = null,
): SyncProvider & { connected: Y.Doc[] } {
  const connected: Y.Doc[] = [];

  return {
    id,
    label: id,
    status: signal(status).asReadonly(),
    lastError: signal(lastError).asReadonly(),
    connect: (doc: Y.Doc) => connected.push(doc),
    disconnect: () => connected.splice(0),
    connected,
  };
}

function registryWith(...providers: readonly SyncProvider[]): {
  registry: SyncRegistry;
} {
  TestBed.configureTestingModule({
    providers: providers.map((provider) => ({
      provide: SYNC_PROVIDERS,
      multi: true,
      useValue: provider,
    })),
  });

  return { registry: TestBed.inject(SyncRegistry) };
}

describe('SyncRegistry', () => {
  it('branche chaque provider sur l’unique Y.Doc', () => {
    const indexeddb = fakeProvider('indexeddb', 'live');
    const github = fakeProvider('github', 'live');

    registryWith(indexeddb, github);

    expect(indexeddb.connected).toHaveLength(1);
    expect(github.connected).toHaveLength(1);
    // Le même document pour tous : c'est ce qui fait converger les canaux.
    expect(github.connected[0]).toBe(indexeddb.connected[0]);
  });

  it('expose l’état de chaque canal', () => {
    const { registry } = registryWith(
      fakeProvider('indexeddb', 'live'),
      fakeProvider('github', 'error', 'Jeton expiré'),
    );

    expect(registry.states()).toEqual([
      { id: 'indexeddb', label: 'indexeddb', status: 'live', lastError: null },
      {
        id: 'github',
        label: 'github',
        status: 'error',
        lastError: 'Jeton expiré',
      },
    ]);
  });

  it('ne considère pas IndexedDB comme une synchro distante', () => {
    // Le piège : dire « synchronisé » alors qu'on ne parle qu'à soi-même.
    const { registry } = registryWith(fakeProvider('indexeddb', 'live'));

    expect(registry.hasLiveRemote()).toBe(false);
  });

  it('signale une synchro distante dès qu’un canal distant est actif', () => {
    const { registry } = registryWith(
      fakeProvider('indexeddb', 'live'),
      fakeProvider('github', 'live'),
    );

    expect(registry.hasLiveRemote()).toBe(true);
  });

  it('compte les canaux en erreur', () => {
    const { registry } = registryWith(
      fakeProvider('indexeddb', 'live'),
      fakeProvider('github', 'error', 'HTTP 401'),
      fakeProvider('qr', 'idle'),
    );

    expect(registry.errorCount()).toBe(1);
  });

  it('fonctionne sans aucun provider enregistré', () => {
    TestBed.configureTestingModule({});
    const registry = TestBed.inject(SyncRegistry);

    expect(registry.states()).toEqual([]);
    expect(registry.hasLiveRemote()).toBe(false);
    expect(registry.errorCount()).toBe(0);
  });
});
