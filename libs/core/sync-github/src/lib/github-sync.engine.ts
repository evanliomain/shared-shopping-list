import { TranslatableError } from '@shopping-list/util/i18n';
import * as Y from 'yjs';

import { ReadResult, WriteResult } from './github-api';

/**
 * Accès distant, réduit au strict nécessaire.
 *
 * Le moteur ne connaît ni `fetch`, ni l'API de GitHub : c'est ce qui permet de
 * tester la boucle de résolution de conflit sans réseau.
 */
export interface SyncPort {
  read(etag: string | null): Promise<ReadResult>;
  write(update: Uint8Array, sha: string | null): Promise<WriteResult>;
}

export interface EngineOptions {
  /** Nombre de tentatives d'écriture avant abandon. */
  readonly maxAttempts?: number;
  /** Attente entre deux tentatives. Injectable pour les tests. */
  readonly wait?: (attempt: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 5;

/** Recul exponentiel avec gigue, pour ne pas se resynchroniser en cadence. */
function defaultWait(attempt: number): Promise<void> {
  const base = Math.min(2 ** attempt * 250, 4000);
  return new Promise((resolve) =>
    setTimeout(resolve, base + Math.random() * 250),
  );
}

export type PullOutcome = 'unchanged' | 'applied' | 'absent';

/**
 * Fait circuler l'état entre le Y.Doc local et le dépôt distant.
 *
 * Deux opérations, et une seule idée : le conflit n'est jamais un problème
 * métier. Si l'écriture est refusée parce que quelqu'un a écrit entre-temps, on
 * relit, on fusionne — le CRDT s'en charge — et on rejoue. La boucle converge
 * toujours, parce que la fusion est commutative.
 */
export class GithubSyncEngine {
  /** Dernier ETag connu, pour les requêtes conditionnelles. */
  private etag: string | null = null;
  /** Dernier `sha` connu, pour le contrôle de concurrence optimiste. */
  private sha: string | null = null;

  private readonly maxAttempts: number;
  private readonly wait: (attempt: number) => Promise<void>;

  constructor(
    private readonly doc: Y.Doc,
    private readonly port: SyncPort,
    /**
     * Marque les mises à jour venues du distant, pour que le provider ne les
     * renvoie pas d'où elles viennent.
     */
    private readonly origin: unknown,
    options: EngineOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.wait = options.wait ?? defaultWait;
  }

  /**
   * Récupère ce qui a changé à distance.
   *
   * En régime normal la réponse est un 304, qui ne consomme pas de quota : on
   * peut donc interroger toutes les quelques secondes toute la journée.
   */
  async pull(): Promise<PullOutcome> {
    const remote = await this.port.read(this.etag);

    if ('unchanged' === remote.kind) {
      return 'unchanged';
    }

    if ('absent' === remote.kind) {
      // Rien de publié encore : notre prochain envoi créera le fichier.
      this.sha = null;
      return 'absent';
    }

    this.absorb(remote.sha, remote.etag, remote.update);
    return 'applied';
  }

  /**
   * Publie l'état local, en fusionnant tout ce qui serait arrivé entre-temps.
   *
   * On tente d'abord d'écrire directement avec le `sha` qu'on croit à jour :
   * dans le cas courant — personne n'a écrit depuis notre dernière lecture —
   * c'est **une seule requête**. On ne relit qu'en cas de refus.
   */
  async push(): Promise<void> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const result = await this.port.write(
        Y.encodeStateAsUpdate(this.doc),
        this.sha,
      );

      if ('written' === result.kind) {
        this.sha = result.sha;
        // Notre ETag portait sur l'ancien contenu : la prochaine lecture doit
        // être complète, sinon on croirait à tort que rien n'a changé.
        this.etag = null;
        return;
      }

      // Refusé : quelqu'un a écrit entre-temps. On récupère sa version, on la
      // fusionne, et on repart avec un sha frais.
      await this.refresh();
      await this.wait(attempt);
    }

    throw new TranslatableError('errors.github.publishFailed', {
      attempts: this.maxAttempts,
    });
  }

  /** Relecture inconditionnelle, pour repartir d'un `sha` frais. */
  private async refresh(): Promise<void> {
    const remote = await this.port.read(null);

    if ('loaded' === remote.kind) {
      this.absorb(remote.sha, remote.etag, remote.update);
      return;
    }

    if ('absent' === remote.kind) {
      this.sha = null;
    }
  }

  private absorb(sha: string, etag: string | null, update: Uint8Array): void {
    this.sha = sha;
    this.etag = etag;
    Y.applyUpdate(this.doc, update, this.origin);
  }

  /** Repart de zéro — après un réappairage, par exemple. */
  reset(): void {
    this.etag = null;
    this.sha = null;
  }
}
