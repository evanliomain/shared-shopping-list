import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { QrScanner, renderQrDataUrl, ScanError } from '@shopping-list/core/qr';
import {
  GithubConfigService,
  GithubSyncProvider,
  PairingPayload,
  parsePairingPayload,
} from '@shopping-list/core/sync-github';
import { SyncRegistry } from '@shopping-list/core/sync';
import { ScanOverlay } from '@shopping-list/ui';
import {
  ErrorText,
  PluralPipe,
  TranslatableError,
} from '@shopping-list/util/i18n';

type Mode = 'idle' | 'scanning' | 'showing-qr';

/**
 * Appairage de la synchronisation GitHub.
 *
 * Deux chemins, selon l'appareil :
 *
 *  - **le premier** saisit dépôt et jeton une fois, puis affiche un QR ;
 *  - **le second** scanne ce QR et n'a rien à taper.
 *
 * La saisie manuelle reste toujours accessible : `BarcodeDetector` n'existe pas
 * partout, et ouvrir une caméra qui ne détectera jamais rien serait pire que de
 * proposer le formulaire d'emblée.
 */
@Component({
  selector: 'sl-pairing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PluralPipe, RouterLink, ScanOverlay, TranslocoPipe],
  templateUrl: './pairing-page.html',
  styleUrl: './pairing-page.scss',
})
export class PairingPage {
  private readonly configService = inject(GithubConfigService);
  private readonly provider = inject(GithubSyncProvider);
  private readonly scanner = inject(QrScanner);
  private readonly registry = inject(SyncRegistry);
  private readonly location = inject(Location);
  private readonly errorText = inject(ErrorText);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private abort: AbortController | null = null;

  protected readonly mode = signal<Mode>('idle');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly qrDataUrl = signal<string | null>(null);

  protected readonly owner = signal('');
  protected readonly repo = signal('shopping-list-data');
  protected readonly token = signal('');

  protected readonly config = this.configService.config;
  protected readonly canScan = this.scanner.isSupported();

  protected readonly providerState = computed(() =>
    this.registry.states().find((s) => 'github' === s.id),
  );

  protected readonly syncPending = computed(
    () => this.providerState()?.pending ?? 0,
  );

  /**
   * Un seul emplacement d'alerte, quelle que soit l'origine de l'erreur.
   *
   * Un appairage refusé et une synchro tombée en `401` racontent la même
   * chose à l'utilisateur ; les afficher à deux endroits différents ferait
   * chercher la deuxième moitié du message.
   */
  protected readonly alert = computed(() => {
    const local = this.error();
    if (null !== local) {
      return local;
    }

    const state = this.providerState();
    return 'error' === state?.status ? (state.lastError ?? null) : null;
  });

  protected readonly canSubmit = computed(
    () =>
      '' !== this.owner().trim() &&
      '' !== this.repo().trim() &&
      '' !== this.token().trim() &&
      !this.busy(),
  );

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    await this.applyPairing({
      v: 1,
      owner: this.owner(),
      repo: this.repo(),
      token: this.token(),
    });
  }

  protected async startScan(): Promise<void> {
    this.error.set(null);
    this.mode.set('scanning');

    const video = this.videoRef()?.nativeElement;
    if (undefined === video) {
      // Ne jamais échouer en silence : sans message, le bouton donne
      // l'impression d'être mort.
      this.error.set(
        this.errorText.describe(
          new TranslatableError('errors.camera.previewFailed'),
        ),
      );
      this.mode.set('idle');
      return;
    }

    this.abort = new AbortController();

    try {
      const raw = await this.scanner.scanOnce(video, this.abort.signal);
      await this.applyPairing(parsePairingPayload(raw));
    } catch (error) {
      if (error instanceof ScanError && 'aborted' === error.reason) {
        return;
      }
      this.error.set(this.errorText.describe(error));
      this.mode.set('idle');
    }
  }

  protected stopScan(): void {
    this.abort?.abort();
    this.abort = null;
    this.mode.set('idle');
  }

  protected async showQr(): Promise<void> {
    const payload = this.configService.toPairingPayload();
    if (null === payload) {
      return;
    }

    this.qrDataUrl.set(await renderQrDataUrl(JSON.stringify(payload)));
    this.mode.set('showing-qr');
  }

  protected hideQr(): void {
    this.mode.set('idle');
    this.qrDataUrl.set(null);
  }

  protected async unpair(): Promise<void> {
    await this.configService.unpair();
    this.provider.disconnect();
    this.qrDataUrl.set(null);
    this.mode.set('idle');
  }

  protected close(): void {
    this.stopScan();
    this.location.back();
  }

  private async applyPairing(payload: PairingPayload): Promise<void> {
    this.busy.set(true);
    this.error.set(null);

    try {
      // `pair` vérifie l'accès avant d'enregistrer : découvrir un jeton
      // invalide au milieu des courses serait bien pire qu'une erreur ici.
      const config = await this.configService.pair(payload);
      this.provider.restart(config);
      this.mode.set('idle');
      this.token.set('');
    } catch (error) {
      this.error.set(this.errorText.describe(error));
    } finally {
      this.busy.set(false);
    }
  }
}
