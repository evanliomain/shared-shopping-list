import QRCode from 'qrcode';

/**
 * Niveau de correction d'erreur.
 *
 * `M` (~15 %) est le bon compromis pour un écran de téléphone lu par un autre
 * téléphone : `L` casse dès qu'un reflet traverse le code, `H` fait grossir les
 * modules au point de réduire la capacité utile.
 */
const ERROR_CORRECTION = 'M';

export interface QrOptions {
  readonly margin?: number;
}

/**
 * Rend une charge utile en QR, sous forme de SVG.
 *
 * SVG plutôt que canvas, pour trois raisons : le rendu reste net quelle que
 * soit la densité d'écran (ce qui compte quand l'autre téléphone doit le lire),
 * il ne dépend pas d'un canvas — donc il est testable —, et le résultat est
 * plus léger qu'un PNG.
 *
 * Le noir sur blanc est forcé quel que soit le thème : un QR en couleurs
 * inversées n'est pas lu par tous les scanners, et le contraste maximal est ce
 * qui compte quand on scanne un écran en pleine lumière.
 */
export async function renderQrSvg(
  payload: string,
  options: QrOptions = {},
): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: options.margin ?? 2,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
}

/** Le même SVG, prêt à être posé dans un `src` d'image. */
export async function renderQrDataUrl(
  payload: string,
  options: QrOptions = {},
): Promise<string> {
  const svg = await renderQrSvg(payload, options);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Capacité utile d'un QR, en octets, pour le niveau de correction retenu.
 *
 * En dessous de la version 40 théorique : au-delà d'environ 1 200 octets les
 * modules deviennent trop fins pour être lus depuis l'écran d'un autre
 * téléphone. C'est cette limite pratique, et non celle du format, qui
 * dimensionnera le découpage en trames du lot 4.
 */
export const QR_PRACTICAL_CAPACITY_BYTES = 1200;
