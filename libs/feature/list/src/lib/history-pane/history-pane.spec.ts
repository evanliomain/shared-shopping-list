import { TestBed } from '@angular/core/testing';
import { provideStore, Store } from '@ngrx/store';
import {
  addItem,
  createProduct,
  ensureList,
  readSnapshot,
} from '@shopping-list/core/crdt';
import {
  crdtActions,
  DEFAULT_LIST_ID,
  ProductImages,
  shoppingFeature,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';
import * as Y from 'yjs';

import { FakeProductImages } from '../testing/fake-product-images';
import { HistoryPane } from './history-pane';

const NOW = 1_764_000_000_000;
const LIST_NAME = 'Nos courses';
const PHOTO = 'blob:a3f9c2d1e8b47f05';

async function render(
  seed: (doc: Y.Doc) => void = () => undefined,
  photoUrl: string | null = null,
) {
  const doc = new Y.Doc({ gc: true });
  ensureList(doc, DEFAULT_LIST_ID, LIST_NAME, NOW);
  seed(doc);

  const images = new FakeProductImages();
  images.url = photoUrl;
  TestBed.configureTestingModule({
    providers: [
      provideTestI18n(),
      provideStore({ [shoppingFeature.name]: shoppingFeature.reducer }),
      { provide: ProductImages, useValue: images },
    ],
  });

  const store = TestBed.inject(Store);
  store.dispatch(crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }));

  const fixture = TestBed.createComponent(HistoryPane);
  await fixture.whenStable();

  return { fixture, images };
}

function rows(nativeElement: HTMLElement): HTMLElement[] {
  return [...nativeElement.querySelectorAll('li')];
}

function labels(nativeElement: HTMLElement): string[] {
  return rows(nativeElement).map(
    (li) => li.querySelector('.label')?.textContent?.trim() ?? '',
  );
}

/** La ligne d'un produit donné : l'ordre du classement n'est pas le sujet ici. */
function row(nativeElement: HTMLElement, label: string): HTMLElement {
  const found = rows(nativeElement).find(
    (li) => li.querySelector('.label')?.textContent?.trim() === label,
  );
  if (undefined === found) {
    throw new Error(`Ligne introuvable : ${label}`);
  }

  return found;
}

/** Ce que la recherche a trouvé : les seuls fragments surlignés. */
function highlighted(nativeElement: HTMLElement): string[] {
  return [...nativeElement.querySelectorAll('mark')].map(
    (mark) => mark.textContent ?? '',
  );
}

async function search(
  fixture: Awaited<ReturnType<typeof render>>['fixture'],
  query: string,
): Promise<void> {
  const field = fixture.nativeElement.querySelector('.search input');
  field.value = query;
  field.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}

describe('HistoryPane', () => {
  it('affiche chaque produit avec son rayon et son nombre d’achats', async () => {
    const { fixture } = await render((doc) => {
      createProduct(doc, { label: 'Lait', category: 'cremerie' }, NOW);
    });

    expect(labels(fixture.nativeElement)).toEqual(['Lait']);
    expect(
      row(fixture.nativeElement, 'Lait').querySelector('.meta').textContent,
    ).toContain('Crèmerie');
  });

  it('montre la description quand le produit en porte une', async () => {
    // C'est souvent sur elle que la recherche a répondu (« vanille » pour
    // « Yaourt ») : un surlignage sur un texte absent de l'écran ne se voit pas.
    const { fixture } = await render((doc) => {
      createProduct(doc, { label: 'Yaourt', description: 'à la vanille' }, NOW);
      createProduct(doc, { label: 'Lait' }, NOW);
    });

    expect(
      row(fixture.nativeElement, 'Yaourt').querySelector('.description')
        .textContent,
    ).toContain('à la vanille');
    expect(
      row(fixture.nativeElement, 'Lait').querySelector('.description'),
    ).toBeNull();
  });

  it('cherche en approximatif, et surligne ce qui a répondu', async () => {
    const { fixture } = await render((doc) => {
      createProduct(doc, { label: 'Lait' }, NOW);
      createProduct(doc, { label: 'Bougie' }, NOW);
    });

    await search(fixture, 'lat');

    expect(labels(fixture.nativeElement)).toEqual(['Lait']);
    expect(highlighted(fixture.nativeElement)).toEqual(['La', 't']);
  });

  it('invite à chercher autrement quand rien ne correspond', async () => {
    const { fixture } = await render((doc) => {
      createProduct(doc, { label: 'Lait' }, NOW);
    });

    await search(fixture, 'zzz');

    expect(rows(fixture.nativeElement)).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain(
      'Aucun produit ne correspond',
    );
  });

  it('remet un produit dans la liste d’un seul geste', async () => {
    // Le geste que la colonne existe pour rendre trivial : refaire la liste de
    // la semaine sans rien retaper.
    const { fixture } = await render((doc) => {
      createProduct(doc, { label: 'Lait' }, NOW);
    });
    let added: SuggestionView | undefined;
    fixture.componentInstance.added.subscribe((v) => (added = v));

    const add = row(fixture.nativeElement, 'Lait').querySelector('.add');
    expect(add.getAttribute('aria-label')).toBe('Ajouter Lait à la liste');

    add.click();

    expect(added?.label).toBe('Lait');
  });

  it('marque ce qui est déjà dans la liste plutôt que de le proposer', async () => {
    // Le masquer donnerait l'impression de l'avoir perdu.
    const { fixture } = await render((doc) => {
      const lait = createProduct(doc, { label: 'Lait' }, NOW);
      addItem(doc, {
        listId: DEFAULT_LIST_ID,
        productId: lait,
        addedBy: 'Evan',
        deviceId: 'a',
        now: NOW,
      });
    });

    const lait = row(fixture.nativeElement, 'Lait');
    expect(lait.querySelector('.chip').textContent).toContain('dans la liste');
    expect(lait.querySelector('.add')).toBeNull();
  });

  it('affiche la photo d’un produit dès qu’elle est résolue', async () => {
    const { fixture } = await render(
      (doc) => createProduct(doc, { label: 'Lait', imageRef: PHOTO }, NOW),
      'blob:http://localhost/photo',
    );

    expect(
      row(fixture.nativeElement, 'Lait')
        .querySelector('img')
        .getAttribute('src'),
    ).toBe('blob:http://localhost/photo');
  });

  it('ne demande la résolution que des photos affichées', async () => {
    // Résoudre tout l'historique à l'ouverture réveillerait IndexedDB pour des
    // lignes que la recherche vient d'écarter.
    const { fixture, images } = await render((doc) => {
      createProduct(doc, { label: 'Lait', imageRef: PHOTO }, NOW);
      createProduct(doc, { label: 'Bougie', imageRef: 'blob:ff00' }, NOW);
    });
    expect(images.ensured.at(-1)?.toSorted()).toEqual([PHOTO, 'blob:ff00']);

    await search(fixture, 'lait');

    expect(images.ensured.at(-1)).toEqual([PHOTO]);
  });
});
