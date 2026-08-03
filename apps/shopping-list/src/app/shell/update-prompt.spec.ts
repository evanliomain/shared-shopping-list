import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';
import { Subject } from 'rxjs';

import { UpdatePrompt } from './update-prompt';

const PRETE: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'installee' },
  latestVersion: { hash: 'nouvelle' },
};

const DETECTEE: VersionEvent = {
  type: 'VERSION_DETECTED',
  version: { hash: 'nouvelle' },
};

const ECHOUEE: VersionEvent = {
  type: 'VERSION_INSTALLATION_FAILED',
  version: { hash: 'nouvelle' },
  error: 'réseau coupé',
};

/**
 * Doublure de `SwUpdate` : le vrai service refuse de s'instancier sans service
 * worker enregistré, et jsdom n'en a pas.
 */
class FauxSwUpdate {
  private readonly versions = new Subject<VersionEvent>();

  readonly versionUpdates = this.versions.asObservable();

  /** Nombre d'activations demandées, pour vérifier qu'on n'en oublie pas. */
  activations = 0;

  constructor(readonly isEnabled: boolean) {}

  emet(event: VersionEvent): void {
    this.versions.next(event);
  }

  async activateUpdate(): Promise<boolean> {
    this.activations++;
    return true;
  }
}

describe('UpdatePrompt', () => {
  let rechargements: number;

  beforeEach(() => {
    rechargements = 0;
    // jsdom refuse toute navigation et scelle `location.reload` : on remplace
    // l'objet global entier pour compter les rechargements demandés.
    vi.stubGlobal('location', {
      ...location,
      reload: () => {
        rechargements++;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function monte(isEnabled = true): {
    fixture: ComponentFixture<UpdatePrompt>;
    updates: FauxSwUpdate;
  } {
    const updates = new FauxSwUpdate(isEnabled);
    TestBed.configureTestingModule({
      providers: [provideTestI18n(), { provide: SwUpdate, useValue: updates }],
    });

    return { fixture: TestBed.createComponent(UpdatePrompt), updates };
  }

  function invite(fixture: ComponentFixture<UpdatePrompt>): HTMLElement | null {
    return fixture.nativeElement.querySelector('.prompt');
  }

  function bouton(
    fixture: ComponentFixture<UpdatePrompt>,
    libelle: string,
  ): HTMLButtonElement {
    const boutons: HTMLButtonElement[] = [
      ...fixture.nativeElement.querySelectorAll('button'),
    ];
    const trouve = boutons.find((b) => b.textContent?.trim() === libelle);

    if (undefined === trouve) {
      throw new Error(`Bouton « ${libelle} » absent de l'invite`);
    }

    return trouve;
  }

  it('reste muet tant qu’aucune version n’est prête', async () => {
    const { fixture } = monte();
    await fixture.whenStable();

    expect(invite(fixture)).toBeNull();
  });

  it('propose la nouvelle version sans l’imposer', async () => {
    const { fixture, updates } = monte();
    updates.emet(PRETE);
    await fixture.whenStable();

    const bandeau = invite(fixture);
    expect(bandeau?.getAttribute('role')).toBe('status');
    expect(bandeau?.querySelector('span')?.textContent).toContain(
      'Nouvelle version disponible.',
    );
    expect(
      [...(bandeau?.querySelectorAll('button') ?? [])].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(['Mettre à jour', 'Plus tard']);
    expect(rechargements).toBe(0);
  });

  it('ignore les étapes qui précèdent une version utilisable', async () => {
    // Annoncer un téléchargement en cours, ou son échec, ne donne rien à
    // installer : proposer le rechargement à ce moment-là servirait la même
    // version.
    const { fixture, updates } = monte();
    updates.emet(DETECTEE);
    updates.emet(ECHOUEE);
    await fixture.whenStable();

    expect(invite(fixture)).toBeNull();
  });

  it('n’écoute rien quand le service worker est désactivé', async () => {
    // En développement, `versionUpdates` n'émet jamais ; on vérifie surtout
    // qu'un événement égaré ne fait pas surgir le bandeau.
    const { fixture, updates } = monte(false);
    updates.emet(PRETE);
    await fixture.whenStable();

    expect(invite(fixture)).toBeNull();
  });

  it('active la nouvelle version avant de recharger', async () => {
    // Recharger sans activer servirait à nouveau l'ancienne version.
    const { fixture, updates } = monte();
    updates.emet(PRETE);
    await fixture.whenStable();

    bouton(fixture, 'Mettre à jour').click();
    await fixture.whenStable();

    expect(updates.activations).toBe(1);
    expect(rechargements).toBe(1);
  });

  it('laisse finir les courses quand on remet à plus tard', async () => {
    const { fixture, updates } = monte();
    updates.emet(PRETE);
    await fixture.whenStable();

    bouton(fixture, 'Plus tard').click();
    await fixture.whenStable();

    expect(invite(fixture)).toBeNull();
    expect(rechargements).toBe(0);
  });

  it('repropose la mise à jour au téléchargement suivant', async () => {
    const { fixture, updates } = monte();
    updates.emet(PRETE);
    await fixture.whenStable();
    bouton(fixture, 'Plus tard').click();
    await fixture.whenStable();

    updates.emet(PRETE);
    await fixture.whenStable();

    expect(invite(fixture)).not.toBeNull();
  });
});
