import { TranslatableError } from '@shopping-list/util/i18n';

import {
  BankImage,
  BankProvider,
  PER_PROVIDER,
  stripHtml,
} from '../bank-image';

/**
 * [Wikimedia Commons](https://commons.wikimedia.org) — le fonds sûr.
 *
 * Openverse l'indexe déjà en partie, mais l'interroger en direct rapporte deux
 * choses : une couverture plus large que le sous-ensemble indexé, et une
 * disponibilité que rien n'égale dans cette liste. Quand les deux autres
 * fournisseurs sont à terre, celui-là répond.
 *
 * Ses photos sont plus documentaires que léchées — d'où sa place en dernier
 * quand il s'agit de choisir d'office.
 */
const ENDPOINT = 'https://commons.wikimedia.org/w/api.php';

/**
 * `origin=*` n'est pas décoratif : l'API MediaWiki n'envoie l'en-tête CORS que
 * si on le lui demande explicitement. Sans ce paramètre, le navigateur refuse la
 * réponse.
 *
 * `filetype:bitmap` écarte les SVG, qui sont ici des schémas et des logos — on
 * cherche une photo de produit, pas un diagramme.
 */
function url(query: string): string {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: `${PER_PROVIDER}`,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '320',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ObjectName',
  });

  return `${ENDPOINT}?${params.toString()}`;
}

interface MetadataValue {
  readonly value?: unknown;
}

interface ImageInfo {
  readonly thumburl?: string;
  readonly descriptionurl?: string;
  readonly extmetadata?: Readonly<Record<string, MetadataValue>>;
}

interface Page {
  readonly title?: string;
  readonly imageinfo?: readonly ImageInfo[];
}

interface WikimediaResponse {
  readonly query?: { readonly pages?: Readonly<Record<string, Page>> };
}

function metadata(info: ImageInfo, key: string): string {
  const value = info.extmetadata?.[key]?.value;
  return 'string' === typeof value ? stripHtml(value) : '';
}

function toBankImage(id: string, page: Page): BankImage | null {
  const info = page.imageinfo?.[0];
  const thumbUrl = info?.thumburl;
  // L'auteur est le seul champ qui décide : sans lui on ne peut pas créditer.
  const author = undefined === info ? '' : metadata(info, 'Artist');

  if (undefined === info || undefined === thumbUrl || '' === author) {
    return null;
  }

  return {
    id,
    provider: 'wikimedia',
    thumbUrl,
    credit: {
      title: metadata(info, 'ObjectName'),
      author,
      license: metadata(info, 'LicenseShortName'),
      licenseUrl: metadata(info, 'LicenseUrl'),
      sourceUrl: info.descriptionurl ?? '',
    },
  };
}

async function search(
  query: string,
  fetchImpl: typeof fetch,
): Promise<readonly BankImage[]> {
  const response = await fetchImpl(url(query));

  if (!response.ok) {
    throw new TranslatableError('errors.imageBank.providerFailed', {
      provider: 'Wikimedia Commons',
      status: response.status,
    });
  }

  const body = (await response.json()) as WikimediaResponse;

  // Aucune correspondance : MediaWiki omet `query` au lieu de rendre une liste
  // vide.
  return Object.entries(body.query?.pages ?? {})
    .map(([id, page]) => toBankImage(id, page))
    .filter((image): image is BankImage => null !== image);
}

export const wikimediaProvider: BankProvider = { id: 'wikimedia', search };
