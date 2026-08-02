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

function stubCamera(behaviour: 'ok' | 'denied' | 'missing'): () => void {
  const previous = navigator.mediaDevices;

  const tracks = [{ stop: () => undefined }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => {
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
