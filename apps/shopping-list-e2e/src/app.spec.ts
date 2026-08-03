import { expect, test } from './support/fixtures';

test('la racine redirige vers la liste', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/liste$/);
  await expect(page.locator('h1')).toHaveText('Nos courses');
});

test('le manifeste PWA est servi et bien formé', async ({ page, request }) => {
  await page.goto('/');

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    'manifest.webmanifest',
  );

  const manifest = await (await request.get('/manifest.webmanifest')).json();

  expect(manifest.name).toBe('Liste de courses');
  expect(manifest.display).toBe('standalone');
  // Android exige une icône maskable, sinon il rogne le logo dans un cercle.
  expect(
    manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable'),
  ).toBe(true);
});

test('les icônes référencées existent vraiment', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();

  for (const icon of manifest.icons as Array<{ src: string }>) {
    const response = await request.get(`/${icon.src}`);
    expect(response.status(), `${icon.src} doit être servi`).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }
});
