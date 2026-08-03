import { TestBed } from '@angular/core/testing';

import { QrScanner, ScanError } from './qr-scanner.service';

interface Detected {
  rawValue: string;
}

/** Installe un faux `BarcodeDetector` ; rend une fonction de démontage. */
function stubDetector(results: () => Detected[]): () => void {
  const holder = globalThis as unknown as Record<string, unknown>;
  const previous = holder['BarcodeDetector'];

  holder['BarcodeDetector'] = class {
    async detect(): Promise<Detected[]> {
      return results();
    }
  };

  return () => {
    holder['BarcodeDetector'] = previous;
  };
}

/** Contraintes demandées à chaque ouverture, dans l'ordre. */
const requested: MediaStreamConstraints[] = [];

function stubCamera(behaviour: 'ok' | 'denied' | 'missing'): () => void {
  const previous = navigator.mediaDevices;

  const tracks = [{ stop: () => undefined }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        requested.push(constraints);
        if ('denied' === behaviour) {
          throw Object.assign(new Error('refusé'), {
            name: 'NotAllowedError',
          });
        }
        if ('missing' === behaviour) {
          throw Object.assign(new Error('absente'), {
            name: 'NotFoundError',
          });
        }
        return stream;
      },
    },
  });

  return () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: previous,
    });
  };
}

function fakeVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.play = async () => undefined;
  return video;
}

describe('QrScanner', () => {
  let restore: Array<() => void> = [];

  function scanner(): QrScanner {
    TestBed.configureTestingModule({});
    return TestBed.inject(QrScanner);
  }

  afterEach(() => {
    for (const undo of restore.reverse()) {
      undo();
    }
    restore = [];
    requested.length = 0;
  });

  describe('isSupported', () => {
    it('est faux sans BarcodeDetector', () => {
      restore.push(stubCamera('ok'));

      // L'interface doit alors proposer la saisie manuelle d'emblée, plutôt
      // qu'ouvrir une caméra qui ne détectera jamais rien.
      expect(scanner().isSupported()).toBe(false);
    });

    it('est vrai avec BarcodeDetector et une caméra', () => {
      restore.push(stubDetector(() => []));
      restore.push(stubCamera('ok'));

      expect(scanner().isSupported()).toBe(true);
    });
  });

  describe('scanOnce', () => {
    it('échoue explicitement quand le navigateur ne sait pas lire', async () => {
      restore.push(stubCamera('ok'));

      await expect(
        scanner().scanOnce(fakeVideo(), new AbortController().signal),
      ).rejects.toMatchObject({ reason: 'unsupported' });
    });

    it('rend la première valeur détectée', async () => {
      restore.push(stubDetector(() => [{ rawValue: '{"v":1}' }]));
      restore.push(stubCamera('ok'));

      await expect(
        scanner().scanOnce(fakeVideo(), new AbortController().signal),
      ).resolves.toBe('{"v":1}');
    });

    it('continue de chercher tant que rien n’est lu', async () => {
      let attempts = 0;
      restore.push(
        stubDetector(() => (++attempts < 3 ? [] : [{ rawValue: 'trouvé' }])),
      );
      restore.push(stubCamera('ok'));

      await expect(
        scanner().scanOnce(fakeVideo(), new AbortController().signal),
      ).resolves.toBe('trouvé');
      expect(attempts).toBe(3);
    });

    it('distingue un refus de permission d’une caméra absente', async () => {
      restore.push(stubDetector(() => []));
      restore.push(stubCamera('denied'));

      await expect(
        scanner().scanOnce(fakeVideo(), new AbortController().signal),
      ).rejects.toMatchObject({ reason: 'permission-denied' });
    });

    it('demande une caméra assez définie pour lire un code dense', async () => {
      // Sans contrainte, les navigateurs ouvrent en 640×480 : un QR d'une
      // centaine de modules lu sur l'écran d'un autre téléphone y tombe sous
      // deux pixels par module, et n'est jamais détecté — sans erreur.
      restore.push(stubDetector(() => [{ rawValue: 'trouvé' }]));
      restore.push(stubCamera('ok'));

      await scanner().scanOnce(fakeVideo(), new AbortController().signal);

      expect(requested).toHaveLength(1);
      expect(requested[0].video).toMatchObject({
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      });
    });

    it('éteint la caméra quand on annule', async () => {
      // Sans ça, la pastille d'enregistrement resterait allumée après avoir
      // quitté l'écran.
      const stopped: boolean[] = [];
      const previous = navigator.mediaDevices;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () =>
            ({
              getTracks: () => [{ stop: () => stopped.push(true) }],
            }) as unknown as MediaStream,
        },
      });
      restore.push(() =>
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: previous,
        }),
      );
      restore.push(stubDetector(() => []));

      const controller = new AbortController();
      const scanning = scanner().scanOnce(fakeVideo(), controller.signal);
      controller.abort();

      await expect(scanning).rejects.toBeInstanceOf(ScanError);
      expect(stopped).toEqual([true]);
    });
  });

  describe('scanMany', () => {
    it('lit plusieurs codes sans refermer la caméra', async () => {
      // Un échange de proximité découpé en trames a besoin de les lire toutes.
      // Rouvrir la caméra entre deux coûte près d'une seconde, pendant
      // laquelle la boucle d'en face continue de défiler : l'assemblage
      // n'aboutissait jamais.
      const codes = ['trame-0', 'trame-1', 'trame-2'];
      let index = 0;
      restore.push(
        stubDetector(() => {
          const code = codes[Math.min(index, codes.length - 1)];
          return undefined === code ? [] : [{ rawValue: code }];
        }),
      );
      restore.push(stubCamera('ok'));

      const seen: string[] = [];
      await scanner().scanMany(
        fakeVideo(),
        new AbortController().signal,
        (raw) => {
          seen.push(raw);
          index++;
          return seen.length === codes.length;
        },
      );

      expect(seen).toEqual(codes);
      expect(requested).toHaveLength(1);
    });

    it('retient tous les codes d’une même image', async () => {
      // Deux trames peuvent tenir dans le cadre en même temps ; n'en garder
      // qu'une gaspillerait un tour de boucle complet en face.
      restore.push(
        stubDetector(() => [{ rawValue: 'trame-0' }, { rawValue: 'trame-1' }]),
      );
      restore.push(stubCamera('ok'));

      const seen: string[] = [];
      await scanner().scanMany(
        fakeVideo(),
        new AbortController().signal,
        (raw) => {
          seen.push(raw);
          return 2 === seen.length;
        },
      );

      expect(seen).toEqual(['trame-0', 'trame-1']);
      expect(requested).toHaveLength(1);
    });

    it('ne repasse pas deux fois le même code', async () => {
      // Une trame reste dans le cadre pendant des dizaines d'images.
      restore.push(stubDetector(() => [{ rawValue: 'même trame' }]));
      restore.push(stubCamera('ok'));

      let calls = 0;
      const controller = new AbortController();
      const scanning = scanner().scanMany(
        fakeVideo(),
        controller.signal,
        () => {
          calls++;
          return false;
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      controller.abort();
      await expect(scanning).rejects.toBeInstanceOf(ScanError);

      expect(calls).toBe(1);
    });

    it('remonte une lecture corrompue plutôt que de tourner sans fin', async () => {
      // `accept` assemble les trames et vérifie l'empreinte : s'il rejette,
      // la caméra doit s'éteindre et l'écran le dire.
      restore.push(stubDetector(() => [{ rawValue: 'trame' }]));
      restore.push(stubCamera('ok'));

      await expect(
        scanner().scanMany(fakeVideo(), new AbortController().signal, () => {
          throw new Error('assemblage corrompu');
        }),
      ).rejects.toThrow('assemblage corrompu');
    });
  });
});

describe('QrScanner — détecteur défaillant', () => {
  let restore: Array<() => void> = [];

  afterEach(() => {
    for (const undo of restore.reverse()) {
      undo();
    }
    restore = [];
  });

  it('abandonne avec un message quand la détection échoue en boucle', async () => {
    // Cas Android réel : `BarcodeDetector` existe, mais le module Play
    // Services sur lequel il s'appuie n'est pas installé, donc chaque image
    // lève. Sans garde-fou, la caméra resterait ouverte sans rien dire.
    const holder = globalThis as unknown as Record<string, unknown>;
    const previousDetector = holder['BarcodeDetector'];
    holder['BarcodeDetector'] = class {
      async detect(): Promise<never> {
        throw new Error('module indisponible');
      }
    };
    restore.push(() => {
      holder['BarcodeDetector'] = previousDetector;
    });

    const stopped: boolean[] = [];
    const previousMedia = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () =>
          ({
            getTracks: () => [{ stop: () => stopped.push(true) }],
          }) as unknown as MediaStream,
      },
    });
    restore.push(() =>
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: previousMedia,
      }),
    );

    TestBed.configureTestingModule({});
    const video = document.createElement('video');
    video.play = async () => undefined;

    await expect(
      TestBed.inject(QrScanner).scanOnce(video, new AbortController().signal),
    ).rejects.toMatchObject({ reason: 'unsupported' });

    // Et la caméra est bien éteinte.
    expect(stopped).toEqual([true]);
  });
});
