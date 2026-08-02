import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { translateSignal, TranslocoPipe } from '@jsverse/transloco';
import {
  countTouchedEntities,
  newId,
  YDocService,
} from '@shopping-list/core/crdt';
import { QrScanner, renderQrDataUrl, ScanError } from '@shopping-list/core/qr';
import {
  announce,
  completeAsInitiator,
  completeAsResponder,
  decodeMessage,
  encodeFrames,
  encodeMessage,
  FrameCollector,
  respond,
} from '@shopping-list/core/sync-qr';
import { ScanOverlay } from '@shopping-list/ui';
import {
  ErrorText,
  PluralPipe,
  TranslatableError,
} from '@shopping-list/util/i18n';

/** Marque les mises à jour venues d'un échange de proximité. */
const NEARBY_ORIGIN = Symbol('sl.nearby');

/** Cadence de défilement des trames. Assez lent pour être lu, assez vif pour boucler. */
const FRAME_INTERVAL_MS = 200;

type Role = 'initiator' | 'responder';

type Step =
  | 'choose-role'
  /** On affiche des trames et on attend que l'autre les scanne. */
  | 'showing'
  /** On lit la caméra. */
  | 'scanning'
  | 'done'
  | 'failed';

/**
 * Échange de proximité par QR code, sans aucun réseau.
 *
 * Trois codes, deux scans, et les deux téléphones ont convergé. Le protocole
 * n'échange que des **différences** : c'est ce qui rend la chose praticable.
 * Un catalogue complet ferait une quinzaine d'écrans à scanner ; une fin de
 * courses en fait un seul.
 *
 * L'un des deux appuie sur « Montrer », l'autre sur « Scanner ». Ensuite
 * l'application dit à chacun quoi faire, étape par étape.
 */
@Component({
  selector: 'sl-nearby-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PluralPipe, ScanOverlay, TranslocoPipe],
  templateUrl: './nearby-page.html',
  styleUrl: './nearby-page.scss',
})
export class NearbyPage {
  private readonly yDoc = inject(YDocService);
  private readonly scanner = inject(QrScanner);
  private readonly location = inject(Location);
  private readonly errorText = inject(ErrorText);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  private abort: AbortController | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private collector = new FrameCollector();

  protected readonly step = signal<Step>('choose-role');
  protected readonly role = signal<Role | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Trames à afficher, et laquelle est visible. */
  protected readonly frames = signal<readonly string[]>([]);
  protected readonly frameIndex = signal(0);
  protected readonly frameImage = signal<string | null>(null);

  protected readonly frameCount = computed(() => this.frames().length);
  protected readonly framePosition = computed(() => this.frameIndex() + 1);

  protected readonly scanProgress = signal({ received: 0, total: 0 });

  protected readonly scanPercent = computed(() => {
    const { received, total } = this.scanProgress();
    return 0 === total ? 0 : (received / total) * 100;
  });

  /**
   * Entités arrivées de l'autre téléphone.
   *
   * L'écran final l'annonce : sans ce chiffre, deux minutes de manipulation se
   * terminent sur « c'est bon » sans qu'on sache si quoi que ce soit a
   * circulé.
   */
  protected readonly received = signal(0);

  protected readonly canScan = this.scanner.isSupported();

  /** Les quatre temps de l'assistant : rôle, montrer, scanner, terminé. */
  protected readonly segments = [1, 2, 3, 4] as const;

  private readonly stepIndex = computed(() => {
    switch (this.step()) {
      case 'choose-role':
        return 1;
      case 'showing':
        return 2;
      case 'scanning':
      case 'failed':
        return 3;
      default:
        return 4;
    }
  });

  protected readonly gaugeLabel = translateSignal(
    'nearby.stepProgress',
    computed(() => ({
      step: this.stepIndex(),
      total: this.segments.length,
    })),
  );

  protected segmentState(segment: number): 'on' | 'off' | 'error' {
    if (segment === this.stepIndex()) {
      return 'failed' === this.step() ? 'error' : 'on';
    }
    return segment < this.stepIndex() ? 'on' : 'off';
  }

  /** Vrai une fois qu'un premier différentiel a été appliqué. */
  private readonly exchanged = signal(false);

  /**
   * Instruction affichée, dépendante du rôle et de l'étape.
   *
   * Elle suit `exchanged`, et surtout pas l'index de trame : un message qui
   * ne tient pas en un seul écran en fait défiler plusieurs, et annoncer « ce
   * dernier code » à la deuxième trame du premier message ferait ranger les
   * téléphones au milieu de l'échange.
   */
  private readonly instructionKey = computed(() => {
    if ('initiator' === this.role()) {
      return 'showing' === this.step()
        ? this.exchanged()
          ? 'nearby.showLast'
          : 'nearby.showFirst'
        : 'nearby.scan';
    }

    return 'scanning' === this.step() ? 'nearby.scan' : 'nearby.showThenWait';
  });

  protected readonly instruction = translateSignal(this.instructionKey);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cleanup());
  }

  protected async startAsInitiator(): Promise<void> {
    this.role.set('initiator');
    // Étape 1 : « voici ce que j'ai ».
    await this.show(encodeMessage(announce(this.yDoc.doc)));
  }

  protected async startAsResponder(): Promise<void> {
    this.role.set('responder');
    await this.scan();
  }

  /** L'utilisateur signale que l'autre a fini de scanner. */
  protected async afterShown(): Promise<void> {
    if ('initiator' === this.role() && !this.exchanged()) {
      await this.scan();
      return;
    }

    if ('responder' === this.role()) {
      await this.scan();
      return;
    }

    // Initiateur, dernier code affiché : plus rien à faire.
    this.finish();
  }

  private async show(payload: Uint8Array): Promise<void> {
    this.stopTicker();

    try {
      const { frames } = await encodeFrames(payload, newId());
      this.frames.set(frames);
      this.frameIndex.set(0);
      this.step.set('showing');
      await this.paint();

      if (1 < frames.length) {
        this.ticker = setInterval(() => void this.advance(), FRAME_INTERVAL_MS);
      }
    } catch (error) {
      this.fail(error);
    }
  }

  private async advance(): Promise<void> {
    this.frameIndex.update((index) => (index + 1) % this.frames().length);
    await this.paint();
  }

  private async paint(): Promise<void> {
    const frame = this.frames()[this.frameIndex()];
    if (undefined !== frame) {
      this.frameImage.set(await renderQrDataUrl(frame));
    }
  }

  private async scan(): Promise<void> {
    this.stopTicker();
    this.step.set('scanning');
    this.error.set(null);
    this.collector = new FrameCollector();
    this.scanProgress.set({ received: 0, total: 0 });

    const video = this.videoRef()?.nativeElement;
    if (undefined === video) {
      this.fail(new TranslatableError('errors.camera.unavailable'));
      return;
    }

    this.abort = new AbortController();

    try {
      // La caméra reste ouverte jusqu'à l'assemblage complet : les trames
      // défilent en boucle en face, donc ce qui a été manqué revient au tour
      // suivant — à condition de ne pas passer ce tour-là à rouvrir la caméra.
      await this.scanner.scanMany(video, this.abort.signal, (raw) => {
        this.collector.accept(raw);
        this.scanProgress.set(this.collector.progress);
        return this.collector.complete;
      });

      const payload = await this.collector.payload();
      if (null === payload) {
        this.fail(new TranslatableError('errors.nearby.incomplete'));
        return;
      }

      await this.consume(payload);
    } catch (error) {
      if (error instanceof ScanError && 'aborted' === error.reason) {
        return;
      }
      this.fail(error);
    }
  }

  private async consume(payload: Uint8Array): Promise<void> {
    const message = decodeMessage(payload);

    try {
      if ('responder' === this.role()) {
        if (!this.exchanged()) {
          // Étape 2 : on répond avec ce qui manque en face.
          this.exchanged.set(true);
          await this.show(encodeMessage(respond(this.yDoc.doc, message)));
          return;
        }

        // Étape 4 : on applique le dernier différentiel.
        this.applyCounting(() =>
          completeAsResponder(this.yDoc.doc, message, NEARBY_ORIGIN),
        );
        this.finish();
        return;
      }

      // Initiateur, étape 3 : on applique, puis on renvoie ce qui manque.
      this.exchanged.set(true);
      const reply = this.applyCounting(() =>
        completeAsInitiator(this.yDoc.doc, message, NEARBY_ORIGIN),
      );
      await this.show(encodeMessage(reply));
    } catch (error) {
      this.fail(error);
    }
  }

  /**
   * Applique un différentiel en comptant ce qu'il apporte.
   *
   * On ne compte que ce qu'on **reçoit** : ce qu'on envoie n'est mesurable
   * que par l'autre appareil, qui l'annoncera de son côté. Un delta Yjs ne
   * porte que les opérations manquantes, il n'y a pas moyen d'en déduire
   * combien d'entités il touchera chez le destinataire.
   */
  private applyCounting<T>(apply: () => T): T {
    let result!: T;

    const touched = countTouchedEntities(this.yDoc.doc, () => {
      result = apply();
    });

    this.received.update((count) => count + touched);
    return result;
  }

  private finish(): void {
    this.cleanup();
    this.step.set('done');
  }

  private fail(error: unknown): void {
    this.cleanup();
    this.error.set(this.errorText.describe(error));
    this.step.set('failed');
  }

  protected restart(): void {
    this.cleanup();
    this.exchanged.set(false);
    this.error.set(null);
    this.role.set(null);
    this.frames.set([]);
    this.frameImage.set(null);
    this.received.set(0);
    this.step.set('choose-role');
  }

  protected close(): void {
    this.cleanup();
    this.location.back();
  }

  private cleanup(): void {
    this.stopTicker();
    this.abort?.abort();
    this.abort = null;
  }

  private stopTicker(): void {
    if (null !== this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}
