import { InjectionToken, Signal } from '@angular/core';
import * as Y from 'yjs';

/**
 * - `idle`       — pas encore connecté, ou volontairement arrêté
 * - `connecting` — en cours d'établissement
 * - `live`       — opérationnel
 * - `offline`    — indisponible pour cause de réseau, on réessaiera
 * - `error`      — en échec, intervention probablement nécessaire
 */
export type SyncStatus = 'idle' | 'connecting' | 'live' | 'offline' | 'error';

/**
 * Un canal par lequel des deltas Yjs circulent.
 *
 * L'abstraction tient en si peu de chose parce que le CRDT fait le gros du
 * travail : un provider n'a qu'à transporter des `Uint8Array`, sans se
 * préoccuper de l'ordre, des doublons ni des conflits. C'est ce qui permet d'en
 * faire tourner plusieurs en parallèle — IndexedDB, GitHub, QR code — sans
 * qu'ils se marchent dessus, et d'en ajouter un plus tard sans toucher au
 * métier.
 */
export interface SyncProvider {
  /** Identifiant technique stable, utilisé comme clé dans le store. */
  readonly id: string;
  /** Clé de traduction du nom affiché — voir `sync.providers.*`. */
  readonly labelKey: string;
  readonly status: Signal<SyncStatus>;
  /** Dernière erreur, **déjà traduite**, à afficher telle quelle. */
  readonly lastError: Signal<string | null>;
  /**
   * Modifications locales pas encore transmises.
   *
   * Facultatif : un canal purement local, comme IndexedDB, n'a rien à mettre en
   * attente.
   */
  readonly pending?: Signal<number>;

  connect(doc: Y.Doc): void;
  disconnect(): void;
}

/**
 * Providers actifs. Multi-provider : chaque canal s'enregistre de son côté.
 */
export const SYNC_PROVIDERS = new InjectionToken<readonly SyncProvider[]>(
  'sl.sync.providers',
);
