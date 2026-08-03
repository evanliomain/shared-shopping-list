import { Page } from '@playwright/test';

import { expect, test } from './support/fixtures';

/**
 * Parcours réels de la liste de courses.
 *
 * Chaque contexte Playwright part d'un IndexedDB vierge, donc chaque test
 * démarre avec une liste et un catalogue vides.
 */

/* Le placeholder change une fois qu'on enchaîne (« Article suivant… ») : c'est
   la feuille qu'on vise, pas un libellé. */
const input = (page: Page) => page.locator('sl-add-bar input');
const row = (page: Page, label: string) =>
  page.locator('sl-item-row').filter({ hasText: label });

/**
 * Ouvre l'ajout.
 *
 * Au bureau la barre est permanente, sur téléphone il faut passer par le
 * bouton : flottant sur une liste peuplée, au centre sur une liste vide.
 */
async function openAdd(page: Page): Promise<void> {
  if (await input(page).isVisible()) {
    await input(page).click();
    return;
  }

  await page.getByRole('button', { name: 'Ajouter un article' }).click();
  await expect(input(page)).toBeVisible();
}

/** Referme la feuille : « Terminé » dès qu'il y a des ajouts, « Fermer » sinon. */
async function closeAdd(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(Terminé|Fermer)$/ }).click();
}

async function createArticle(page: Page, label: string): Promise<void> {
  await openAdd(page);
  await input(page).fill(label);
  await page.getByRole('button', { name: `Créer « ${label} »` }).click();
}

/**
 * Retire un article. Au-delà de 1040 px la ligne porte son ✕ ; en dessous,
 * c'est le glissé vers la gauche qui fait le travail. Le parcours passe par ce
 * qui est réellement à disposition.
 */
async function removeArticle(page: Page, label: string): Promise<void> {
  const button = row(page, label).getByRole('button', {
    name: 'Retirer de la liste',
  });
  if (await button.isVisible()) {
    await button.click();
    return;
  }

  await swipe(page, label, -120);
}

/** Le ✏️ de la ligne, présent à toutes les largeurs : l'édition n'a pas de geste. */
async function editArticle(page: Page, label: string): Promise<void> {
  await row(page, label)
    .getByRole('link', { name: 'Modifier le produit' })
    .click();
}

/**
 * Glisse une ligne de `dx` pixels, depuis son centre.
 *
 * Le premier pas est volontairement séparé des suivants : c'est lui qui décide
 * de l'axe du geste, et un saut direct au seuil ne dirait rien de ce
 * discernement.
 */
async function swipe(page: Page, label: string, dx: number): Promise<void> {
  const box = await row(page, label).boundingBox();
  if (null === box) {
    throw new Error(`Ligne absente de l'écran : ${label}`);
  }

  const y = box.y + box.height / 2;
  const from = box.x + box.width / 2;

  await page.mouse.move(from, y);
  await page.mouse.down();
  await page.mouse.move(from + Math.sign(dx) * 20, y);
  await page.mouse.move(from + dx, y, { steps: 4 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/liste');
  await expect(page.locator('h1')).toBeVisible();
});

test('crée un article et l’affiche sous son rayon', async ({ page }) => {
  await createArticle(page, 'Lait');

  await expect(row(page, 'Lait')).toBeVisible();
  // « Lait » doit être reconnu et rangé en crèmerie, pas dans « divers ».
  await expect(page.getByRole('heading', { name: /Crèmerie/ })).toBeVisible();
  await expect(page.getByText('1 restant')).toBeVisible();
});

test('groupe les rayons dans l’ordre de parcours du magasin', async ({
  page,
}) => {
  // Saisis dans le désordre.
  await createArticle(page, 'Lessive');
  await createArticle(page, 'Carottes');
  await createArticle(page, 'Lait');

  // On assied l'assertion sur les clés de rayon plutôt que sur le texte
  // rendu, qui dépend du CSS (`text-transform: uppercase`).
  const aisles = await page
    .locator('main h2.aisle')
    .evaluateAll((sections) =>
      sections.map((s) => s.getAttribute('data-aisle')),
    );

  expect(aisles).toEqual(['fruits-legumes', 'cremerie', 'entretien']);
  await expect(page.getByRole('heading', { name: /Crèmerie/ })).toBeVisible();
});

test('la liste vide met l’ajout au centre de l’écran', async ({ page }) => {
  // Quand il n'y a rien à cocher, l'ajout *est* l'écran.
  await expect(page.getByText('La liste est vide')).toBeVisible();

  const add = page
    .locator('sl-empty-state')
    .getByRole('button', { name: 'Ajouter un article' });
  await expect(add).toBeVisible();

  await add.click();

  await expect(input(page)).toBeFocused();
});

test('enchaîne les ajouts sans refermer, et défait à la pastille', async ({
  page,
}) => {
  // Dix articles d'affilée sans revenir à la liste : le champ se vide, la
  // feuille reste, et chaque ajout garde son ✕ tant qu'elle est ouverte.
  await createArticle(page, 'Lait');
  await expect(input(page)).toBeVisible();
  await expect(input(page)).toHaveValue('');

  await createArticle(page, 'Pain');

  await expect(page.getByText('2 articles ajoutés')).toBeVisible();
  await expect(page.locator('sl-add-bar .chip')).toHaveCount(2);

  await page.getByRole('button', { name: 'Retirer Pain de la liste' }).click();

  await expect(page.getByText('1 article ajouté')).toBeVisible();
  await expect(row(page, 'Pain')).toHaveCount(0);
  await expect(row(page, 'Lait')).toBeVisible();

  // « Terminé » ferme tout, et la pile de pastilles avec.
  await closeAdd(page);
  await expect(page.locator('sl-add-bar .chip')).toHaveCount(0);
});

test('cocher déplace l’article dans le panier', async ({ page }) => {
  await createArticle(page, 'Pain');
  await closeAdd(page);

  await row(page, 'Pain').getByRole('checkbox').click();

  await expect(page.getByText('Tout est dans le panier')).toBeVisible();

  await page.getByRole('button', { name: /Dans le panier \(1\)/ }).click();
  await expect(row(page, 'Pain').first()).toBeVisible();
});

test('l’historique propose les articles déjà saisis', async ({ page }) => {
  // Le geste central de l'application : refaire la liste sans rien retaper.
  await createArticle(page, 'Yaourt');
  await closeAdd(page);

  await removeArticle(page, 'Yaourt');
  await expect(row(page, 'Yaourt')).toHaveCount(0);

  await openAdd(page);
  await input(page).fill('yao');

  const suggestion = page.locator('.suggestion').filter({ hasText: 'Yaourt' });
  await expect(suggestion).toBeVisible();

  await suggestion.click();
  await expect(row(page, 'Yaourt')).toBeVisible();
});

test('ne propose pas de créer un doublon d’un produit connu', async ({
  page,
}) => {
  await createArticle(page, 'Lait');

  await input(page).fill('Lait');

  // Le produit existe déjà : proposer « Créer » fabriquerait un doublon dans
  // l'historique, ce qui ruinerait ce à quoi il sert.
  await expect(
    page.getByRole('button', { name: 'Créer « Lait »' }),
  ).toHaveCount(0);
});

test('la liste survit à un rechargement', async ({ page }) => {
  await createArticle(page, 'Pommes');
  await closeAdd(page);
  await expect(row(page, 'Pommes')).toBeVisible();

  await page.reload();

  // Rechargée depuis IndexedDB, sans aucun réseau.
  await expect(row(page, 'Pommes')).toBeVisible();
});

test('vider le panier retire les articles cochés et garde les autres', async ({
  page,
}) => {
  await createArticle(page, 'Lait');
  await createArticle(page, 'Pain');
  await closeAdd(page);

  await row(page, 'Lait').getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Vider' }).click();

  await expect(row(page, 'Lait')).toHaveCount(0);
  await expect(row(page, 'Pain')).toBeVisible();
});

test('glisser à droite coche, glisser à gauche retire', async ({ page }) => {
  // Les deux gestes du pouce, ceux qu'on fait en poussant un caddie.
  await createArticle(page, 'Lait');
  await createArticle(page, 'Pain');
  await closeAdd(page);

  await swipe(page, 'Lait', 120);

  await expect(
    page.getByRole('button', { name: /Dans le panier \(1\)/ }),
  ).toBeVisible();
  // Un seul basculement : le clic qui suit le glissé ne doit pas décocher.
  await expect(page.getByText('1 restant')).toBeVisible();

  await swipe(page, 'Pain', -120);

  await expect(row(page, 'Pain')).toHaveCount(0);
  await expect(page.getByText('Tout est dans le panier')).toBeVisible();
});

test('un glissé trop court ne fait rien', async ({ page }) => {
  await createArticle(page, 'Lait');
  await closeAdd(page);

  await swipe(page, 'Lait', 40);

  await expect(page.getByText('1 restant')).toBeVisible();
  await expect(row(page, 'Lait')).toBeVisible();
});

test('la recherche pardonne les lettres manquantes', async ({ page }) => {
  // La feuille reste ouverte entre deux ajouts : on enchaîne, puis on cherche.
  await createArticle(page, 'Chocolat');
  await createArticle(page, 'Lait');
  await input(page).fill('lat');

  // « lat » n'est une sous-chaîne d'aucun des deux : c'est le fuzzy match qui
  // les sort, et le surlignage qui explique pourquoi.
  const suggestions = page.locator('sl-add-bar .suggestion');
  await expect(suggestions).toHaveCount(2);
  await expect(suggestions.first().locator('mark').first()).toBeVisible();
});

test('vider la liste garde l’historique', async ({ page }) => {
  await createArticle(page, 'Lait');
  await createArticle(page, 'Pain');
  await closeAdd(page);

  // Se raviser doit rester possible : le geste est sans retour en arrière.
  await page.getByLabel('Menu de la liste').click();
  await page.getByRole('menuitem', { name: 'Vider la liste' }).click();
  await expect(page.getByText(/Retirer les 2 articles/)).toBeVisible();
  await page.getByRole('menuitem', { name: 'Annuler' }).click();
  await expect(row(page, 'Lait')).toBeVisible();

  await page.getByLabel('Menu de la liste').click();
  await page.getByRole('menuitem', { name: 'Vider la liste' }).click();
  await page.getByRole('menuitem', { name: 'Vider', exact: true }).click();

  await expect(page.getByText('La liste est vide')).toBeVisible();

  // Le catalogue, lui, est intact : c'est toute la différence entre vider la
  // liste et vider l'historique.
  await openAdd(page);
  await expect(page.locator('.suggestion')).toHaveCount(2);
});

test('distingue deux produits de même libellé par leur description', async ({
  page,
}) => {
  await createArticle(page, 'Yaourt');
  await closeAdd(page);

  await expect(row(page, 'Yaourt')).toHaveCount(1);
});

test('modifier un produit se répercute sur la liste', async ({ page }) => {
  await createArticle(page, 'Yaourt');
  await closeAdd(page);

  await editArticle(page, 'Yaourt');

  await expect(page).toHaveURL(/\/produit\//);
  await page.getByLabel('Description').fill('à la vanille');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page).toHaveURL(/\/liste$/);
  await expect(row(page, 'à la vanille')).toBeVisible();
});

test('archiver un produit le retire des suggestions', async ({ page }) => {
  await createArticle(page, 'Bougie');
  await closeAdd(page);
  await removeArticle(page, 'Bougie');

  // Le produit reste dans le catalogue : on le retrouve par les suggestions.
  await openAdd(page);
  await expect(page.locator('.suggestion')).toHaveCount(1);
  await page.locator('.suggestion').click();
  await closeAdd(page);

  await editArticle(page, 'Bougie');
  await page.getByRole('button', { name: 'Archiver' }).click();

  await removeArticle(page, 'Bougie');
  await openAdd(page);

  // Archivé : plus proposé, mais toujours présent dans l'historique.
  await expect(page.locator('.suggestion')).toHaveCount(0);
});

test('la pastille de synchro mène à l’écran d’appairage', async ({ page }) => {
  // Sans appairage, on annonce « appareil seul » : rien n'est en panne.
  await expect(page.locator('sl-sync-badge')).toHaveAttribute(
    'data-status',
    'unpaired',
  );
  await expect(page.locator('sl-sync-badge')).toContainText('Appareil seul');

  await page.getByLabel('Synchronisation').click();

  await expect(page).toHaveURL(/\/synchronisation$/);
  await expect(
    page.getByRole('heading', { name: 'Synchronisation' }),
  ).toBeVisible();
  await expect(page.getByLabel('Compte GitHub')).toBeVisible();
});

test('refuse un appairage vers un dépôt inaccessible', async ({ page }) => {
  await page.route('https://api.github.com/**', (route) =>
    route.fulfill({ status: 404, body: '{}' }),
  );

  await page.getByLabel('Synchronisation').click();
  await page.getByLabel('Compte GitHub').fill('evanliomain');
  await page.getByLabel('Dépôt privé').fill('inexistant');
  await page.getByLabel("Jeton d'accès").fill('github_pat_faux');
  await page.getByRole('button', { name: 'Connecter' }).click();

  // On vérifie l'accès AVANT d'enregistrer : découvrir un jeton invalide au
  // milieu des courses serait bien pire qu'une erreur ici.
  await expect(page.getByRole('alert')).toContainText('Dépôt introuvable');
  await expect(page.getByLabel('Compte GitHub')).toBeVisible();
});

test('l’échange de proximité est accessible sans réseau', async ({ page }) => {
  await page.getByLabel('Synchronisation').click();
  await page.getByRole('link', { name: 'Échanger à proximité' }).click();

  await expect(page).toHaveURL(/\/proximite$/);
  await expect(page.getByText('Trois codes, deux scans')).toBeVisible();

  // Celui qui commence n'a pas besoin de caméra : il affiche.
  await page
    .getByRole('button', { name: 'Je commence — montrer un code' })
    .click();

  await expect(page.locator('img[alt="Code à scanner"]')).toBeVisible();
  await expect(
    page.getByText("Faites scanner ce code par l'autre téléphone."),
  ).toBeVisible();
});

test('l’historique permet de retrouver et d’archiver', async ({ page }) => {
  await createArticle(page, 'Bougie');
  await closeAdd(page);

  await page.getByLabel('Historique').click();
  await expect(page).toHaveURL(/\/historique$/);
  await expect(page.locator('li').filter({ hasText: 'Bougie' })).toBeVisible();

  await page.getByRole('button', { name: 'Archiver' }).click();

  // Archivé : masqué par défaut, mais toujours là.
  await expect(page.locator('li')).toHaveCount(0);
  await page.getByText('Afficher le 1 produit archivé').click();
  await expect(page.locator('li').filter({ hasText: 'Bougie' })).toBeVisible();

  await page.getByRole('button', { name: 'Réactiver' }).click();
  await expect(page.locator('li').filter({ hasText: 'Bougie' })).toBeVisible();
});
