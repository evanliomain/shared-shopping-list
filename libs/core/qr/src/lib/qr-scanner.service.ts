import { Injectable } from '@angular/core';
import { ErrorParams, TranslatableError } from '@shopping-list/util/i18n';

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

/**
 * Nombre d'échecs d'affilée avant d'abandonner.
 *
 * ~1,5 s à 60 images/s : assez pour absorber une série d'images illisibles,
 * assez court pour ne pas laisser l'utilisateur devant une caméra morte.
 */
const MAX_CONSECUTIVE_FAILURES = 90;

export type ScanFailure =
  | 'unsupported'
  | 'permission-denied'
  | 'no-camera'
  | 'aborted';

export class ScanError extends TranslatableError {
  constructor(
    readonly reason: ScanFailure,
    key: string,
    params?: ErrorParams,
  ) {
    super(key, params);
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
    let first = '';

    await this.scanMany(video, signal, (raw) => {
      first = raw;
      return true;
    });

    return first;
  }

  /**
   * Lit des codes **en gardant la caméra ouverte** jusqu'à ce que `accept`
   * déclare la lecture terminée.
   *
   * C'est ce dont a besoin un échange découpé en plusieurs écrans : refermer
   * et rouvrir la caméra entre deux trames coûte près d'une seconde, pendant
   * laquelle les trames continuent de défiler en face. On manquait alors
   * l'essentiel de la boucle, et le scan n'aboutissait jamais.
   *
   * @param accept reçoit chaque code lu et rend `true` quand il a tout ce
   *               qu'il lui faut.
   */
  async scanMany(
    video: HTMLVideoElement,
    signal: AbortSignal,
    accept: (raw: string) => boolean,
  ): Promise<void> {
    const Detector = detectorConstructor();
    if (null === Detector) {
      throw new ScanError('unsupported', 'errors.scan.unsupportedBrowser');
    }

    const stream = await this.openCamera();
    const detector = new Detector({ formats: ['qr_code'] });

    try {
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();

      await this.loop(video, detector, signal, accept);
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
        video: {
          facingMode: 'environment',
          /*
           * Sans contrainte de définition, les navigateurs ouvrent la caméra
           * en 640×480. Un QR d'une centaine de modules lu sur l'écran d'un
           * autre téléphone n'y fait plus que deux pixels par module : sous le
           * seuil de détection, la caméra tourne sans jamais rien trouver.
           *
           * `ideal` et non `exact` : une caméra qui ne sait pas monter si haut
           * rend ce qu'elle peut, au lieu de refuser de s'ouvrir.
           */
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';

      if ('NotAllowedError' === name || 'SecurityError' === name) {
        throw new ScanError('permission-denied', 'errors.camera.denied');
      }
      throw new ScanError('no-camera', 'errors.camera.none');
    }
  }

  private loop(
    video: HTMLVideoElement,
    detector: BarcodeDetectorLike,
    signal: AbortSignal,
    accept: (raw: string) => boolean,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (settle: () => void): void => {
        settled = true;
        signal.removeEventListener('abort', abort);
        settle();
      };

      const abort = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new ScanError('aborted', 'errors.scan.aborted'));
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

      /**
       * Échecs consécutifs de `detect()`.
       *
       * Une image floue ou surexposée lève parfois : ce n'est pas une erreur,
       * on retente à la suivante. Mais sur Android, `BarcodeDetector` s'appuie
       * sur un module Play Services téléchargé à la demande ; s'il manque,
       * **toutes** les images lèvent. Sans ce compteur, la caméra resterait
       * ouverte indéfiniment sans rien détecter ni rien dire.
       */
      let consecutiveFailures = 0;

      /**
       * Dernier code transmis à l'appelant.
       *
       * Une trame reste dans le cadre pendant des dizaines d'images : sans
       * cette garde, `accept` serait rappelé à chaque image pour le même code.
       */
      let last: string | null = null;

      const tick = async (): Promise<void> => {
        if (settled) {
          return;
        }

        let raw: string | undefined;

        try {
          const [found] = await detector.detect(video);
          consecutiveFailures = 0;
          raw = found?.rawValue;
        } catch {
          consecutiveFailures++;

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            finish(() =>
              reject(
                new ScanError('unsupported', 'errors.scan.unsupportedDevice'),
              ),
            );
            return;
          }
        }

        if (undefined !== raw && raw !== last) {
          last = raw;

          try {
            if (accept(raw)) {
              finish(resolve);
              return;
            }
          } catch (error) {
            // `accept` assemble les trames et peut rejeter une lecture
            // corrompue : sans cette reprise, la promesse ne se résoudrait
            // jamais et la caméra resterait allumée.
            finish(() => reject(error));
            return;
          }
        }

        if (!settled) {
          requestAnimationFrame(() => void tick());
        }
      };

      void tick();
    });
  }
}
