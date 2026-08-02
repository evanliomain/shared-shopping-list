import { inject, Injectable, signal } from '@angular/core';
import { SyncProvider, SyncStatus } from '@shopping-list/core/sync';
import * as Y from 'yjs';

import {
  GithubAuthError,
  GithubConfig,
  GithubRateLimitError,
  readState,
  writeState,
} from './github-api';
import { GithubConfigService } from './github-config.service';
import { GithubSyncEngine, SyncPort } from './github-sync.engine';

/** Intervalle d'interrogation. Presque toutes ces requêtes seront des 304. */
export const POLL_INTERVAL_MS = 4000;
/** On laisse retomber les rafales de frappe avant de publier. */
export const PUSH_DEBOUNCE_MS = 500;

/**
 * Synchronise le Y.Doc avec un dépôt GitHub privé.
 *
 * Deux boucles indépendantes :
 *
 *  - **envoi**, déclenché par les modifications locales, temporisé de 500 ms ;
 *  - **réception**, par interrogation toutes les 4 s en requête conditionnelle.
 *
 * L'interrogation ne tourne que si l'onglet est visible **et** le navigateur en
 * ligne. Sans cette double condition, l'application viderait la batterie en
 * arrière-plan et empilerait les échecs en mode avion — et de toute façon iOS
 * ne laisse pas une PWA travailler en arrière-plan.
 */
@Injectable({ providedIn: 'root' })
export class GithubSyncProvider implements SyncProvider {
  readonly id = 'github';
  readonly label = 'GitHub';

  private readonly statusSignal = signal<SyncStatus>('idle');
  private readonly errorSignal = signal<string | null>(null);
  private readonly pendingSignal = signal(0);

  readonly status = this.statusSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();
  /**
   * Nombre de modifications locales pas encore publiées.
   *
   * Un compte, pas un booléen : au fond d'un rayon sans réseau, savoir que
   * « 3 modifs attendent » rassure bien plus que « envoi en attente ».
   */
  readonly pending = this.pendingSignal.asReadonly();

  private readonly configService = inject(GithubConfigService);

  private doc: Y.Doc | null = null;
  private engine: GithubSyncEngine | null = null;
  private config: GithubConfig | null = null;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  /** Une modification est survenue pendant un envoi : il faudra rejouer. */
  private dirty = false;

  private onDocUpdate: ((update: Uint8Array, origin: unknown) => void) | null =
    null;
  private readonly onVisibility = (): void => this.syncNow();
  private readonly onOnline = (): void => this.syncNow();

  connect(doc: Y.Doc): void {
    this.doc = doc;

    void this.configService.load().then((config) => {
      if (null === config) {
        // Pas encore appairé : l'application marche, simplement en solo.
        this.statusSignal.set('idle');
        return;
      }
      this.start(config);
    });
  }

  /** Appelé après un appairage, sans avoir à recharger la page. */
  restart(config: GithubConfig): void {
    this.stopLoops();
    this.start(config);
  }

  private start(config: GithubConfig): void {
    const doc = this.doc;
    if (null === doc) {
      return;
    }

    this.config = config;
    this.engine = new GithubSyncEngine(doc, this.portFor(config), this);
    this.statusSignal.set('connecting');
    this.errorSignal.set(null);

    this.onDocUpdate = (_update, origin) => {
      // Ne pas republier ce qui vient d'arriver du dépôt.
      if (origin === this) {
        return;
      }
      this.pendingSignal.update((count) => count + 1);
      this.schedulePush();
    };
    doc.on('update', this.onDocUpdate);

    document.addEventListener('visibilitychange', this.onVisibility);
    globalThis.addEventListener('online', this.onOnline);

    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    void this.poll();
  }

  disconnect(): void {
    this.stopLoops();
    this.doc = null;
    this.statusSignal.set('idle');
  }

  private stopLoops(): void {
    if (null !== this.onDocUpdate && null !== this.doc) {
      this.doc.off('update', this.onDocUpdate);
    }
    document.removeEventListener('visibilitychange', this.onVisibility);
    globalThis.removeEventListener('online', this.onOnline);

    if (null !== this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    if (null !== this.pushTimer) {
      clearTimeout(this.pushTimer);
    }

    this.pollTimer = null;
    this.pushTimer = null;
    this.onDocUpdate = null;
    this.engine = null;
  }

  /**
   * Rattrape tout de suite — au retour au premier plan ou du réseau.
   *
   * Republie aussi ce qui attend. Sans ça, les articles cochés hors ligne ne
   * repartiraient qu'à la prochaine modification : on pourrait rentrer du
   * magasin avec une liste jamais remontée.
   */
  syncNow(): void {
    if (!this.active()) {
      return;
    }

    void this.poll();
    if (0 < this.pendingSignal()) {
      this.schedulePush();
    }
  }

  private portFor(config: GithubConfig): SyncPort {
    return {
      read: (etag) => readState(config, etag),
      write: (update, sha) =>
        writeState(config, update, sha, this.commitMessage()),
    };
  }

  private commitMessage(): string {
    return `Liste de courses — ${new Date().toISOString()}`;
  }

  private active(): boolean {
    return (
      null !== this.engine &&
      navigator.onLine &&
      'visible' === document.visibilityState
    );
  }

  private async poll(): Promise<void> {
    if (!this.active()) {
      if (!navigator.onLine) {
        this.statusSignal.set('offline');
      }
      return;
    }

    try {
      await this.engine?.pull();
      this.statusSignal.set('live');
      this.errorSignal.set(null);
    } catch (error) {
      this.reportFailure(error);
    }
  }

  private schedulePush(): void {
    if (null !== this.pushTimer) {
      clearTimeout(this.pushTimer);
    }
    this.pushTimer = setTimeout(() => void this.push(), PUSH_DEBOUNCE_MS);
  }

  private async push(): Promise<void> {
    if (null === this.engine) {
      return;
    }

    // Une publication est déjà en vol : on note qu'il faudra recommencer
    // plutôt que d'en lancer une seconde en parallèle, qui se disputerait le
    // `sha` avec la première.
    if (this.pushing) {
      this.dirty = true;
      return;
    }

    if (!navigator.onLine) {
      this.statusSignal.set('offline');
      return;
    }

    // On note ce qu'on s'apprête à publier : les modifications survenues
    // pendant l'envoi devront rester comptées.
    const publishing = this.pendingSignal();

    this.pushing = true;
    try {
      await this.engine.push(this.commitMessage());
      this.pendingSignal.update((count) => Math.max(0, count - publishing));
      this.statusSignal.set('live');
      this.errorSignal.set(null);
    } catch (error) {
      this.reportFailure(error);
    } finally {
      this.pushing = false;

      if (this.dirty) {
        this.dirty = false;
        this.schedulePush();
      }
    }
  }

  private reportFailure(error: unknown): void {
    if (error instanceof GithubAuthError) {
      // Sans intervention, rien ne repartira : autant le dire clairement.
      this.statusSignal.set('error');
      this.errorSignal.set(error.message);
      return;
    }

    if (error instanceof GithubRateLimitError) {
      this.statusSignal.set('error');
      this.errorSignal.set(error.message);
      return;
    }

    // Tout le reste est très probablement le réseau : on réessaiera au
    // prochain tour, sans alarmer l'utilisateur.
    this.statusSignal.set('offline');
    this.errorSignal.set(
      error instanceof Error ? error.message : String(error),
    );
  }
}
