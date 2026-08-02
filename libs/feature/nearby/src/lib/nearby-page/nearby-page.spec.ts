import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QrScanner } from '@shopping-list/core/qr';

import { NearbyPage } from './nearby-page';

/**
 * jsdom n'a ni `CompressionStream` ni canvas ; les tests portent donc sur la
 * machine à états et sur ce que l'écran propose, pas sur le rendu du QR — qui
 * est couvert par `core/qr` et `core/sync-qr`.
 */
class FakeScanner {
  supported = true;
  isSupported(): boolean {
    return this.supported;
  }
  async scanOnce(): Promise<string> {
    return new Promise(() => undefined);
  }
}

function setup(supported = true) {
  const scanner = new FakeScanner();
  scanner.supported = supported;

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideLocationMocks(),
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

function button(
  fixture: { nativeElement: HTMLElement },
  label: string,
): HTMLButtonElement | undefined {
  return [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(label),
  );
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
});
