import { Injectable, signal } from '@angular/core';
import { SyncProvider, SyncStatus } from '@shopping-list/core/sync';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

export const INDEXEDDB_DB_NAME = 'shopping-list';

/**
 * Persistance locale du Y.Doc.
 *
 * C'est ce provider qui rend l'application utilisable hors ligne : le document
 * est rechargé depuis IndexedDB au démarrage, avant tout réseau, et chaque
 * modification y est écrite immédiatement. Cocher un article dans un rayon sans
 * réseau n'attend rien ni personne.
 *
 * Il est toujours actif, et n'est jamais compté comme un canal « distant » dans
 * l'indicateur de synchronisation : être persisté localement ne veut pas dire
 * être synchronisé avec l'autre téléphone.
 */
@Injectable({ providedIn: 'root' })
export class IndexeddbSyncProvider implements SyncProvider {
  readonly id = 'indexeddb';
  readonly label = 'Stockage local';

  private readonly statusSignal = signal<SyncStatus>('idle');
  private readonly errorSignal = signal<string | null>(null);

  readonly status = this.statusSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();

  private persistence: IndexeddbPersistence | null = null;

  connect(doc: Y.Doc): void {
    if (null !== this.persistence) {
      return;
    }

    this.statusSignal.set('connecting');

    try {
      const persistence = new IndexeddbPersistence(INDEXEDDB_DB_NAME, doc);
      this.persistence = persistence;

      // `synced` marque le moment où le contenu stocké a été appliqué au
      // document : avant ça, la liste affichée est vide.
      persistence.on('synced', () => this.statusSignal.set('live'));
    } catch (error) {
      // Navigation privée, quota épuisé, IndexedDB désactivé : l'application
      // doit rester utilisable, simplement sans persistance.
      this.statusSignal.set('error');
      this.errorSignal.set(describe(error));
    }
  }

  disconnect(): void {
    void this.persistence?.destroy();
    this.persistence = null;
    this.statusSignal.set('idle');
  }

  /** Efface les données locales — utilisé par « repartir de zéro ». */
  async clear(): Promise<void> {
    await this.persistence?.clearData();
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
