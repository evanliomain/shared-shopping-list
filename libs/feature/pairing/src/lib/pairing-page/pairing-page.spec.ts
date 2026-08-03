import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QrScanner, ScanError } from '@shopping-list/core/qr';
import {
  SYNC_PROVIDERS,
  SyncProvider,
  SyncStatus,
} from '@shopping-list/core/sync';
import {
  GithubConfig,
  GithubConfigService,
  GithubSyncProvider,
} from '@shopping-list/core/sync-github';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { PairingPage } from './pairing-page';

const CONFIG: GithubConfig = {
  owner: 'evanliomain',
  repo: 'shopping-list-data',
  token: 'github_pat_xxx',
  branch: 'main',
  path: 'state.bin',
};

/** Ce que le premier appareil affiche, et que le second lit. */
const QR_APPAIRAGE = JSON.stringify({
  v: 1,
  owner: 'evanliomain',
  repo: 'shopping-list-data',
  token: 'github_pat_xxx',
});

class FakeConfigService {
  readonly config = signal<GithubConfig | null>(null);
  readonly loaded = signal(true);
  pairCalls: unknown[] = [];
  failWith: Error | null = null;

  async pair(payload: unknown): Promise<GithubConfig> {
    this.pairCalls.push(payload);
    if (null !== this.failWith) {
      throw this.failWith;
    }
    this.config.set(CONFIG);
    return CONFIG;
  }

  async unpair(): Promise<void> {
    this.config.set(null);
  }

  toPairingPayload() {
    const config = this.config();
    return null === config
      ? null
      : ({ v: 1, ...config } as unknown as Record<string, unknown>);
  }
}

class FakeProvider {
  restarted: GithubConfig[] = [];
  disconnected = 0;
  restart(config: GithubConfig): void {
    this.restarted.push(config);
  }
  disconnect(): void {
    this.disconnected++;
  }
}

class FakeScanner {
  supported = false;
  /** Élément réellement reçu : sert à prouver que la vue était rendue. */
  received: HTMLVideoElement | null = null;
  /** La caméra a-t-elle bien été éteinte ? */
  aborted = false;

  private pending: {
    resolve: (raw: string) => void;
    reject: (error: unknown) => void;
  } | null = null;

  isSupported(): boolean {
    return this.supported;
  }

  async scanOnce(
    video: HTMLVideoElement,
    signal: AbortSignal,
  ): Promise<string> {
    this.received = video;

    // Comme la vraie caméra : rien ne se résout tant qu'aucun code n'est lu, et
    // l'annulation de l'appelant rejette avec le motif « aborted ».
    return new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject };
      signal.addEventListener('abort', () => {
        this.aborted = true;
        reject(new ScanError('aborted', 'errors.scan.aborted'));
      });
    });
  }

  /** La caméra vient de lire un code. */
  read(raw: string): void {
    this.pending?.resolve(raw);
  }

  /** La caméra renonce : permission refusée, appareil incapable… */
  fail(error: unknown): void {
    this.pending?.reject(error);
  }
}

/** Un canal GitHub enregistré, dans l'état où l'écran doit le montrer. */
function githubChannel(
  status: SyncStatus,
  lastError: string | null = null,
  pending = 0,
): SyncProvider {
  return {
    id: 'github',
    labelKey: 'sync.providers.github',
    status: signal(status).asReadonly(),
    lastError: signal(lastError).asReadonly(),
    pending: signal(pending).asReadonly(),
    connect: () => undefined,
    disconnect: () => undefined,
  };
}

function setup(channel?: SyncProvider) {
  const configService = new FakeConfigService();
  const provider = new FakeProvider();
  const scanner = new FakeScanner();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      provideTestI18n(),
      { provide: GithubConfigService, useValue: configService },
      { provide: GithubSyncProvider, useValue: provider },
      { provide: QrScanner, useValue: scanner },
      // Sans canal : le registre gère l'absence, et la page n'a besoin que de
      // lire un état vide.
      ...(undefined === channel
        ? []
        : [{ provide: SYNC_PROVIDERS, multi: true, useValue: channel }]),
    ],
  });

  return { configService, provider, scanner };
}

async function render() {
  const fixture = TestBed.createComponent(PairingPage);
  await fixture.whenStable();
  return fixture;
}

/**
 * Laisse retomber la chaîne asynchrone d'un appairage.
 *
 * Une lecture enchaîne l'analyse du code, la vérification de l'accès et le
 * redémarrage du provider — autant de promesses qu'Angular ne suit pas, et que
 * `whenStable` seul ne suffit pas à attendre.
 */
async function settle(fixture: { whenStable: () => Promise<unknown> }) {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }
}

function fill(
  fixture: { nativeElement: HTMLElement },
  index: number,
  value: string,
) {
  const input = fixture.nativeElement.querySelectorAll('input')[index];
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function clickButton(
  fixture: { nativeElement: HTMLElement },
  label: string,
): void {
  const button = [...fixture.nativeElement.querySelectorAll('button')].find(
    (b) => b.textContent?.trim().startsWith(label),
  );
  if (undefined === button) {
    throw new Error(`Bouton introuvable : ${label}`);
  }
  button.click();
}

function alertText(fixture: { nativeElement: HTMLElement }): string | null {
  return (
    fixture.nativeElement.querySelector('[role="alert"]')?.textContent ?? null
  );
}

function scanning(fixture: { nativeElement: HTMLElement }): boolean {
  return (
    'true' ===
    fixture.nativeElement
      .querySelector('sl-scan-overlay')
      ?.getAttribute('data-active')
  );
}

describe('PairingPage', () => {
  it('propose la saisie manuelle quand la caméra ne sait pas lire', async () => {
    const { scanner } = setup();
    scanner.supported = false;

    const fixture = await render();

    expect(fixture.nativeElement.textContent).not.toContain('Scanner le QR');
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(3);
  });

  it('propose le scan quand il est disponible', async () => {
    const { scanner } = setup();
    scanner.supported = true;

    const fixture = await render();

    // La saisie manuelle reste accessible : le scan est un raccourci, pas un
    // passage obligé.
    expect(fixture.nativeElement.textContent).toContain('Scanner le QR');
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(3);
  });

  it('refuse de connecter tant qu’un champ manque', async () => {
    setup();
    const fixture = await render();

    fill(fixture, 0, 'evanliomain');
    fill(fixture, 1, 'shopping-list-data');
    await fixture.whenStable();

    const connect = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.includes('Connecter'),
    ) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
  });

  it('appaire puis redémarre le provider', async () => {
    const { configService, provider } = setup();
    const fixture = await render();

    fill(fixture, 0, 'evanliomain');
    fill(fixture, 1, 'shopping-list-data');
    fill(fixture, 2, 'github_pat_xxx');
    await fixture.whenStable();

    clickButton(fixture, 'Connecter');
    await fixture.whenStable();

    expect(configService.pairCalls).toHaveLength(1);
    // Sans redémarrage, la synchronisation n'aurait lieu qu'au prochain
    // chargement de l'application.
    expect(provider.restarted).toEqual([CONFIG]);
  });

  it('n’appaire qu’une fois quand on tape deux fois sur « Connecter »', async () => {
    // Le bouton ne se grise qu'au rendu suivant : deux tapes rapprochées
    // partaient toutes les deux vérifier l'accès au dépôt.
    const { configService, provider } = setup();
    const fixture = await render();

    fill(fixture, 0, 'evanliomain');
    fill(fixture, 1, 'shopping-list-data');
    fill(fixture, 2, 'github_pat_xxx');
    await fixture.whenStable();

    clickButton(fixture, 'Connecter');
    clickButton(fixture, 'Connecter');
    await settle(fixture);

    expect(configService.pairCalls).toHaveLength(1);
    expect(provider.restarted).toEqual([CONFIG]);
  });

  it('affiche l’erreur sans enregistrer quand l’appairage échoue', async () => {
    const { configService, provider } = setup();
    configService.failWith = new Error('Dépôt introuvable : x/y.');

    const fixture = await render();
    fill(fixture, 0, 'x');
    fill(fixture, 1, 'y');
    fill(fixture, 2, 'z');
    await fixture.whenStable();

    clickButton(fixture, 'Connecter');
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('[role="alert"]').textContent,
    ).toContain('Dépôt introuvable');
    expect(provider.restarted).toEqual([]);
  });

  it('montre le dépôt appairé et permet de dissocier', async () => {
    const { configService, provider } = setup();
    configService.config.set(CONFIG);

    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain(
      'evanliomain/shopping-list-data',
    );

    clickButton(fixture, 'Dissocier');
    await fixture.whenStable();

    expect(configService.config()).toBeNull();
    expect(provider.disconnected).toBe(1);
  });

  it('avertit que le QR d’appairage contient le jeton', async () => {
    const { configService } = setup();
    configService.config.set(CONFIG);

    const fixture = await render();
    clickButton(fixture, 'Appairer un autre appareil');
    await fixture.whenStable();

    // Ce QR est un identifiant : le dire explicitement fait partie du produit.
    expect(fixture.nativeElement.textContent).toContain(
      "contient le jeton d'accès",
    );
    expect(
      fixture.nativeElement.querySelector('img').getAttribute('src'),
    ).toContain('data:image/svg+xml');
  });

  it('referme le QR et retrouve le dépôt appairé', async () => {
    const { configService } = setup();
    configService.config.set(CONFIG);

    const fixture = await render();
    clickButton(fixture, 'Appairer un autre appareil');
    await settle(fixture);

    clickButton(fixture, 'Fermer');
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'evanliomain/shopping-list-data',
    );
  });

  it('n’affiche pas de QR quand l’appairage a disparu entre-temps', async () => {
    // « Dissocier » est asynchrone : le bouton d'appairage reste affiché le
    // temps que la configuration s'efface. La tape qui arrive alors ne doit pas
    // produire un code vide.
    const { configService } = setup();
    configService.config.set(CONFIG);

    const fixture = await render();
    configService.config.set(null);
    clickButton(fixture, 'Appairer un autre appareil');
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(3);
  });

  it('démarre réellement la caméra au clic sur « Scanner »', async () => {
    // Non-régression. L'élément vidéo vivait dans un `@if` et le composant
    // pariait sur un microtask pour qu'Angular l'ait rendu. `viewChild`
    // renvoyait donc `undefined`, et le code retombait en silence sur `idle` :
    // vu de l'utilisateur, le bouton ne faisait rien.
    const { scanner } = setup();
    scanner.supported = true;

    const fixture = await render();
    clickButton(fixture, 'Scanner le QR');
    await fixture.whenStable();

    expect(scanner.received).toBeInstanceOf(HTMLVideoElement);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('rend l’aperçu caméra visible pendant la lecture', async () => {
    const { scanner } = setup();
    scanner.supported = true;

    const fixture = await render();
    const overlay = fixture.nativeElement.querySelector('sl-scan-overlay');
    expect(overlay.getAttribute('data-active')).toBe('false');

    clickButton(fixture, 'Scanner le QR');
    await fixture.whenStable();

    expect(overlay.getAttribute('data-active')).toBe('true');
  });

  it('dit pourquoi quand l’aperçu caméra n’a pas pu être monté', async () => {
    // Sans élément où rendre le flux, il n'y a rien à scanner : le bouton doit
    // renvoyer vers la saisie manuelle au lieu de retomber en silence.
    const { scanner } = setup();
    scanner.supported = true;
    TestBed.overrideTemplate(
      PairingPage,
      `<button type="button" (click)="startScan()">Scanner</button>
       @if (null !== alert()) {
         <p role="alert">{{ alert() }}</p>
       }`,
    );

    const fixture = await render();
    clickButton(fixture, 'Scanner');
    await settle(fixture);

    expect(alertText(fixture)).toContain(
      "L'aperçu caméra n'a pas pu être initialisé",
    );
    expect(scanner.received).toBeNull();
  });

  it('appaire le second appareil à partir du QR du premier', async () => {
    const { configService, provider, scanner } = setup();
    scanner.supported = true;

    const fixture = await render();
    clickButton(fixture, 'Scanner le QR');
    await fixture.whenStable();

    scanner.read(QR_APPAIRAGE);
    await settle(fixture);

    // Rien à taper sur cet appareil : tout vient du code lu.
    expect(configService.pairCalls).toEqual([
      {
        v: 1,
        owner: 'evanliomain',
        repo: 'shopping-list-data',
        token: 'github_pat_xxx',
      },
    ]);
    expect(provider.restarted).toEqual([CONFIG]);
    expect(scanning(fixture)).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(
      'evanliomain/shopping-list-data',
    );
  });

  it('refuse un code qui n’est pas un appairage', async () => {
    const { configService, scanner } = setup();
    scanner.supported = true;

    const fixture = await render();
    clickButton(fixture, 'Scanner le QR');
    await fixture.whenStable();

    // Le QR d'une boîte de conserve, par exemple.
    scanner.read('https://exemple.fr/produit/42');
    await settle(fixture);

    expect(alertText(fixture)).toContain(
      "Ce code n'est pas un appairage valide.",
    );
    expect(configService.pairCalls).toEqual([]);
    expect(scanning(fixture)).toBe(false);
  });

  it('explique un refus de caméra et laisse la saisie manuelle', async () => {
    const { scanner } = setup();
    scanner.supported = true;

    const fixture = await render();
    clickButton(fixture, 'Scanner le QR');
    await fixture.whenStable();

    scanner.fail(new ScanError('permission-denied', 'errors.camera.denied'));
    await settle(fixture);

    expect(alertText(fixture)).toContain("L'accès à la caméra a été refusé.");
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(3);
  });

  it('ferme l’aperçu sans rien reprocher quand on annule le scan', async () => {
    const { scanner } = setup();
    scanner.supported = true;

    const fixture = await render();
    clickButton(fixture, 'Scanner le QR');
    await fixture.whenStable();

    clickButton(fixture, 'Annuler');
    await settle(fixture);

    // Renoncer n'est pas une erreur, mais la caméra doit bien s'éteindre.
    expect(scanner.aborted).toBe(true);
    expect(alertText(fixture)).toBeNull();
    expect(scanning(fixture)).toBe(false);
  });

  it('éteint la caméra en revenant à l’écran précédent', async () => {
    const { scanner } = setup();
    scanner.supported = true;
    const location = TestBed.inject(Location);
    location.go('/reglages');
    location.go('/reglages/appairage');

    const fixture = await render();
    clickButton(fixture, 'Scanner le QR');
    await fixture.whenStable();

    (
      fixture.nativeElement.querySelector('button.back') as HTMLButtonElement
    ).click();
    await settle(fixture);

    // Quitter l'écran sans couper le flux laisserait la caméra allumée.
    expect(scanner.aborted).toBe(true);
    expect(location.path()).toBe('/reglages');
  });

  it('annonce la synchro en panne et ce qui reste sur l’appareil', async () => {
    const { configService } = setup(
      githubChannel('error', 'Le jeton GitHub est invalide ou a expiré.', 3),
    );
    configService.config.set(CONFIG);

    const fixture = await render();

    expect(alertText(fixture)).toContain('Le jeton GitHub est invalide');
    // Devant une panne de synchro, la seule question qu'on se pose est « et mes
    // modifications ? ».
    expect(fixture.nativeElement.textContent).toContain(
      '3 modifs gardées sur cet appareil',
    );
  });

  it('constate la panne sans alerte quand la synchro n’a rien dit', async () => {
    const { configService } = setup(githubChannel('error'));
    configService.config.set(CONFIG);

    const fixture = await render();

    expect(alertText(fixture)).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Synchro en panne.');
  });

  it('dit que tout est synchronisé quand le canal est actif', async () => {
    const { configService } = setup(githubChannel('live'));
    configService.config.set(CONFIG);

    const fixture = await render();

    expect(fixture.nativeElement.textContent).toContain('Synchronisé.');
    expect(alertText(fixture)).toBeNull();
  });
});
