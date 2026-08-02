import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  Signal,
} from '@angular/core';
import { YDocService } from '@shopping-list/core/crdt';
import { chain, filter, length, map, some } from 'taninsam';

import { SYNC_PROVIDERS, SyncProvider, SyncStatus } from './sync-provider';

export interface ProviderState {
  readonly id: string;
  readonly label: string;
  readonly status: SyncStatus;
  readonly lastError: string | null;
  readonly pending: number;
}

/**
 * Branche tous les providers enregistrés sur l'unique Y.Doc et agrège leur
 * état pour l'interface.
 *
 * Aucune coordination entre providers : ils sont volontairement indépendants.
 * Si GitHub tombe, l'échange par QR continue de fonctionner, et la persistance
 * IndexedDB n'a jamais cessé.
 */
@Injectable({ providedIn: 'root' })
export class SyncRegistry {
  private readonly providers = inject(SYNC_PROVIDERS, { optional: true }) ?? [];
  private readonly yDoc = inject(YDocService);

  /** État de chaque canal, pour l'écran de réglages. */
  readonly states: Signal<readonly ProviderState[]> = computed(
    () =>
      chain([...this.providers])
        .chain(
          map((provider: SyncProvider) => ({
            id: provider.id,
            label: provider.label,
            status: provider.status(),
            lastError: provider.lastError(),
            // Facultatif : un canal purement local n'a rien à mettre en attente.
            pending: provider.pending?.() ?? 0,
          })),
        )
        .value() as ProviderState[],
  );

  /**
   * Y a-t-il au moins un canal distant opérationnel ?
   *
   * IndexedDB est exclu : il est toujours là, et le compter dirait à
   * l'utilisateur qu'il est synchronisé alors qu'il ne parle qu'à lui-même.
   */
  readonly hasLiveRemote: Signal<boolean> = computed(() =>
    chain(this.states().filter((s) => 'indexeddb' !== s.id))
      .chain(some((s: ProviderState) => 'live' === s.status))
      .value(),
  );

  readonly errorCount: Signal<number> = computed(() =>
    chain([...this.states()])
      .chain(filter((s: ProviderState) => 'error' === s.status))
      .chain(length())
      .value(),
  );

  constructor() {
    for (const provider of this.providers) {
      provider.connect(this.yDoc.doc);
    }

    inject(DestroyRef).onDestroy(() => {
      for (const provider of this.providers) {
        provider.disconnect();
      }
    });
  }
}
