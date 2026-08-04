import { inject, Injectable } from '@angular/core';
import { BlobService } from '@shopping-list/core/blobs';
import { ImageCredit, ImageRef } from '@shopping-list/core/crdt';
import {
  BankImage,
  findBankImage,
  searchBankImages,
} from '@shopping-list/core/image-bank';

import { ProductImages } from './product-images.service';

/** Une image de la banque, désormais stockée localement comme n'importe quelle photo. */
export interface AdoptedImage {
  readonly imageRef: ImageRef;
  readonly credit: ImageCredit;
}

/**
 * Fait entrer une image de la banque dans l'application.
 *
 * Tout le travail est là : une fois adoptée, une image de banque **est** une
 * photo ordinaire. Elle passe par la même réduction à 160 px en WebP, le même
 * stockage adressé par contenu, la même publication vers le dépôt de synchro. Le
 * modèle n'a pas eu besoin d'un troisième genre de référence à côté d'`emoji:`
 * et de `blob:`, et rien de ce qui affiche des images n'a eu à changer.
 *
 * Conséquence heureuse : une fois choisie, l'image ne dépend plus du réseau ni
 * du fournisseur. Elle survit à la disparition de l'un comme de l'autre, ce qui
 * n'est pas rien pour une application dont la promesse est de marcher au fond
 * d'un rayon.
 */
@Injectable({ providedIn: 'root' })
export class ProductBankImages {
  private readonly blobs = inject(BlobService);
  private readonly images = inject(ProductImages);

  /** Ce que la grille de résultats affiche. Peut lever si aucun fournisseur ne répond. */
  search(query: string): Promise<readonly BankImage[]> {
    return searchBankImages(query);
  }

  /**
   * Cherche d'office et adopte le premier résultat, s'il y en a un.
   *
   * Rend `null` sans bruit quand il n'y a rien à proposer — pas de réseau, aucun
   * fournisseur debout, aucun résultat. L'emoji du rayon reste, et c'est un
   * repli parfaitement acceptable : personne n'a rien demandé.
   */
  async propose(label: string): Promise<AdoptedImage | null> {
    const found = await findBankImage(label);
    return null === found ? null : this.adopt(found);
  }

  /**
   * Télécharge la vignette, la range, et rend de quoi l'attacher à un produit.
   *
   * La publication vers le dépôt part sans qu'on l'attende : l'image est déjà
   * lisible localement, et l'autre appareil la rattrapera de toute façon tout
   * seul s'il ne la trouve pas.
   */
  async adopt(image: BankImage): Promise<AdoptedImage | null> {
    const response = await fetch(image.thumbUrl);

    if (!response.ok) {
      return null;
    }

    const imageRef = await this.blobs.store(await response.blob());

    // Pour que l'avatar l'affiche sans attendre le prochain balayage.
    this.images.ensure([imageRef]);
    void this.images.publishToRemote(imageRef);

    return { imageRef, credit: image.credit };
  }
}
