import { expect, test } from '@playwright/test';

/**
 * La langue vient du navigateur, et de rien d'autre : ni réglage dans
 * l'application, ni paramètre d'URL. C'est le seul choix qui n'a pas besoin
 * d'être expliqué à quelqu'un qui ouvre l'app pour la première fois au milieu
 * d'un rayon.
 */

test.describe('navigateur en anglais', () => {
  test.use({ locale: 'en-GB' });

  test('sert l’application en anglais', async ({ page }) => {
    await page.goto('/liste');

    await expect(page.locator('h1')).toHaveText('Our groceries');
    await expect(page.getByPlaceholder('Add an item…')).toBeVisible();

    // Jusqu'aux libellés que seul le CSS ou l'assistance vocale lisent.
    await expect(page.getByLabel('History')).toBeVisible();
    await expect(page.locator('sl-sync-badge')).toContainText(
      'this device only',
    );
  });

  test('accorde les libellés selon la règle anglaise', async ({ page }) => {
    await page.goto('/liste');

    const input = page.getByPlaceholder('Add an item…');
    await input.click();
    await input.fill('Milk');
    await page.getByRole('button', { name: 'Create “Milk”' }).click();

    // « 1 item », pas « 1 items ».
    await expect(page.getByText('1 item to pick up')).toBeVisible();

    // « Milk » doit être reconnu et rangé au rayon crèmerie, traduit :
    // le dictionnaire de mots-clés ne suit pas la langue de l'interface.
    await expect(page.getByRole('heading', { name: /Dairy/ })).toBeVisible();
  });

  test('annonce la langue au document et à l’installation', async ({
    page,
  }) => {
    await page.goto('/liste');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Shopping list');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      'manifest.en.webmanifest',
    );
  });
});

test.describe('navigateur dans une langue non traduite', () => {
  test.use({ locale: 'de-DE' });

  test('retombe sur la langue source', async ({ page }) => {
    await page.goto('/liste');

    await expect(page.locator('h1')).toHaveText('Nos courses');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});

test.describe('navigateur en français', () => {
  test('annonce la langue au document et à l’installation', async ({
    page,
  }) => {
    await page.goto('/liste');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page).toHaveTitle('Liste de courses');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      'manifest.webmanifest',
    );
  });

  test('sert un manifeste anglais complet à côté du français', async ({
    request,
  }) => {
    const manifest = await (
      await request.get('/manifest.en.webmanifest')
    ).json();

    expect(manifest.name).toBe('Shopping list');
    expect(manifest.lang).toBe('en');
    // Mêmes icônes que le français : seuls les libellés changent.
    expect(manifest.icons).toHaveLength(4);
  });
});
