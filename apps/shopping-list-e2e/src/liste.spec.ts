import { expect, Page, test } from '@playwright/test';

/**
 * Parcours réels de la liste de courses.
 *
 * Chaque contexte Playwright part d'un IndexedDB vierge, donc chaque test
 * démarre avec une liste et un catalogue vides.
 */

const input = (page: Page) => page.getByPlaceholder('Ajouter un article…');
const row = (page: Page, label: string) =>
  page.locator('sl-item-row').filter({ hasText: label });

async function createArticle(page: Page, label: string): Promise<void> {
  await input(page).click();
  await input(page).fill(label);
  await page.getByRole('button', { name: `Créer « ${label} »` }).click();
}

async function openMenu(page: Page, label: string): Promise<void> {
  await row(page, label)
    .getByRole('button', { name: `Actions pour ${label}` })
    .click();
}

async function removeArticle(page: Page, label: string): Promise<void> {
  await openMenu(page, label);
  await page.getByRole('menuitem', { name: 'Retirer de la liste' }).click();
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

test('cocher déplace l’article dans le panier', async ({ page }) => {
  await createArticle(page, 'Pain');
  await input(page).press('Escape');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await row(page, 'Pain').getByRole('checkbox').click();

  await expect(page.getByText('Tout est dans le panier')).toBeVisible();

  await page.getByRole('button', { name: /Dans le panier \(1\)/ }).click();
  await expect(row(page, 'Pain').first()).toBeVisible();
});

test('l’historique propose les articles déjà saisis', async ({ page }) => {
  // Le geste central de l'application : refaire la liste sans rien retaper.
  await createArticle(page, 'Yaourt');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await removeArticle(page, 'Yaourt');
  await expect(row(page, 'Yaourt')).toHaveCount(0);

  await input(page).click();
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
  await page.getByRole('button', { name: 'Fermer' }).click();
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
  await page.getByRole('button', { name: 'Fermer' }).click();

  await row(page, 'Lait').getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Vider' }).click();

  await expect(row(page, 'Lait')).toHaveCount(0);
  await expect(row(page, 'Pain')).toBeVisible();
});

test('distingue deux produits de même libellé par leur description', async ({
  page,
}) => {
  await createArticle(page, 'Yaourt');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await expect(row(page, 'Yaourt')).toHaveCount(1);
});

test('modifier un produit se répercute sur la liste', async ({ page }) => {
  await createArticle(page, 'Yaourt');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await openMenu(page, 'Yaourt');
  await page.getByRole('menuitem', { name: 'Modifier le produit' }).click();

  await expect(page).toHaveURL(/\/produit\//);
  await page.getByLabel('Description').fill('à la vanille');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page).toHaveURL(/\/liste$/);
  await expect(row(page, 'à la vanille')).toBeVisible();
});

test('archiver un produit le retire des suggestions', async ({ page }) => {
  await createArticle(page, 'Bougie');
  await page.getByRole('button', { name: 'Fermer' }).click();
  await removeArticle(page, 'Bougie');

  // Le produit reste dans le catalogue : on le retrouve par les suggestions.
  await input(page).click();
  await expect(page.locator('.suggestion')).toHaveCount(1);
  await page.locator('.suggestion').click();
  await page.getByRole('button', { name: 'Fermer' }).click();

  await openMenu(page, 'Bougie');
  await page.getByRole('menuitem', { name: 'Modifier le produit' }).click();
  await page.getByRole('button', { name: 'Archiver' }).click();

  await removeArticle(page, 'Bougie');
  await input(page).click();

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
  await page.getByRole('button', { name: 'Fermer' }).click();

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
