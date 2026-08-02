import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ImageRef } from '@shopping-list/core/crdt';

import { hasBlob, listBlobHashes, readBlob, writeBlob } from './blob-store';
import { hashContent, processImage } from './image-pipeline';

/** Préfixe des références d'image stockées dans le CRDT. */
const BLOB_PREFIX = 'blob:';

export function isBlobRef(ref: ImageRef | null): boolean {
  return null !== ref && ref.startsWith(BLOB_PREFIX);
}

export function blobHashOf(ref: ImageRef | null): string | null {
  return isBlobRef(ref) ? (ref as string).slice(BLOB_PREFIX.length) : null;
}

export function toBlobRef(hash: string): ImageRef {
  return `${BLOB_PREFIX}${hash}`;
}

/**
 * Photos des produits.
 *
 * Le CRDT ne porte qu'une référence — jamais de pixels. Mettre les images dans
 * le document ferait passer `state.bin` de quelques kilo-octets à plusieurs
 * méga-octets, dépasserait la limite de 1 Mo de l'API Contents de GitHub, et
 * rendrait l'échange par QR code impossible.
 */
@Injectable({ providedIn: 'root' })
export class BlobService {
  /** URLs objet créées ici, à révoquer pour ne pas fuir de mémoire. */
  private readonly objectUrls = new Map<string, string>();

  /** Empreintes présentes localement, pour que l'affichage réagisse. */
  private readonly availableSignal = signal<ReadonlySet<string>>(new Set());
  readonly available = this.availableSignal.asReadonly();

  constructor() {
    void this.refreshAvailable();

    inject(DestroyRef).onDestroy(() => {
      for (const url of this.objectUrls.values()) {
        URL.revokeObjectURL(url);
      }
      this.objectUrls.clear();
    });
  }

  /**
   * Réduit, encode et range une photo.
   *
   * @returns la référence à écrire dans le CRDT.
   */
  async store(source: Blob, now = Date.now()): Promise<ImageRef> {
    const { bytes, mime } = await processImage(source);
    const hash = await hashContent(bytes);

    // Adressage par contenu : si la photo est déjà là, il n'y a rien à écrire.
    if (!(await hasBlob(hash))) {
      await writeBlob(hash, bytes, mime, now);
      await this.refreshAvailable();
    }

    return toBlobRef(hash);
  }

  /** Range un contenu déjà encodé, tel qu'il arrive du dépôt distant. */
  async adopt(hash: string, bytes: Uint8Array, mime: string): Promise<void> {
    await writeBlob(hash, bytes, mime, Date.now());
    await this.refreshAvailable();
  }

  /**
   * URL affichable, ou `null` si l'image n'est pas encore là.
   *
   * `null` est un état normal, pas une erreur : après un échange par QR, les
   * produits arrivent sans leurs photos. L'appelant retombe alors sur l'emoji.
   */
  async objectUrl(hash: string): Promise<string | null> {
    const cached = this.objectUrls.get(hash);
    if (undefined !== cached) {
      return cached;
    }

    const stored = await readBlob(hash);
    if (null === stored) {
      return null;
    }

    const url = URL.createObjectURL(
      new Blob([stored.bytes as BlobPart], { type: stored.mime }),
    );
    this.objectUrls.set(hash, url);
    return url;
  }

  async bytesOf(hash: string): Promise<Uint8Array | null> {
    return (await readBlob(hash))?.bytes ?? null;
  }

  private async refreshAvailable(): Promise<void> {
    try {
      this.availableSignal.set(new Set(await listBlobHashes()));
    } catch {
      // IndexedDB indisponible : on affichera les emoji, rien de plus.
      this.availableSignal.set(new Set());
    }
  }
}
