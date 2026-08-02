import { TestBed } from '@angular/core/testing';
import { AppLang } from '@shopping-list/util/i18n';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { SyncBadge, SyncBadgeStatus } from './sync-badge';

describe('SyncBadge', () => {
  async function textFor(
    status: SyncBadgeStatus,
    pending = 0,
    lang: AppLang = 'fr',
  ): Promise<string> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTestI18n(lang)] });

    const fixture = TestBed.createComponent(SyncBadge);
    fixture.componentRef.setInput('status', status);
    fixture.componentRef.setInput('pending', pending);
    await fixture.whenStable();

    return (
      fixture.nativeElement.querySelector('.text').textContent?.trim() ?? ''
    );
  }

  it('dit « appareil seul » plutôt que « hors ligne » sans appairage', async () => {
    // Rien n'est en panne : il n'y a simplement personne à qui parler.
    expect(await textFor('unpaired')).toBe('Appareil seul');
  });

  it('confirme la synchronisation quand tout est passé', async () => {
    expect(await textFor('live')).toBe('Synchronisé');
  });

  it('annonce le nombre de modifications en attente', async () => {
    // Au fond d'un rayon, ce qui rassure c'est de savoir que rien n'est perdu.
    expect(await textFor('offline', 3)).toBe('Hors ligne · 3 modifs gardées');
    expect(await textFor('offline', 1)).toBe('Hors ligne · 1 modif gardée');
  });

  it('signale un envoi en cours', async () => {
    expect(await textFor('live', 2)).toContain('Envoi…');
  });

  it('distingue une panne d’un simple hors-ligne', async () => {
    expect(await textFor('error')).toBe('Synchro en panne');
  });

  it('dit la même chose en anglais, avec le pluriel anglais', async () => {
    expect(await textFor('unpaired', 0, 'en')).toBe('This device only');
    expect(await textFor('offline', 1, 'en')).toBe('Offline · 1 change kept');
    expect(await textFor('offline', 3, 'en')).toBe('Offline · 3 changes kept');
  });

  it('expose le statut en attribut, pour le style et les tests', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });

    const fixture = TestBed.createComponent(SyncBadge);
    fixture.componentRef.setInput('status', 'offline');
    await fixture.whenStable();

    expect(fixture.nativeElement.getAttribute('data-status')).toBe('offline');
  });
});
