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

    // Plus rien à lire : on reste ouverte, comme une caméra qui ne trouve
    // rien, plutôt que de résoudre sur un assemblage incomplet.
    return new Promise<void>(() => undefined);
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
 * Un téléphone déjà vécu.
 *
 * Yjs tire un `clientID` neuf à chaque chargement de l'application : le
 * vecteur d'état grossit d'environ six octets par ouverture, indéfiniment.
 * C'est ce qui faisait passer le tout premier code de l'échange de quelques
 * modules à une centaine — jusqu'à devenir illisible en silence.
 */
function agedPhone(sessions: number): Y.Doc {
  const doc = otherPhone(['Lait']);

  for (let i = 0; i < sessions; i++) {
    const session = new Y.Doc();
    Y.applyUpdate(session, Y.encodeStateAsUpdate(doc));
    createProduct(
      session,
      {
        label: `Article numéro ${i}`,
        description: '',
        defaultQty: '1',
        category: 'épicerie',
        imageRef: 'emoji:🥕',
      },
      1_700_000_000_000 + i,
    );
    Y.applyUpdate(
      doc,
      Y.encodeStateAsUpdate(session, Y.encodeStateVector(doc)),
    );
  }

  return doc;
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
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(
      'Trois codes, deux scans',
    );
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
    // La régression : un vecteur d'état de document vécu ne tient pas en un
    // seul QR. Chaque trame rouvrait la caméra, ce qui laissait passer la
    // boucle d'en face et l'assemblage n'aboutissait jamais.
    const { scanner } = setup();
    const fixture = await render();
    const theirs = agedPhone(80);

    const { frames } = await encodeFrames(
      encodeMessage(announce(theirs)),
      's1',
    );
    expect(frames.length).toBeGreaterThan(1);

    // On rate la première trame ; elle revient au tour suivant.
    scanner.show([...frames.slice(1), ...frames]);

    button(fixture, "L'autre commence")?.click();
    await settle(fixture);

    expect(scanner.sessions).toBe(1);
    expect(fixture.nativeElement.textContent).toContain(
      "Faites scanner ce code par l'autre téléphone, puis attendez le sien.",
    );
  });

  it('n’annonce « ce dernier code » qu’une fois le différentiel appliqué', async () => {
    // Sur plusieurs écrans, l'instruction suivait l'index de trame : dès la
    // deuxième, elle annonçait la fin de l'échange alors qu'il commençait.
    const { scanner } = setup();
    const fixture = await render();
    const mine = TestBed.inject(YDocService).doc;
    const theirs = agedPhone(80);

    // Les deux partent du même état ; l'autre a fait trois courses de plus.
    Y.applyUpdate(mine, Y.encodeStateAsUpdate(theirs));
    addProducts(theirs, ['Lait', 'Pain', 'Café']);

    button(fixture, 'Je commence')?.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      "Faites scanner ce code par l'autre téléphone.",
    );

    // [2] l'autre répond ; on applique et on affiche le dernier code.
    const reply = respond(theirs, announce(mine));
    const { frames } = await encodeFrames(encodeMessage(reply), 's2');
    expect(frames.length).toBeGreaterThan(1);

    scanner.show(frames);
    button(fixture, "C'est scanné")?.click();
    await settle(fixture);

    expect(labelsOf(mine)).toHaveLength(84);
    expect(fixture.nativeElement.textContent).toContain(
      "Faites scanner ce dernier code. L'échange sera terminé.",
    );

    button(fixture, "C'est scanné")?.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'Les deux listes sont à jour.',
    );
  });
});
