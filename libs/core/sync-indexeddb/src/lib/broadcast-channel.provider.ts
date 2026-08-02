import { Injectable, signal } from '@angular/core';
import { SyncProvider, SyncStatus } from '@shopping-list/core/sync';
import * as Y from 'yjs';

export const BROADCAST_CHANNEL_NAME = 'shopping-list.sync';

/**
 * Messages échangés entre onglets. `BroadcastChannel` utilise le clonage
 * structuré, donc les `Uint8Array` passent tels quels — pas de base64.
 */
type Message =
  | { readonly kind: 'update'; readonly update: Uint8Array }
  | { readonly kind: 'state-vector'; readonly vector: Uint8Array };

/**
 * Synchronisation instantanée entre les onglets d'un même appareil.
 *
 * Sans ça, deux onglets ouverts sur l'application ne se verraient qu'au
 * rechargement : IndexedDB persiste, mais ne notifie pas.
 *
 * Le protocole est celui de Yjs, en trois règles :
 *
 *  1. à la connexion, on annonce son vecteur d'état — « voici ce que j'ai » ;
 *  2. en recevant un vecteur d'état, on répond par le delta manquant ;
 *  3. à chaque modification locale, on diffuse le delta.
 *
 * Les mises à jour reçues sont appliquées avec `this` comme origine, ce qui
 * évite de les rediffuser en boucle.
 */
@Injectable({ providedIn: 'root' })
export class BroadcastChannelSyncProvider implements SyncProvider {
  readonly id = 'broadcast-channel';
  readonly label = 'Autres onglets';

  private readonly statusSignal = signal<SyncStatus>('idle');
  private readonly errorSignal = signal<string | null>(null);

  readonly status = this.statusSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();

  private channel: BroadcastChannel | null = null;
  private doc: Y.Doc | null = null;
  private onUpdate: ((update: Uint8Array, origin: unknown) => void) | null =
    null;

  connect(doc: Y.Doc): void {
    if (null !== this.channel) {
      return;
    }

    if ('undefined' === typeof BroadcastChannel) {
      // Rare, mais l'application doit rester utilisable sans.
      this.statusSignal.set('idle');
      return;
    }

    this.statusSignal.set('connecting');
    this.doc = doc;

    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    this.channel = channel;

    channel.onmessage = (event: MessageEvent<Message>) =>
      this.receive(event.data);

    this.onUpdate = (update, origin) => {
      // Ne pas renvoyer à l'expéditeur ce qu'il vient de nous transmettre.
      if (origin === this) {
        return;
      }
      this.post({ kind: 'update', update });
    };
    doc.on('update', this.onUpdate);

    // « Voici où j'en suis » — les autres onglets répondront avec le manquant.
    this.post({ kind: 'state-vector', vector: Y.encodeStateVector(doc) });
    this.statusSignal.set('live');
  }

  disconnect(): void {
    if (null !== this.onUpdate && null !== this.doc) {
      this.doc.off('update', this.onUpdate);
    }
    this.channel?.close();

    this.channel = null;
    this.doc = null;
    this.onUpdate = null;
    this.statusSignal.set('idle');
  }

  private receive(message: Message): void {
    const doc = this.doc;
    if (null === doc) {
      return;
    }

    if ('update' === message.kind) {
      Y.applyUpdate(doc, message.update, this);
      return;
    }

    // Un onglet annonce son état : on lui envoie ce qui lui manque, et rien
    // d'autre.
    const missing = Y.encodeStateAsUpdate(doc, message.vector);
    this.post({ kind: 'update', update: missing });
  }

  private post(message: Message): void {
    try {
      this.channel?.postMessage(message);
    } catch (error) {
      this.errorSignal.set(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
