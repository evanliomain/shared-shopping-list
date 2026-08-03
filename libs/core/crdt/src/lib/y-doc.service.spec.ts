import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import * as Y from 'yjs';

import { createProduct, ensureList } from './operations';
import { forkReplica } from './testing/replicas';
import { CrdtSnapshot, EMPTY_SNAPSHOT } from './types';
import { LOCAL_ORIGIN, YDocService } from './y-doc.service';

const LIST = 'maison';
const NOW = 1_764_000_000_000;

/** Laisse passer le `auditTime(0)`, qui s'appuie sur un vrai minuteur. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1));
}

function collect(service: YDocService): CrdtSnapshot[] {
  const seen: CrdtSnapshot[] = [];
  service.snapshot$.subscribe((snapshot) => seen.push(snapshot));
  return seen;
}

describe('YDocService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reprend l’identité persistée de l’appareil', () => {
    localStorage.setItem('sl.deviceId', 'device-A');
    localStorage.setItem('sl.deviceName', 'Téléphone d’Evan');

    const service = TestBed.inject(YDocService);

    expect(service.deviceId).toBe('device-A');
    expect(service.deviceName).toBe('Téléphone d’Evan');
  });

  it('publie un instantané dès l’abonnement, avant toute modification', async () => {
    const service = TestBed.inject(YDocService);

    // Sans le `startWith`, le store resterait vide jusqu'à la première
    // écriture — donc écran blanc au démarrage.
    await expect(firstValueFrom(service.snapshot$)).resolves.toEqual(
      EMPTY_SNAPSHOT,
    );
  });

  it('republie après une écriture locale', async () => {
    const service = TestBed.inject(YDocService);
    const seen = collect(service);

    service.transact((doc) => ensureList(doc, LIST, 'Maison', NOW));
    await nextTick();

    expect(seen).toHaveLength(2);
    expect(seen[1].lists[LIST].name).toBe('Maison');
  });

  it('republie un delta distant par le même chemin qu’une écriture locale', async () => {
    const service = TestBed.inject(YDocService);
    const seen = collect(service);

    // Le point clé de l'architecture : rien de spécial à écrire pour le
    // distant, un delta venu de GitHub ou d'un QR code emprunte cette voie.
    const remote = forkReplica(service.doc);
    ensureList(remote, LIST, 'Maison', NOW);
    createProduct(remote, { label: 'Lait' }, NOW);
    Y.applyUpdate(service.doc, Y.encodeStateAsUpdate(remote));
    await nextTick();

    expect(seen).toHaveLength(2);
    expect(Object.values(seen[1].catalog).map((p) => p.label)).toEqual([
      'Lait',
    ]);
  });

  it('regroupe en une seule publication les rafales d’un même tick', async () => {
    const service = TestBed.inject(YDocService);
    const seen = collect(service);

    service.transact((doc) => ensureList(doc, LIST, 'Maison', NOW));
    service.transact((doc) => createProduct(doc, { label: 'Lait' }, NOW));
    service.transact((doc) => createProduct(doc, { label: 'Pain' }, NOW));
    await nextTick();

    // Trois écritures, un seul recalcul de snapshot et un seul rendu.
    expect(seen).toHaveLength(2);
    expect(Object.keys(seen[1].catalog)).toHaveLength(2);
  });

  it('marque ses transactions d’une origine locale', () => {
    const service = TestBed.inject(YDocService);
    const origins: unknown[] = [];
    service.doc.on('update', (_update, origin) => origins.push(origin));

    service.transact((doc) => {
      ensureList(doc, LIST, 'Maison', NOW);
      createProduct(doc, { label: 'Lait' }, NOW);
    });

    // Une seule mise à jour pour deux écritures, et une origine reconnaissable
    // pour que les providers ne renvoient pas à l'expéditeur ce qu'il écrit.
    expect(origins).toEqual([LOCAL_ORIGIN]);
  });

  it('donne un instantané synchrone sans passer par le flux', () => {
    const service = TestBed.inject(YDocService);

    service.transact((doc) => ensureList(doc, LIST, 'Maison', NOW));

    expect(service.currentSnapshot().lists[LIST].name).toBe('Maison');
  });

  it('libère le document quand l’injecteur est détruit', () => {
    const service = TestBed.inject(YDocService);

    TestBed.resetTestingModule();

    expect(service.doc.isDestroyed).toBe(true);
  });
});
