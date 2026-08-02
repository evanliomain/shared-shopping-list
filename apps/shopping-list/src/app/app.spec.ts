import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideTestI18n(),
        // La coquille héberge l'invite de mise à jour, qui injecte SwUpdate.
        // Désactivé ici : on ne veut pas d'enregistrement de service worker.
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
      ],
    }).compileComponents();
  });

  it('monte la coquille applicative', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('n’affiche pas l’invite de mise à jour sans nouvelle version', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.prompt')).toBeNull();
  });
});
