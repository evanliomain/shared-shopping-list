import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  addItem,
  createProduct,
  ensureList,
  YDocService,
} from '@shopping-list/core/crdt';
import { QrScanner, ScanError } from '@shopping-list/core/qr';
import {
  announce,
  completeAsInitiator,
  encodeFrames,
  encodeMessage,
  respond,
} from '@shopping-list/core/sync-qr';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';
import * as Y from 'yjs';

import { NearbyPage } from './nearby-page';

const LIST = 'maison';

/**
 * Caméra simulée.
 *
 * Elle rend les codes que « l'autre téléphone » fait défiler, et compte les
 * **ouvertures de caméra** : c'est ce compteur qui garde le correctif en
 * place. Rouvrir la caméra entre deux trames coûtait près d'une seconde,
 * pendant laquelle la boucle d'en face continuait de tourner — un message de
 * plusieurs écrans n'était alors jamais assemblé.
 */
class FakeScanner {
  supported = true;

  /** Une par étape de l'échange, jamais une par trame. */
  sessions = 0;

  /** Ce que la caméra oppose à l'ouverture : refus, panne, ou rien. */
  failWith: Error | null = null;

  /**
   * Rend la main dès la file épuisée, au lieu de rester ouverte.
   *
   * C'est une caméra qui s'arrête avant que l'assemblage soit complet — ce que
   * voit l'utilisateur quand l'autre téléphone est rangé en cours d'échange.
   */
  stopsEarly = false;

  private queue: string[] = [];

  isSupported(): boolean {
    return this.supported;
  }

  /** Ce que l'autre téléphone affiche, et qui défile en boucle. */
  show(frames: readonly string[], loops = 1): void {
    for (let i = 0; i < loops; i++) {
      this.queue.push(...frames);
    }
  }

  async scanMany(
    _video: HTMLVideoElement,
    signal: AbortSignal,
    accept: (raw: string) => boolean,
  ): Promise<void> {
    this.sessions++;

    if (null !== this.failWith) {
      throw this.failWith;
    }

    const codes = this.queue;
    this.queue = [];

    for (const raw of codes) {
      if (signal.aborted) {
        throw new ScanError('aborted', 'errors.scan.aborted');
      }
      if (accept(raw)) {
        return;
      }
    }

    if (this.stopsEarly) {
      return;
    }

    // Plus rien à lire : on reste ouverte, comme une caméra qui ne trouve
    // rien, plutôt que de résoudre sur un assemblage incomplet. Seule
    // l'annulation la referme, et elle le fait comme le vrai lecteur : en
    // rejetant.
    return new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () =>
        reject(new ScanError('aborted', 'errors.scan.aborted')),
      );
    });
  }

  async scanOnce(): Promise<string> {
    return new Promise<string>(() => undefined);
  }
}

function setup(supported = true) {
  const scanner = new FakeScanner();
  scanner.supported = supported;

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      provideTestI18n(),
      { provide: QrScanner, useValue: scanner },
    ],
  });

  return { scanner };
}

async function render() {
  const fixture = TestBed.createComponent(NearbyPage);
  await fixture.whenStable();
  return fixture;
}

/**
 * Laisse retomber la chaîne asynchrone d'une étape.
 *
 * Un scan enchaîne décompression, application du delta, ré-encodage et rendu
 * du QR suivant — autant de promesses qu'Angular ne suit pas, et que
 * `whenStable` seul ne suffit pas à attendre.
 */
async function settle(fixture: { whenStable: () => Promise<unknown> }) {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }
}

function button(
  fixture: { nativeElement: HTMLElement },
  label: string,
): HTMLButtonElement | undefined {
  return [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(label),
  );
}

/** Le message d'erreur tel que l'écran le donne à lire, ou rien. */
function alertText(fixture: { nativeElement: HTMLElement }): string {
  return (
    fixture.nativeElement.querySelector('[role="alert"]')?.textContent ?? ''
  );
}

/** Les quatre segments de la jauge d'étape, dans l'ordre. */
function gauge(fixture: { nativeElement: HTMLElement }): (string | null)[] {
  return [...fixture.nativeElement.querySelectorAll('header .gauge span')].map(
    (segment) => segment.getAttribute('data-state'),
  );
}

/** Des courses ajoutées sur un téléphone, produit et ligne de liste. */
function addProducts(doc: Y.Doc, labels: readonly string[]): void {
  for (const label of labels) {
    const productId = createProduct(
      doc,
      {
        label,
        description: '',
        defaultQty: '1',
        category: 'épicerie',
        imageRef: 'emoji:🥕',
      },
      1_700_000_000_000,
    );
    addItem(doc, {
      listId: LIST,
      productId,
      addedBy: 'Tél A',
      deviceId: 'a',
      now: 1_700_000_000_000,
    });
  }
}

/** Un téléphone « d'en face » : un vrai Y.Doc, avec de vraies courses. */
function otherPhone(labels: readonly string[]): Y.Doc {
  const doc = new Y.Doc();
  ensureList(doc, LIST, 'Maison', 1_700_000_000_000);
  addProducts(doc, labels);
  return doc;
}

/**
 * Un libellé que la compression ne sait pas réduire.
 *
 * Le dépassement se juge au **volume** : soixante « Article n » fondraient à
 * quelques centaines d'octets et tiendraient sur un seul écran.
 */
function noise(seed: number): string {
  let value = seed | 0;
  let text = '';
  while (text.length < 80) {
    value = (Math.imul(value, 1_103_515_245) + 12_345) >>> 0;
    text += value.toString(36);
  }
  return text;
}

function labelsOf(doc: Y.Doc): string[] {
  return [...doc.getMap('catalog').values()]
    .map((node) => (node as Y.Map<unknown>).get('label') as string)
    .sort();
}

describe('NearbyPage', () => {
  it('explique le principe avant de demander un rôle', async () => {
    setup();
    const fixture = await render();

    expect(fixture.nativeElement.textContent).toContain(
      'Trois codes, deux scans',
    );
    expect(button(fixture, 'Je commence')).toBeDefined();
    expect(button(fixture, "L'autre commence")).toBeDefined();
    expect(gauge(fixture)).toEqual(['on', 'off', 'off', 'off']);
  });

  it('propose quand même de montrer un code sans caméra', async () => {
    // Celui qui affiche n'a besoin d'aucune caméra : l'échange reste possible
    // même si un des deux navigateurs ne sait pas lire.
    setup(false);
    const fixture = await render();

    expect(button(fixture, 'Je commence')).toBeDefined();
    expect(button(fixture, "L'autre commence")).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain(
      'ne sait pas lire les QR codes',
    );
  });

  it('bascule en lecture caméra pour celui qui répond', async () => {
    setup();
    const fixture = await render();

    button(fixture, "L'autre commence")?.click();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      "Scannez le code affiché sur l'autre téléphone",
    );
  });

  it('permet de revenir au choix du rôle après annulation', async () => {
    setup();
    const fixture = await render();

    button(fixture, "L'autre commence")?.click();
    await fixture.whenStable();

    button(fixture, 'Annuler')?.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'Trois codes, deux scans',
    );
    // Renoncer n'est pas un échec : la lecture interrompue que rejette le
    // lecteur ne doit pas ressortir en message d'erreur.
    expect(alertText(fixture)).toBe('');
  });

  it('applique ce que l’autre téléphone a modifié hors ligne', async () => {
    // Le scénario réel : l'autre a fait ses courses sans réseau, celui-ci a
    // l'application ouverte, et c'est lui qui scanne.
    const { scanner } = setup();
    const fixture = await render();
    const mine = TestBed.inject(YDocService).doc;
    const theirs = otherPhone(['Lait', 'Pain', 'Café']);

    // [1] l'autre annonce ce qu'il a.
    scanner.show(
      (await encodeFrames(encodeMessage(announce(theirs)), 's1')).frames,
    );
    button(fixture, "L'autre commence")?.click();
    await settle(fixture);

    // On affiche notre réponse : c'est ce que l'autre va scanner.
    expect(fixture.nativeElement.textContent).toContain(
      "Faites scanner ce code par l'autre téléphone, puis attendez le sien.",
    );

    // [3] l'autre a appliqué, et renvoie ce qui nous manque.
    const back = completeAsInitiator(
      theirs,
      respond(mine, announce(theirs)),
      'test',
    );
    scanner.show((await encodeFrames(encodeMessage(back), 's3')).frames);
    button(fixture, "C'est scanné")?.click();
    await settle(fixture);

    expect(labelsOf(mine)).toEqual(['Café', 'Lait', 'Pain']);
    expect(fixture.nativeElement.textContent).toContain(
      'Les deux listes sont à jour.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      '3 modifications reçues',
    );
  });

  it('assemble un message de plusieurs écrans sans rouvrir la caméra', async () => {
    // Un premier échange avec un catalogue déjà fourni ne tient pas en un seul
    // code. Chaque trame rouvrait la caméra, ce qui laissait passer la boucle
    // d'en face et l'assemblage n'aboutissait jamais.
    const { scanner } = setup();
    const fixture = await render();
    const mine = TestBed.inject(YDocService).doc;
    const theirs = otherPhone(
      Array.from({ length: 40 }, (_, i) => `Article numéro ${i}`),
    );

    button(fixture, 'Je commence')?.click();
    await settle(fixture);

    const { frames } = await encodeFrames(
      encodeMessage(respond(theirs, announce(mine))),
      's2',
    );
    expect(frames.length).toBeGreaterThan(1);

    // On rate la première trame ; elle revient au tour suivant.
    scanner.show([...frames.slice(1), ...frames]);

    button(fixture, "C'est scanné")?.click();
    await settle(fixture);

    expect(scanner.sessions).toBe(1);
    expect(labelsOf(mine)).toHaveLength(40);
  });

  it('fait défiler les écrans d’un message qui n’en tient pas un seul', async () => {
    // Le défilement ne fait plus que changer d'image — tout est rendu à
    // l'avance. Il doit continuer de tourner.
    const { scanner } = setup();
    const fixture = await render();
    const mine = TestBed.inject(YDocService).doc;

    // Cette liste-ci est fournie, l'autre téléphone part de rien : ce qu'on
    // doit lui montrer ne tient pas sur un seul écran.
    Y.applyUpdate(
      mine,
      Y.encodeStateAsUpdate(
        otherPhone(Array.from({ length: 40 }, (_, i) => `Article numéro ${i}`)),
      ),
    );

    scanner.show(
      (await encodeFrames(encodeMessage(announce(new Y.Doc())), 's1')).frames,
    );
    button(fixture, "L'autre commence")?.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Écran 1 sur');

    await new Promise((resolve) => setTimeout(resolve, 800));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Écran 2 sur');
  });

  it('n’annonce « ce dernier code » qu’une fois le différentiel appliqué', async () => {
    // Sur plusieurs écrans, l'instruction suivait l'index de trame : dès la
    // deuxième, elle annonçait la fin de l'échange alors qu'il commençait.
    const { scanner } = setup();
    const fixture = await render();
    const mine = TestBed.inject(YDocService).doc;
    const theirs = otherPhone(['Lait', 'Pain', 'Café']);

    button(fixture, 'Je commence')?.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      "Faites scanner ce code par l'autre téléphone.",
    );

    // [2] l'autre répond ; on applique et on affiche le dernier code.
    const reply = respond(theirs, announce(mine));
    scanner.show((await encodeFrames(encodeMessage(reply), 's2')).frames);
    button(fixture, "C'est scanné")?.click();
    await settle(fixture);

    expect(labelsOf(mine)).toEqual(['Café', 'Lait', 'Pain']);
    expect(fixture.nativeElement.textContent).toContain(
      "Faites scanner ce dernier code. L'échange sera terminé.",
    );

    button(fixture, "C'est scanné")?.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'Les deux listes sont à jour.',
    );
    expect(gauge(fixture)).toEqual(['on', 'on', 'on', 'on']);
  });

  it('nomme le refus de la caméra au lieu d’attendre en silence', async () => {
    const { scanner } = setup();
    scanner.failWith = new ScanError(
      'permission-denied',
      'errors.camera.denied',
    );
    const fixture = await render();

    button(fixture, "L'autre commence")?.click();
    await settle(fixture);

    expect(alertText(fixture)).toContain("L'accès à la caméra a été refusé");
    // L'échange s'arrête au deuxième temps : la jauge doit le montrer.
    expect(gauge(fixture)).toEqual(['on', 'on', 'error', 'off']);
  });

  it('rapporte tel quel un incident que personne n’a nommé', async () => {
    // Une panne de la plateforme n'a pas de clé de traduction. Afficher son
    // message brut reste préférable à un écran qui ne dit rien.
    const { scanner } = setup();
    scanner.failWith = new Error('Le flux vidéo a été coupé');
    const fixture = await render();

    button(fixture, "L'autre commence")?.click();
    await settle(fixture);

    expect(alertText(fixture)).toContain('Le flux vidéo a été coupé');
  });

  it('refuse un code qui ne correspond pas à l’étape en cours', async () => {
    // Les deux ont appuyé sur « Je commence » : ce qui est en face est une
    // annonce d'ouverture, pas la réponse attendue.
    const { scanner } = setup();
    const fixture = await render();
    const theirs = otherPhone(['Lait']);

    button(fixture, 'Je commence')?.click();
    await settle(fixture);

    scanner.show(
      (await encodeFrames(encodeMessage(announce(theirs)), 's1')).frames,
    );
    button(fixture, "C'est scanné")?.click();
    await settle(fixture);

    expect(alertText(fixture)).toContain(
      "Ce code ne correspond pas à cette étape de l'échange.",
    );
  });

  it('renonce quand ce qu’il faudrait montrer ne tient pas en douze écrans', async () => {
    // Un premier échange avec un catalogue déjà fourni demanderait une minute
    // de scan à bout de bras : autant le dire.
    const { scanner } = setup();
    const fixture = await render();
    const mine = TestBed.inject(YDocService).doc;

    Y.applyUpdate(
      mine,
      Y.encodeStateAsUpdate(
        otherPhone(Array.from({ length: 60 }, (_, index) => noise(index))),
      ),
    );

    scanner.show(
      (await encodeFrames(encodeMessage(announce(new Y.Doc())), 's1')).frames,
    );
    button(fixture, "L'autre commence")?.click();
    await settle(fixture);

    expect(alertText(fixture)).toContain(
      'Trop de données pour un échange par QR',
    );
  });

  it('promet que rien n’a bougé quand un écran n’a pas été lu', async () => {
    const { scanner } = setup();
    scanner.stopsEarly = true;
    const fixture = await render();
    const mine = TestBed.inject(YDocService).doc;
    const theirs = otherPhone(
      Array.from({ length: 40 }, (_, index) => `Article numéro ${index}`),
    );

    button(fixture, 'Je commence')?.click();
    await settle(fixture);

    const { frames } = await encodeFrames(
      encodeMessage(respond(theirs, announce(mine))),
      's2',
    );
    expect(frames.length).toBeGreaterThan(1);

    // Tout sauf le dernier écran : un différentiel tronqué ne s'applique pas
    // à moitié, il ne s'applique pas du tout.
    scanner.show(frames.slice(0, -1));

    button(fixture, "C'est scanné")?.click();
    await settle(fixture);

    expect(alertText(fixture)).toContain("L'échange s'est interrompu");
    expect(labelsOf(mine)).toEqual([]);
  });

  it('permet de tout reprendre depuis le choix du rôle après un échec', async () => {
    const { scanner } = setup();
    scanner.stopsEarly = true;
    const fixture = await render();

    button(fixture, "L'autre commence")?.click();
    await settle(fixture);
    expect(alertText(fixture)).not.toBe('');

    button(fixture, 'Recommencer')?.click();
    await settle(fixture);

    expect(alertText(fixture)).toBe('');
    expect(fixture.nativeElement.textContent).toContain(
      'Trois codes, deux scans',
    );
    expect(gauge(fixture)).toEqual(['on', 'off', 'off', 'off']);
  });

  it('revient à l’écran précédent quand on quitte l’échange', async () => {
    setup();
    const fixture = await render();
    const back = vi.spyOn(TestBed.inject(Location), 'back');

    button(fixture, 'Retour')?.click();
    await fixture.whenStable();

    expect(back).toHaveBeenCalledTimes(1);
  });
});
