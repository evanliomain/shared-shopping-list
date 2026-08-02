import { Injectable } from '@angular/core';

/**
 * `BarcodeDetector` n'est pas dans les types du DOM : on déclare le minimum
 * qu'on utilise, sans le supposer présent.
 */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

function detectorConstructor(): BarcodeDetectorConstructor | null {
  const candidate = (
    globalThis as unknown as {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }
  ).BarcodeDetector;

  return candidate ?? null;
}

export type ScanFailure =
  | 'unsupported'
  | 'permission-denied'
  | 'no-camera'
  | 'aborted';

export class ScanError extends Error {
  constructor(
    readonly reason: ScanFailure,
    message: string,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

/**
 * Lecture de QR par la caméra arrière.
 *
 * Volontairement bâti autour de `BarcodeDetector`, natif et sans dépendance.
 * Là où il manque, on ne dégrade pas en silence : `isSupported()` permet à
 * l'interface de proposer d'emblée la saisie manuelle, plutôt que d'ouvrir une
 * caméra qui ne détectera jamais rien.
 */
@Injectable({ providedIn: 'root' })
export class QrScanner {
  isSupported(): boolean {
    return (
      null !== detectorConstructor() &&
      undefined !== navigator.mediaDevices?.getUserMedia
    );
  }

  /**
   * Ouvre la caméra, rend le flux dans `video`, et résout à la première
   * lecture réussie.
   *
   * @param signal permet d'annuler quand l'utilisateur ferme l'écran — sans
   *               quoi la caméra resterait allumée.
   */
  async scanOnce(
    video: HTMLVideoElement,
    signal: AbortSignal,
  ): Promise<string> {
    const Detector = detectorConstructor();
    if (null === Detector) {
      throw new ScanError(
        'unsupported',
        'Ce navigateur ne sait pas lire les QR codes. Saisissez les informations à la main.',
      );
    }

    const stream = await this.openCamera();
    const detector = new Detector({ formats: ['qr_code'] });

    try {
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();

      return await this.loop(video, detector, signal);
    } finally {
      // Toujours éteindre la caméra, y compris sur erreur ou annulation.
      for (const track of stream.getTracks()) {
        track.stop();
      }
      video.srcObject = null;
    }
  }

  private async openCamera(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';

      if ('NotAllowedError' === name || 'SecurityError' === name) {
        throw new ScanError(
          'permission-denied',
          "L'accès à la caméra a été refusé.",
        );
      }
      throw new ScanError('no-camera', "Aucune caméra n'est disponible.");
    }
  }

  private loop(
    video: HTMLVideoElement,
    detector: BarcodeDetectorLike,
    signal: AbortSignal,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;

      const abort = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new ScanError('aborted', 'Lecture interrompue.'));
      };

      // Le signal peut déjà être annulé : l'appelant a pu quitter l'écran
      // pendant l'ouverture de la caméra, qui est asynchrone. `addEventListener`
      // ne se déclencherait alors jamais, et la promesse ne se résoudrait
      // jamais — la caméra resterait allumée.
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });

      const tick = async (): Promise<void> => {
        if (settled) {
          return;
        }

        try {
          const [found] = await detector.detect(video);
          if (undefined !== found) {
            settled = true;
            signal.removeEventListener('abort', abort);
            resolve(found.rawValue);
            return;
          }
        } catch {
          // Une image illisible n'est pas une erreur : on retente à la suivante.
        }

        if (!settled) {
          requestAnimationFrame(() => void tick());
        }
      };

      void tick();
    });
  }
}
