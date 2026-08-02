import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BlobService } from '@shopping-list/core/blobs';
import {
  archiveProduct,
  createProduct,
  ensureList,
  readSnapshot,
} from '@shopping-list/core/crdt';
import { GithubConfigService } from '@shopping-list/core/sync-github';
import { provideStore, Store } from '@ngrx/store';
import {
  crdtActions,
  DEFAULT_LIST_ID,
  shoppingFeature,
} from '@shopping-list/data-access/shopping';
import { signal } from '@angular/core';
import * as Y from 'yjs';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { CatalogPage } from './catalog-page';

const NOW = 1_764_000_000_000;
const LIST_NAME = 'Nos courses';

class FakeBlobs {
  readonly available = signal(new Set<string>());
  async objectUrl(): Promise<string | null> {
    return null;
  }
  async bytesOf(): Promise<Uint8Array | null> {
    return null;
  }
  async adopt(): Promise<void> {
    return;
  }
}

async function render(seed: (doc: Y.Doc) => void) {
  const doc = new Y.Doc({ gc: true });
  ensureList(doc, DEFAULT_LIST_ID, LIST_NAME, NOW);
  seed(doc);

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      provideTestI18n(),
      provideStore({ [shoppingFeature.name]: shoppingFeature.reducer }),
      { provide: BlobService, useClass: FakeBlobs },
      {
        provide: GithubConfigService,
        useValue: { config: signal(null), loaded: signal(true) },
      },
    ],
  });

  const store = TestBed.inject(Store);
  store.dispatch(crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }));

  const dispatched: unknown[] = [];
  store.dispatch = ((action: unknown) => dispatched.push(action)) as never;

  const fixture = TestBed.createComponent(CatalogPage);
  await fixture.whenStable();

  return { fixture, dispatched };
}

function rows(fixture: { nativeElement: HTMLElement }): HTMLElement[] {
  return [...fixture.nativeElement.querySelectorAll('li')];
}

function labels(fixture: { nativeElement: HTMLElement }): string[] {
  return rows(fixture).map(
    (li) => li.querySelector('.label')?.textContent?.trim() ?? '',
  );
}

describe('CatalogPage', () => {
  it('explique à quoi sert l’historique quand il est vide', async () => {
    const { fixture } = await render(() => undefined);

    expect(fixture.nativeElement.textContent).toContain(
      "L'historique est vide",
    );
  });

  it('masque les produits archivés par défaut', async () => {
    const { fixture } = await render((doc) => {
      createProduct(doc, { label: 'Lait' }, NOW);
      const bougie = createProduct(doc, { label: 'Bougie' }, NOW);
      archiveProduct(doc, bougie, NOW);
    });

    expect(labels(fixture)).toEqual(['Lait']);
    // Le singulier français vaut aussi pour un : c'est `Intl.PluralRules`
    // qui l'a tranché, pas un `count === 1` écrit à la main.
    expect(fixture.nativeElement.textContent).toContain(
      'Afficher le 1 produit archivé',
    );
  });

  it('révèle les archivés à la demande', async () => {
    const { fixture } = await render((doc) => {
      createProduct(doc, { label: 'Lait' }, NOW);
      const bougie = createProduct(doc, { label: 'Bougie' }, NOW);
      archiveProduct(doc, bougie, NOW);
    });

    fixture.nativeElement.querySelector('.toggle input').click();
    await fixture.whenStable();

    expect(labels(fixture).sort()).toEqual(['Bougie', 'Lait']);
  });

  it('cherche dans le libellé et la description', async () => {
    const { fixture } = await render((doc) => {
      createProduct(doc, { label: 'Yaourt', description: 'à la vanille' }, NOW);
      createProduct(doc, { label: 'Yaourt', description: 'Firen' }, NOW);
      createProduct(doc, { label: 'Lait' }, NOW);
    });

    const search = fixture.nativeElement.querySelector('.search input');
    search.value = 'vanille';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(rows(fixture)).toHaveLength(1);
  });

  it('archive sans supprimer', async () => {
    const { fixture, dispatched } = await render((doc) => {
      createProduct(doc, { label: 'Bougie' }, NOW);
    });

    rows(fixture)[0].querySelector<HTMLButtonElement>('.archive')?.click();

    expect(dispatched).toEqual([
      expect.objectContaining({ type: '[Catalogue] Produit archivé' }),
    ]);
  });

  it('remet un produit dans la liste en un geste', async () => {
    // Le geste que tout le design vise : refaire la liste sans rien retaper.
    const { fixture, dispatched } = await render((doc) => {
      createProduct(doc, { label: 'Lait' }, NOW);
    });

    rows(fixture)[0].querySelector<HTMLButtonElement>('.add')?.click();

    expect(dispatched).toEqual([
      expect.objectContaining({ type: '[Liste] Produit ajouté' }),
    ]);
  });

  it('affiche le rayon et le nombre d’achats', async () => {
    const { fixture } = await render((doc) => {
      createProduct(doc, { label: 'Lait', category: 'cremerie' }, NOW);
    });

    expect(rows(fixture)[0].querySelector('.meta')?.textContent).toContain(
      'Crèmerie',
    );
  });
});
