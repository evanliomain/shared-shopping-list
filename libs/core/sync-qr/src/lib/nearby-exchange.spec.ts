import QRCode from 'qrcode';
import * as Y from 'yjs';

import {
  encodeFrames,
  FrameCollector,
  MAX_FRAMES,
  PayloadTooLargeError,
} from './frames';
import {
  announce,
  completeAsInitiator,
  completeAsResponder,
  decodeMessage,
  encodeMessage,
  respond,
} from './nearby-protocol';

const ORIGIN = Symbol('qr');

/** Fait transiter une charge par des trames, comme le feraient deux écrans. */
async function throughQr(
  payload: Uint8Array,
  session: string,
  order: 'ordered' | 'shuffled' | 'looping' = 'ordered',
): Promise<Uint8Array> {
  const { frames } = await encodeFrames(payload, session);
  const collector = new FrameCollector();

  const sequence =
    'ordered' === order
      ? frames
      : 'shuffled' === order
        ? [...frames].reverse()
        : // « looping » : on rate la première trame, elle revient au tour suivant.
          [...frames.slice(1), ...frames];

  for (const frame of sequence) {
    collector.accept(frame);
  }

  const result = await collector.payload();
  if (null === result) {
    throw new Error('réassemblage incomplet');
  }
  return result;
}

function courses(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>('courses');
}

describe('trames QR', () => {
  it('fait un aller-retour fidèle', async () => {
    const payload = new Uint8Array(1500).map((_, i) => i % 256);

    expect(await throughQr(payload, 's1')).toEqual(payload);
  });

  it('supporte des trames lues dans le désordre', async () => {
    const payload = new Uint8Array(1500).map((_, i) => (i * 7) % 256);

    expect(await throughQr(payload, 's1', 'shuffled')).toEqual(payload);
  });

  it('rattrape une trame manquée au tour de boucle suivant', async () => {
    // Les trames défilent en boucle : le récepteur n'a pas à tout attraper du
    // premier coup, ce qui évite de synchroniser les deux téléphones.
    const payload = new Uint8Array(2000).map((_, i) => (i * 13) % 256);

    expect(await throughQr(payload, 's1', 'looping')).toEqual(payload);
  });

  it('compresse : une charge répétitive tient en une trame', async () => {
    const payload = new Uint8Array(5000).fill(42);
    const { frames } = await encodeFrames(payload, 's1');

    expect(frames).toHaveLength(1);
  });

  it('refuse une charge trop volumineuse plutôt que d’imposer une minute de scan', async () => {
    // Incompressible : chaque octet compte vraiment.
    const payload = crypto.getRandomValues(new Uint8Array(64_000));

    await expect(encodeFrames(payload, 's1')).rejects.toThrow(
      PayloadTooLargeError,
    );
    await expect(encodeFrames(payload, 's1')).rejects.toThrow(
      'errors.nearby.tooLarge',
    );
  });

  it('reste sous la limite pour une charge tout juste acceptable', async () => {
    const payload = crypto.getRandomValues(new Uint8Array(2000));
    const { frames } = await encodeFrames(payload, 's1');

    expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES);
  });

  it('ignore un code qui n’est pas une trame', () => {
    const collector = new FrameCollector();

    // La caméra lit tous les codes-barres qui passent, y compris celui du
    // paquet de pâtes qu'on tient dans l'autre main.
    expect(collector.accept('3760020507350')).toBe(false);
    expect(collector.accept('SL1|abc')).toBe(false);
    expect(collector.progress.received).toBe(0);
  });

  it('repart de zéro si l’autre téléphone relance un échange', async () => {
    const first = await encodeFrames(new Uint8Array(1500).fill(1), 'session-1');
    const second = await encodeFrames(new Uint8Array(900).fill(2), 'session-2');

    const collector = new FrameCollector();
    collector.accept(first.frames[0]);
    collector.accept(second.frames[0]);

    expect(collector.progress).toEqual({
      received: 1,
      total: second.frames.length,
    });
  });

  it('rejette un réassemblage corrompu', async () => {
    const { frames } = await encodeFrames(
      crypto.getRandomValues(new Uint8Array(1400)),
      's1',
    );

    const collector = new FrameCollector();

    // Toutes les trames arrivent, mais l'une d'elles porte des données
    // altérées : c'est exactement ce que l'empreinte doit attraper.
    for (const frame of frames) {
      collector.accept(frame);
    }
    const parts = frames[0].split('|');
    parts[5] = parts[5].slice(0, -4) + 'AAAA';
    collector.accept(parts.join('|'));

    expect(collector.complete).toBe(true);
    await expect(collector.payload()).rejects.toThrow(
      'errors.nearby.corrupted',
    );
  });

  it('rend la progression pour l’afficher', async () => {
    const { frames } = await encodeFrames(
      crypto.getRandomValues(new Uint8Array(1400)),
      's1',
    );

    const collector = new FrameCollector();
    collector.accept(frames[0]);

    expect(collector.progress).toEqual({
      received: 1,
      total: frames.length,
    });
    expect(collector.complete).toBe(false);
  });
});

/**
 * Ce qu'on demande à la caméra (voir `QrScanner`), et la part de la largeur
 * d'image qu'occupe le code quand on le cadre dans la lucarne.
 */
const CAMERA_WIDTH = 1920;
const FRAMING = 0.3;

/**
 * Seuil de détection de `BarcodeDetector`, en pixels par module.
 *
 * En dessous de trois, il ne trouve rien — et ne le dit pas : la caméra tourne
 * dans le vide. On se garde une marge, parce que le code est lu sur un écran,
 * de biais, avec des reflets.
 */
const MIN_PIXELS_PER_MODULE = 5;

/**
 * Pixels par module d'une trame dans l'image de la caméra.
 *
 * C'est **la** grandeur qui décide si un échange aboutit. Le nombre de modules
 * ne s'en déduit pas de tête : le base64url contient des minuscules, donc le QR
 * passe en mode octet, sensiblement moins compact que le mode alphanumérique.
 */
function pixelsPerModule(frame: string): number {
  const { modules } = QRCode.create(frame, { errorCorrectionLevel: 'M' });
  // + 4 : la marge silencieuse, qui compte dans ce que la caméra doit résoudre.
  return (CAMERA_WIDTH * FRAMING) / (modules.size + 4);
}

/** Une ouverture de l'application : Yjs y tire un `clientID` neuf. */
function inNewSession(doc: Y.Doc, write: (session: Y.Doc) => void): void {
  const session = new Y.Doc();
  Y.applyUpdate(session, Y.encodeStateAsUpdate(doc));
  write(session);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(session, Y.encodeStateVector(doc)));
}

describe('densité des trames', () => {
  it('garde une trame pleine lisible par la caméra', async () => {
    // Incompressible : chaque trame porte exactement sa charge maximale, donc
    // le cas le plus dense que l'écran puisse afficher.
    const payload = crypto.getRandomValues(new Uint8Array(4000));
    const { frames } = await encodeFrames(payload, 'session');

    for (const frame of frames) {
      expect(pixelsPerModule(frame)).toBeGreaterThanOrEqual(
        MIN_PIXELS_PER_MODULE,
      );
    }
  });

  it('annonce un document vécu sans animer l’écran', async () => {
    // Le vecteur d'état grossit d'environ six octets par ouverture de
    // l'application, indéfiniment. Il doit rester tenable en **un seul code
    // immobile** sur la durée de vie réaliste d'une liste de courses : scanner
    // une cible qui défile est autrement plus difficile.
    const doc = new Y.Doc();
    for (let i = 0; i < 100; i++) {
      inNewSession(doc, (session) =>
        courses(session).set(`p${i}`, `Article ${i}`),
      );
    }

    const { frames } = await encodeFrames(
      encodeMessage(announce(doc)),
      'session',
    );

    expect(frames).toHaveLength(1);
    expect(pixelsPerModule(frames[0])).toBeGreaterThanOrEqual(
      MIN_PIXELS_PER_MODULE,
    );
  });
});

describe('protocole de proximité', () => {
  it('fait converger deux téléphones en trois codes', async () => {
    const phoneA = new Y.Doc();
    const phoneB = new Y.Doc();

    // Chacun a coché de son côté, sans réseau.
    courses(phoneA).set('a', 'Lait');
    courses(phoneB).set('b', 'Pain');

    // [1] A annonce ce qu'il a.
    const step1 = await throughQr(encodeMessage(announce(phoneA)), 's1');

    // [2] B répond avec ce qui manque à A, et annonce le sien.
    const step2 = await throughQr(
      encodeMessage(respond(phoneB, decodeMessage(step1))),
      's2',
    );

    // [3] A applique, puis renvoie ce qui manque à B.
    const step3 = await throughQr(
      encodeMessage(completeAsInitiator(phoneA, decodeMessage(step2), ORIGIN)),
      's3',
    );

    // [4] B applique.
    completeAsResponder(phoneB, decodeMessage(step3), ORIGIN);

    expect([...courses(phoneA).values()].sort()).toEqual(['Lait', 'Pain']);
    expect([...courses(phoneB).values()].sort()).toEqual(['Lait', 'Pain']);
  });

  it('tient en une seule trame pour une différence de fin de courses', async () => {
    // Le cas réel : deux téléphones partis du même état, quelques cases
    // cochées de part et d'autre. C'est ce qui rend l'échange praticable.
    const shared = new Y.Doc();
    for (let i = 0; i < 60; i++) {
      courses(shared).set(`p${i}`, `Article numéro ${i}`);
    }

    const phoneA = new Y.Doc();
    Y.applyUpdate(phoneA, Y.encodeStateAsUpdate(shared));
    const phoneB = new Y.Doc();
    Y.applyUpdate(phoneB, Y.encodeStateAsUpdate(shared));

    courses(phoneB).set('p3', 'Article numéro 3 — pris');
    courses(phoneB).set('p17', 'Article numéro 17 — pris');

    const step1 = await encodeFrames(encodeMessage(announce(phoneA)), 's1');
    const reply = respond(
      phoneB,
      decodeMessage(await throughQr(encodeMessage(announce(phoneA)), 's1')),
    );
    const step2 = await encodeFrames(encodeMessage(reply), 's2');

    expect(step1.frames).toHaveLength(1);
    expect(step2.frames).toHaveLength(1);
  });

  it('refuse un code présenté à la mauvaise étape', () => {
    const doc = new Y.Doc();

    // Scanner le code de l'étape 1 alors qu'on attend celui de l'étape 2 doit
    // le dire, pas produire une fusion silencieusement fausse.
    expect(() => completeAsInitiator(doc, announce(doc), ORIGIN)).toThrow(
      'errors.nearby.wrongStep',
    );
    expect(() => respond(doc, { kind: 3, diff: new Uint8Array() })).toThrow(
      'errors.nearby.wrongStep',
    );
  });

  it('rejette une enveloppe tronquée', () => {
    const complete = encodeMessage(announce(new Y.Doc()));

    expect(() => decodeMessage(complete.subarray(0, 3))).toThrow(
      'errors.nearby.truncatedMessage',
    );
    expect(() => decodeMessage(new Uint8Array([99, 0, 0, 0, 0]))).toThrow(
      'errors.nearby.unknownMessage',
    );
  });

  it('marque les mises à jour reçues de l’origine fournie', async () => {
    const phoneA = new Y.Doc();
    const phoneB = new Y.Doc();
    courses(phoneB).set('b', 'Pain');

    const origins: unknown[] = [];
    phoneA.on('update', (_u: Uint8Array, origin: unknown) =>
      origins.push(origin),
    );

    const reply = respond(phoneB, announce(phoneA));
    completeAsInitiator(phoneA, reply, ORIGIN);

    expect(origins).toEqual([ORIGIN]);
  });
});
