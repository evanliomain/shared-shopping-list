import { computed, inject, Injectable, signal } from '@angular/core';
import { BlobService, blobHashOf } from '@shopping-list/core/blobs';
import { ImageRef } from '@shopping-list/core/crdt';
import {
  fetchImage,
  GithubConfigService,
  pushImage,
} from '@shopping-list/core/sync-github';

/**
 * Résout les photos des produits, et rattrape celles qui manquent.
 *
 * Ce service existe parce que `<sl-product-avatar>` doit rester muet : un
 * composant d'interface ne fait pas d'entrées-sorties. Il reçoit une URL déjà
 * résolue, ou rien — auquel cas il affiche l'emoji.
 *
 * Le rattrapage est **paresseux et silencieux**. Après un échange par QR, les
 * produits arrivent sans leurs photos ; elles se complètent toutes seules au
 * retour du réseau, sans jamais retarder l'affichage de la liste.
 */
@Injectable({ providedIn: 'root' })
export class ProductImages {
  private readonly blobs = inject(BlobService);
  private readonly config = inject(GithubConfigService);

  private readonly urlsSignal = signal<ReadonlyMap<string, string>>(new Map());
  /** Empreintes en cours de traitement, pour ne pas les redemander en boucle. */
  private readonly inFlight = new Set<string>();
  /** Empreintes introuvables à distance : inutile d'insister à chaque rendu. */
  private readonly missing = new Set<string>();

  readonly urls = this.urlsSignal.asReadonly();

  /** Nombre de photos affichables, utile pour les écrans de diagnostic. */
  readonly count = computed(() => this.urlsSignal().size);

  /** URL prête à poser dans un `src`, ou `null` si la photo n'est pas encore là. */
  urlFor(ref: ImageRef | null): string | null {
    const hash = blobHashOf(ref);
    return null === hash ? null : (this.urlsSignal().get(hash) ?? null);
  }

  /**
   * Demande la résolution d'un lot de références.
   *
   * Idempotent et sans attente : on peut l'appeler à chaque rendu.
   */
  ensure(refs: readonly (ImageRef | null)[]): void {
    for (const ref of refs) {
      const hash = blobHashOf(ref);
      if (
        null === hash ||
        this.urlsSignal().has(hash) ||
        this.inFlight.has(hash) ||
        this.missing.has(hash)
      ) {
        continue;
      }

      this.inFlight.add(hash);
      void this.resolve(hash).finally(() => this.inFlight.delete(hash));
    }
  }

  private async resolve(hash: string): Promise<void> {
    const local = await this.blobs.objectUrl(hash);
    if (null !== local) {
      this.publish(hash, local);
      return;
    }

    const config = this.config.config();
    if (null === config) {
      // Pas de dépôt appairé : on ne peut rien rattraper, et c'est normal.
      return;
    }

    try {
      const remote = await fetchImage(config, hash);
      if ('absent' === remote.kind) {
        // L'autre appareil n'a pas encore publié la photo. Elle arrivera peut-
        // être plus tard ; on ne redemande pas à chaque rendu d'ici là.
        this.missing.add(hash);
        return;
      }

      await this.blobs.adopt(hash, remote.bytes, 'image/webp');
      const url = await this.blobs.objectUrl(hash);
      if (null !== url) {
        this.publish(hash, url);
      }
    } catch {
      // Réseau ou jeton : l'emoji fait le travail en attendant. Une photo
      // manquante ne doit jamais faire échouer l'affichage d'une liste.
    }
  }

  /**
   * Publie une photo locale vers le dépôt.
   *
   * À appeler après avoir enregistré une photo prise avec l'appareil. Le
   * fichier est nommé par son empreinte, donc immuable : republier ne peut
   * jamais écraser autre chose.
   */
  async publishToRemote(ref: ImageRef | null): Promise<void> {
    const hash = blobHashOf(ref);
    const config = this.config.config();
    if (null === hash || null === config) {
      return;
    }

    const bytes = await this.blobs.bytesOf(hash);
    if (null === bytes) {
      return;
    }

    try {
      await pushImage(config, hash, bytes);
      this.missing.delete(hash);
    } catch {
      // On réessaiera : l'image est de toute façon disponible localement.
    }
  }

  private publish(hash: string, url: string): void {
    this.urlsSignal.update((current) => new Map(current).set(hash, url));
  }
}
