import { DestroyRef, inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { auditTime, map, shareReplay, startWith } from 'rxjs/operators';
import * as Y from 'yjs';

import { resolveDeviceId, resolveDeviceName } from './ids';
import { readSnapshot } from './snapshot';
import { CrdtSnapshot } from './types';

/**
 * Origine marquant les transactions issues de cet onglet.
 *
 * Les providers de synchronisation s'en servent pour ne pas renvoyer à
 * l'expéditeur ce qu'il vient d'écrire.
 */
export const LOCAL_ORIGIN = Symbol('sl.local');

/**
 * Détient l'unique Y.Doc de l'application.
 *
 * C'est **la** source de vérité. Le store NgRx n'en est qu'une projection : il
 * ne s'écrit jamais lui-même, il reflète `snapshot$`.
 */
@Injectable({ providedIn: 'root' })
export class YDocService {
  /**
   * `gc: true` laisse Yjs libérer le contenu des clés supprimées. Sans ça, le
   * document grossirait indéfiniment au fil des courses.
   */
  readonly doc = new Y.Doc({ gc: true });

  readonly deviceId = resolveDeviceId();
  readonly deviceName = resolveDeviceName();

  /**
   * Émet à chaque changement du document, **qu'il soit local ou distant**.
   *
   * C'est le point clé de l'architecture : une modification arrivée de GitHub
   * ou d'un QR code emprunte exactement le même chemin qu'un clic de
   * l'utilisateur. Il n'y a rien de spécial à écrire pour le distant.
   *
   * `auditTime(0)` regroupe les rafales d'un même tick — appliquer un delta
   * distant peut déclencher plusieurs événements pour un seul changement
   * visible.
   */
  readonly snapshot$: Observable<CrdtSnapshot> = new Observable<void>(
    (subscriber) => {
      const notify = (): void => subscriber.next();
      this.doc.on('update', notify);
      // Ce nettoyage ne s'exécute jamais tel que le flux est câblé :
      // `shareReplay({ refCount: false })` garde l'abonnement à la source pour
      // toute la vie de l'application. On le garde quand même pour que
      // l'observable reste correcte si ce réglage change.
      /* v8 ignore next -- désabonnement inatteignable, voir ci-dessus */
      return () => this.doc.off('update', notify);
    },
  ).pipe(
    auditTime(0),
    startWith(undefined),
    map(() => readSnapshot(this.doc)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.doc.destroy());
  }

  /**
   * Applique des mutations en une seule transaction.
   *
   * Grouper compte : une transaction produit une seule mise à jour Yjs, donc
   * un seul delta à synchroniser et un seul recalcul de snapshot.
   */
  transact(mutate: (doc: Y.Doc) => void): void {
    this.doc.transact(() => mutate(this.doc), LOCAL_ORIGIN);
  }

  /** Instantané synchrone, pour les rares cas où l'on ne peut pas s'abonner. */
  currentSnapshot(): CrdtSnapshot {
    return readSnapshot(this.doc);
  }
}
