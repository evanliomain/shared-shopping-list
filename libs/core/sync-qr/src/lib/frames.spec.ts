import {
  encodeFrames,
  FrameCollector,
  MAX_FRAMES,
  PayloadTooLargeError,
} from './frames';

const MAGIC = 'SL1';
const SESSION = 'session-1';

/**
 * Une trame forgée champ par champ.
 *
 * Ce que la caméra rend n'est pas toujours ce qui a été affiché : c'est le seul
 * moyen d'éprouver ce que le collecteur fait d'un en-tête abîmé.
 */
function trame(champs: {
  readonly magic?: string;
  readonly session?: string;
  readonly index?: number | string;
  readonly total?: number | string;
  readonly empreinte?: string;
  readonly données?: string;
}): string {
  return [
    champs.magic ?? MAGIC,
    champs.session ?? SESSION,
    champs.index ?? 0,
    champs.total ?? 1,
    champs.empreinte ?? 'zzz',
    champs.données ?? 'AAAA',
  ].join('|');
}

/** Incompressible : la charge occupe autant de trames que d'octets le permettent. */
function chargeDense(octets: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(octets));
}

describe('découpage en trames', () => {
  it('numérote les trames et leur donne l’empreinte de la charge entière', async () => {
    const { session, frames } = await encodeFrames(chargeDense(1600), SESSION);
    const champs = frames.map((frame) => frame.split('|'));

    expect(session).toBe(SESSION);
    expect(frames.length).toBeGreaterThan(1);
    expect(champs.map((c) => c.slice(0, 4))).toEqual(
      champs.map((_, index) => [
        MAGIC,
        SESSION,
        String(index),
        String(frames.length),
      ]),
    );
    // Une empreinte par trame aurait détecté une trame abîmée, pas un mélange
    // de deux échanges : elle porte sur la charge complète.
    expect(new Set(champs.map((c) => c[4])).size).toBe(1);
  });

  it('dit combien de trames auraient été nécessaires quand il refuse', async () => {
    const erreur = await encodeFrames(chargeDense(64_000), SESSION).then(
      () => null,
      (raison: unknown) => raison as PayloadTooLargeError,
    );

    expect(erreur).toBeInstanceOf(PayloadTooLargeError);
    expect(erreur?.frames).toBeGreaterThan(MAX_FRAMES);
    // Le nombre part jusqu'au message affiché : « refaites-le avec du réseau ».
    expect(erreur?.params).toEqual({ frames: erreur?.frames });
  });
});

describe('collecte des trames', () => {
  it('ignore un code annonçant une autre version du format', () => {
    const collecteur = new FrameCollector();

    expect(collecteur.accept(trame({ magic: 'SL2' }))).toBe(false);
    expect(collecteur.progress).toEqual({ received: 0, total: 0 });
  });

  it('ignore une trame dont l’en-tête n’est pas fait de nombres entiers', () => {
    const collecteur = new FrameCollector();

    expect(collecteur.accept(trame({ index: 'x' }))).toBe(false);
    expect(collecteur.accept(trame({ total: '2,5' }))).toBe(false);
    expect(collecteur.accept(trame({ index: '1.5', total: 3 }))).toBe(false);
    expect(collecteur.progress).toEqual({ received: 0, total: 0 });
  });

  it('ignore une trame dont l’index sort de la séquence annoncée', () => {
    const collecteur = new FrameCollector();

    expect(collecteur.accept(trame({ index: 3, total: 3 }))).toBe(false);
    expect(collecteur.accept(trame({ index: -1, total: 3 }))).toBe(false);
    expect(collecteur.accept(trame({ index: 0, total: 0 }))).toBe(false);
    expect(collecteur.progress).toEqual({ received: 0, total: 0 });
  });

  it('ignore une trame dont les données ne sont pas du base64url', () => {
    const collecteur = new FrameCollector();

    expect(collecteur.accept(trame({ données: '@@@@' }))).toBe(false);
    expect(collecteur.progress).toEqual({ received: 0, total: 0 });
  });

  it('ne compte qu’une fois une trame relue à chaque tour de boucle', async () => {
    const { frames } = await encodeFrames(chargeDense(1600), SESSION);
    const collecteur = new FrameCollector();

    // Les trames défilent en boucle devant la caméra : la même est lue des
    // dizaines de fois avant que la suivante ne s'affiche.
    for (let tour = 0; tour < 5; tour++) {
      expect(collecteur.accept(frames[0])).toBe(true);
    }

    expect(collecteur.progress).toEqual({ received: 1, total: frames.length });
  });

  it('ne rend rien tant qu’il manque une trame', async () => {
    const { frames } = await encodeFrames(chargeDense(1600), SESSION);
    const collecteur = new FrameCollector();
    collecteur.accept(frames[0]);

    expect(collecteur.complete).toBe(false);
    expect(await collecteur.payload()).toBeNull();
  });

  it('ne rend rien quand deux trames se contredisent sur le total', async () => {
    const collecteur = new FrameCollector();
    collecteur.accept(trame({ index: 3, total: 4 }));
    collecteur.accept(trame({ index: 0, total: 2 }));

    // Le compte tombe juste — deux trames pour un total de deux — alors que la
    // place 1 est restée vide. Recoller ces octets donnerait une charge fausse.
    expect(collecteur.complete).toBe(true);
    expect(await collecteur.payload()).toBeNull();
  });

  it('oublie tout ce qu’il a lu quand on le remet à zéro', async () => {
    const { frames } = await encodeFrames(chargeDense(1600), SESSION);
    const collecteur = new FrameCollector();
    collecteur.accept(frames[0]);

    collecteur.reset();

    expect(collecteur.progress).toEqual({ received: 0, total: 0 });
    expect(collecteur.complete).toBe(false);
    expect(await collecteur.payload()).toBeNull();
  });

  it('reprend l’échange en cours après un échec de réassemblage', async () => {
    const charge = chargeDense(1400);
    const { frames } = await encodeFrames(charge, SESSION);
    const collecteur = new FrameCollector();
    for (const frame of frames) {
      collecteur.accept(frame);
    }
    const abîmée = frames[0].split('|');
    abîmée[5] = abîmée[5].slice(0, -4) + 'AAAA';
    collecteur.accept(abîmée.join('|'));

    await expect(collecteur.payload()).rejects.toThrow(
      'errors.nearby.corrupted',
    );

    // Après le rejet, l'écran d'en face continue de défiler : les trames
    // suivantes doivent repartir d'un collecteur vide, pas s'ajouter aux
    // anciennes.
    expect(collecteur.progress).toEqual({ received: 0, total: 0 });
    for (const frame of frames) {
      collecteur.accept(frame);
    }

    expect(await collecteur.payload()).toEqual(charge);
  });
});
