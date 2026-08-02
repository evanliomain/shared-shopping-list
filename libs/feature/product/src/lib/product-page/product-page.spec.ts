import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { provideStore, Store } from '@ngrx/store';
import {
  createProduct,
  ensureList,
  ProductId,
  readSnapshot,
} from '@shopping-list/core/crdt';
import {
  crdtActions,
  DEFAULT_LIST_ID,
  shoppingFeature,
} from '@shopping-list/data-access/shopping';
import * as Y from 'yjs';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { ProductPage } from './product-page';

const NOW = 1_764_000_000_000;
const LIST_NAME = 'Nos courses';

/**
 * On monte un vrai Store avec la vraie tranche, et on l'alimente par un
 * snapshot produit par le vrai CRDT. Les effects d'écriture ne sont pas
 * branchés : on vérifie ici ce que la page *dispatche*, pas ce que le CRDT en
 * fait — c'est déjà couvert côté core/crdt.
 */
async function render(seed: (doc: Y.Doc) => ProductId) {
  const doc = new Y.Doc({ gc: true });
  ensureList(doc, DEFAULT_LIST_ID, LIST_NAME, NOW);
  const productId = seed(doc);

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      provideTestI18n(),
      provideStore({ [shoppingFeature.name]: shoppingFeature.reducer }),
    ],
  });

  const store = TestBed.inject(Store);
  const dispatched: unknown[] = [];
  store.dispatch(crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }));
  store.dispatch = ((action: unknown) => dispatched.push(action)) as never;

  const fixture = TestBed.createComponent(ProductPage);
  fixture.componentRef.setInput('productId', productId);
  await fixture.whenStable();

  return { fixture, productId, dispatched };
}

function click(fixture: { nativeElement: HTMLElement }, label: string): void {
  const button = [...fixture.nativeElement.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (undefined === button) {
    throw new Error(`Bouton introuvable : ${label}`);
  }
  button.click();
}

describe('ProductPage', () => {
  it('préremplit le formulaire avec le produit', async () => {
    const { fixture } = await render((doc) =>
      createProduct(
        doc,
        {
          label: 'Yaourt',
          description: 'à la vanille',
          defaultQty: 'x4',
          category: 'cremerie',
          imageRef: 'emoji:🍦',
        },
        NOW,
      ),
    );

    const inputs = fixture.nativeElement.querySelectorAll('input');
    expect(inputs[0].value).toBe('Yaourt');
    expect(inputs[1].value).toBe('à la vanille');
    expect(inputs[2].value).toBe('x4');
    expect(fixture.nativeElement.querySelector('select').value).toBe(
      'cremerie',
    );
  });

  it('affiche un message quand le produit n’existe pas', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideLocationMocks(),
        provideTestI18n(),
        provideStore({ [shoppingFeature.name]: shoppingFeature.reducer }),
      ],
    });

    const fixture = TestBed.createComponent(ProductPage);
    fixture.componentRef.setInput('productId', 'inconnu');
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(
      "Ce produit n'existe pas ou plus",
    );
  });

  it('enregistre les modifications du catalogue', async () => {
    const { fixture, productId, dispatched } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt' }, NOW),
    );

    const description = fixture.nativeElement.querySelectorAll('input')[1];
    description.value = 'Firen, pour le petit';
    description.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    click(fixture, 'Enregistrer');

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: '[Catalogue] Produit modifié',
        productId,
        patch: expect.objectContaining({
          label: 'Yaourt',
          description: 'Firen, pour le petit',
        }),
      }),
    );
  });

  it('refuse d’enregistrer un libellé vide', async () => {
    const { fixture, dispatched } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt' }, NOW),
    );

    const label = fixture.nativeElement.querySelectorAll('input')[0];
    label.value = '   ';
    label.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    click(fixture, 'Enregistrer');

    expect(dispatched).toHaveLength(0);
  });

  it('archive le produit sans le supprimer', async () => {
    const { fixture, productId, dispatched } = await render((doc) =>
      createProduct(doc, { label: 'Bougie' }, NOW),
    );

    click(fixture, 'Archiver');

    expect(dispatched).toEqual([
      { type: '[Catalogue] Produit archivé', productId },
    ]);
  });
});
