import { provideLocationMocks } from '@angular/common/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QrScanner } from '@shopping-list/core/qr';
import {
  GithubConfig,
  GithubConfigService,
  GithubSyncProvider,
} from '@shopping-list/core/sync-github';

import { PairingPage } from './pairing-page';

const CONFIG: GithubConfig = {
  owner: 'evanliomain',
  repo: 'shopping-list-data',
  token: 'github_pat_xxx',
  branch: 'main',
  path: 'state.bin',
};

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

  isSupported(): boolean {
    return this.supported;
  }

  async scanOnce(video: HTMLVideoElement): Promise<string> {
    this.received = video;
    // Ne se résout jamais : on observe le démarrage, pas la lecture.
    return new Promise(() => undefined);
  }
}

function setup() {
  const configService = new FakeConfigService();
  const provider = new FakeProvider();
  const scanner = new FakeScanner();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      { provide: GithubConfigService, useValue: configService },
      { provide: GithubSyncProvider, useValue: provider },
      { provide: QrScanner, useValue: scanner },
      // Aucun SYNC_PROVIDERS : le registre gère l'absence, et la page n'a
      // besoin que de lire un état vide.
    ],
  });

  return { configService, provider, scanner };
}

async function render() {
  const fixture = TestBed.createComponent(PairingPage);
  await fixture.whenStable();
  return fixture;
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
    const camera = fixture.nativeElement.querySelector('.camera');
    expect(camera.classList.contains('active')).toBe(false);

    clickButton(fixture, 'Scanner le QR');
    await fixture.whenStable();

    expect(camera.classList.contains('active')).toBe(true);
  });
});
