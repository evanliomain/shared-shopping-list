/**
 * Réduction d'une photo à ce qui est réellement affiché.
 *
 * Une vignette de produit fait 56 px à l'écran ; on garde 160 px pour rester
 * net sur les écrans à haute densité, et pas davantage. Une photo de téléphone
 * brute pèse 3 à 8 Mo — ici on descend à 4-8 Ko, ce qui rend le stockage et la
 * synchronisation triviaux.
 */
export const IMAGE_SIZE = 160;
export const IMAGE_QUALITY = 0.8;

/**
 * WebP plutôt que JPEG : environ 30 % plus léger à qualité égale, et supporté
 * partout depuis Safari 14.
 */
export const IMAGE_MIME = 'image/webp';

export interface ProcessedImage {
  readonly bytes: Uint8Array;
  readonly mime: string;
}

/**
 * Recadre au carré depuis le centre, puis réduit.
 *
 * Le recadrage centré évite les vignettes déformées : une photo prise en
 * portrait garde son sujet, plutôt que d'être écrasée.
 */
export async function processImage(source: Blob): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(source);

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const left = (bitmap.width - side) / 2;
    const top = (bitmap.height - side) / 2;

    const canvas = new OffscreenCanvas(IMAGE_SIZE, IMAGE_SIZE);
    const context = canvas.getContext('2d');
    if (null === context) {
      throw new Error("Impossible de préparer l'image.");
    }

    context.drawImage(
      bitmap,
      left,
      top,
      side,
      side,
      0,
      0,
      IMAGE_SIZE,
      IMAGE_SIZE,
    );

    const encoded = await canvas.convertToBlob({
      type: IMAGE_MIME,
      quality: IMAGE_QUALITY,
    });

    return {
      bytes: new Uint8Array(await encoded.arrayBuffer()),
      mime: encoded.type,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Empreinte du contenu, tronquée à 16 caractères hexadécimaux.
 *
 * 64 bits : pour quelques centaines d'images, la probabilité de collision est
 * de l'ordre de 10⁻¹⁵. C'est cette empreinte qui sert de nom de fichier, ce qui
 * rend les images **immuables** — un même contenu produit toujours le même nom,
 * donc jamais de conflit d'écriture et un cache valable indéfiniment.
 */
export async function hashContent(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);

  return [...new Uint8Array(digest).subarray(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
