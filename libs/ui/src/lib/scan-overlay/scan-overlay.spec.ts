import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { ScanOverlay } from './scan-overlay';

/**
 * Une page qui projette son `<video>` et ses deux zones de texte, comme le font
 * l'appairage et l'échange de proximité : c'est le contrat du lecteur, et il ne
 * se vérifie pas sur le composant seul.
 */
@Component({
  selector: 'sl-hote-scan',
  imports: [ScanOverlay],
  template: `
    <sl-scan-overlay [active]="actif()" (cancelled)="renonce()">
      <p data-slot="head" id="cadran">2 / 3</p>
      <video id="camera" muted></video>
      <p data-slot="status" id="consigne">Visez le QR code de l’autre écran</p>
    </sl-scan-overlay>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HoteScan {
  readonly actif = signal(false);
  renoncements = 0;

  renonce(): void {
    this.renoncements++;
  }
}

describe('ScanOverlay', () => {
  async function render(actif: boolean): Promise<ComponentFixture<HoteScan>> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });

    const fixture = TestBed.createComponent(HoteScan);
    fixture.componentInstance.actif.set(actif);
    await fixture.whenStable();

    return fixture;
  }

  function overlay(fixture: ComponentFixture<HoteScan>): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector(
      'sl-scan-overlay',
    ) as HTMLElement;
  }

  it('garde le lecteur monté avant le scan', async () => {
    // Dans un `@if`, le scan démarrait avant que le `<video>` existe et
    // échouait en silence : hors scan, seul l'affichage tombe.
    const élément = overlay(await render(false));

    expect(élément.getAttribute('data-active')).toBe('false');
    expect(élément.querySelector('#camera')).not.toBeNull();
  });

  it('range chaque contenu projeté dans sa zone', async () => {
    const élément = overlay(await render(true));

    expect(élément.getAttribute('data-active')).toBe('true');
    expect(élément.querySelector('.head #cadran')).not.toBeNull();
    expect(élément.querySelector('.viewfinder #camera')).not.toBeNull();
    expect(élément.querySelector('.status #consigne')).not.toBeNull();
  });

  it('n’offre qu’un geste : renoncer', async () => {
    const fixture = await render(true);
    const boutons = overlay(fixture).querySelectorAll('button');

    expect(boutons).toHaveLength(1);
    expect(boutons[0].textContent?.trim()).toBe('Annuler');

    boutons[0].click();

    // La page décide ce qu'annuler veut dire pour elle : le lecteur se contente
    // de le dire.
    expect(fixture.componentInstance.renoncements).toBe(1);
  });
});
