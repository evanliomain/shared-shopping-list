/**
 * Un `createImageBitmap` et un `OffscreenCanvas` de papier.
 *
 * jsdom n'a ni l'un ni l'autre, et même dans un vrai navigateur le rendu
 * dépend du GPU : les pixels ne sont pas vérifiables. Ce double enregistre donc
 * les ordres donnés — le carré découpé, la taille de sortie, l'encodage
 * demandé, la libération du bitmap — qui sont exactement ce que la réduction
 * décide.
 */

/** Les neuf arguments de `drawImage`, sous un nom lisible. */
export interface DrawCall {
  readonly left: number;
  readonly top: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetLeft: number;
  readonly targetTop: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
}

export interface FakeCanvasOptions {
  /** Dimensions de la photo source. */
  readonly width: number;
  readonly height: number;
  /** Octets rendus par l'encodage. */
  readonly encoded?: Uint8Array;
  /** Type MIME réellement produit, qui n'est pas toujours celui demandé. */
  readonly encodedMime?: string;
  /** Aucun contexte 2D : un navigateur à court de mémoire graphique. */
  readonly withoutContext?: boolean;
}

export interface FakeCanvas {
  /** Tailles des canevas créés. */
  readonly canvases: Array<{ width: number; height: number }>;
  readonly draws: DrawCall[];
  readonly encodings: ImageEncodeOptions[];
  /** Bitmaps libérés : sans ça la mémoire graphique du navigateur fuit. */
  closed: number;
  restore(): void;
}

export function installFakeCanvas(options: FakeCanvasOptions): FakeCanvas {
  const holder = globalThis as unknown as Record<string, unknown>;
  const previousBitmap = holder['createImageBitmap'];
  const previousCanvas = holder['OffscreenCanvas'];

  const fake: FakeCanvas = {
    canvases: [],
    draws: [],
    encodings: [],
    closed: 0,
    restore: () => {
      holder['createImageBitmap'] = previousBitmap;
      holder['OffscreenCanvas'] = previousCanvas;
    },
  };

  holder['createImageBitmap'] = async () => ({
    width: options.width,
    height: options.height,
    close: () => {
      fake.closed++;
    },
  });

  holder['OffscreenCanvas'] = class {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {
      fake.canvases.push({ width, height });
    }

    getContext(): OffscreenCanvasRenderingContext2D | null {
      if (true === options.withoutContext) {
        return null;
      }

      const context = {
        drawImage: (
          _bitmap: unknown,
          left: number,
          top: number,
          sourceWidth: number,
          sourceHeight: number,
          targetLeft: number,
          targetTop: number,
          targetWidth: number,
          targetHeight: number,
        ) => {
          fake.draws.push({
            left,
            top,
            sourceWidth,
            sourceHeight,
            targetLeft,
            targetTop,
            targetWidth,
            targetHeight,
          });
        },
      };

      return context as unknown as OffscreenCanvasRenderingContext2D;
    }

    async convertToBlob(encoding: ImageEncodeOptions): Promise<Blob> {
      fake.encodings.push(encoding);

      const bytes = options.encoded ?? new Uint8Array([0x52, 0x49, 0x46, 0x46]);

      return new Blob([bytes as BlobPart], {
        type: options.encodedMime ?? encoding.type,
      });
    }
  };

  return fake;
}
