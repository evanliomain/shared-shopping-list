import {
  QR_PRACTICAL_CAPACITY_BYTES,
  renderQrDataUrl,
  renderQrSvg,
} from './qr-render';

/** Nombre de modules par côté, lu dans le viewBox du SVG produit. */
function moduleCount(svg: string): number {
  const match = svg.match(/viewBox="0 0 (\d+) \d+"/);
  if (null === match) {
    throw new Error('viewBox introuvable dans le SVG');
  }
  return Number(match[1]);
}

describe('renderQrSvg', () => {
  it('produit un SVG', async () => {
    const svg = await renderQrSvg('bonjour');

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox');
  });

  it('force le noir sur blanc, indépendamment du thème', async () => {
    // Un QR aux couleurs inversées n'est pas lu par tous les scanners.
    const svg = await renderQrSvg('bonjour');

    expect(svg).toContain('#ffffff');
    expect(svg).toContain('#000000');
  });

  it('grossit avec la charge utile', async () => {
    const petit = await renderQrSvg('a');
    const grand = await renderQrSvg('x'.repeat(600));

    expect(moduleCount(grand)).toBeGreaterThan(moduleCount(petit));
  });

  it('encode un appairage complet sans dépasser la capacité pratique', async () => {
    // Le cas réel : un QR d'appairage doit tenir en un seul code lisible.
    const pairing = JSON.stringify({
      v: 1,
      owner: 'evanliomain',
      repo: 'shopping-list-data',
      token: `github_pat_${'x'.repeat(82)}`,
      branch: 'main',
      path: 'state.bin',
    });

    expect(new TextEncoder().encode(pairing).length).toBeLessThan(
      QR_PRACTICAL_CAPACITY_BYTES,
    );
    await expect(renderQrSvg(pairing)).resolves.toContain('<svg');
  });
});

describe('renderQrDataUrl', () => {
  it('rend une data URL utilisable dans un src d’image', async () => {
    const url = await renderQrDataUrl('bonjour');

    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.split(',')[1])).toContain('<svg');
  });
});
