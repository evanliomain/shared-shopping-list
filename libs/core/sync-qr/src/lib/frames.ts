import { TranslatableError } from '@shopping-list/util/i18n';

import { compress, decompress } from './compression';

/**
 * Découpage d'une charge binaire en trames affichables sous forme de QR codes,
 * et réassemblage à la lecture.
 *
 * Format d'une trame :
 *
 *     SL1|<session>|<index>|<total>|<empreinte>|<données base64url>
 *
 * L'empreinte porte sur la charge **complète**, pas sur la trame : elle sert à
 * rejeter un mélange de deux sessions et à détecter une corruption au
 * réassemblage.
 */

const MAGIC = 'SL1';
const SEPARATOR = '|';

/**
 * Octets utiles par trame.
 *
 * Choisi bien en dessous de la capacité théorique d'un QR (2 953 octets en
 * version 40) : au-delà, les modules deviennent trop fins pour être lus depuis
 * l'écran d'un autre téléphone, surtout en lumière de supermarché.
 */
export const FRAME_PAYLOAD_BYTES = 700;

/**
 * Au-delà, on refuse.
 *
 * Dix trames à 5 images par seconde font déjà deux secondes par tour de boucle,
 * et il faut souvent plusieurs tours. Mieux vaut dire honnêtement « refaites-le
 * avec du réseau » que d'imposer une minute de scan à bout de bras.
 */
export const MAX_FRAMES = 10;

export class PayloadTooLargeError extends TranslatableError {
  constructor(readonly frames: number) {
    super('errors.nearby.tooLarge', { frames });
    this.name = 'PayloadTooLargeError';
  }
}

// ── base64url ────────────────────────────────────────────────────────────────
// Le base64 standard contient « + », « / » et « = », qui obligeraient le QR à
// passer en mode octet. En base64url on reste dans un alphabet plus compact.

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Empreinte courte et non cryptographique — on détecte une corruption, pas une attaque. */
function fingerprint(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export interface EncodedExchange {
  readonly session: string;
  readonly frames: readonly string[];
}

/**
 * Compresse puis découpe une charge en trames prêtes à être affichées.
 *
 * @throws {PayloadTooLargeError} au-delà de `MAX_FRAMES`.
 */
export async function encodeFrames(
  payload: Uint8Array,
  session: string,
): Promise<EncodedExchange> {
  const compressed = await compress(payload);
  const digest = fingerprint(compressed);

  const total = Math.max(1, Math.ceil(compressed.length / FRAME_PAYLOAD_BYTES));
  if (total > MAX_FRAMES) {
    throw new PayloadTooLargeError(total);
  }

  const frames: string[] = [];
  for (let index = 0; index < total; index++) {
    const slice = compressed.subarray(
      index * FRAME_PAYLOAD_BYTES,
      (index + 1) * FRAME_PAYLOAD_BYTES,
    );
    frames.push(
      [MAGIC, session, index, total, digest, toBase64Url(slice)].join(
        SEPARATOR,
      ),
    );
  }

  return { session, frames };
}

interface ParsedFrame {
  readonly session: string;
  readonly index: number;
  readonly total: number;
  readonly digest: string;
  readonly data: Uint8Array;
}

function parseFrame(raw: string): ParsedFrame | null {
  const parts = raw.split(SEPARATOR);
  if (6 !== parts.length || MAGIC !== parts[0]) {
    return null;
  }

  const [, session, index, total, digest, data] = parts;
  const parsedIndex = Number(index);
  const parsedTotal = Number(total);

  if (
    !Number.isInteger(parsedIndex) ||
    !Number.isInteger(parsedTotal) ||
    parsedTotal < 1 ||
    parsedIndex < 0 ||
    parsedIndex >= parsedTotal
  ) {
    return null;
  }

  try {
    return {
      session,
      index: parsedIndex,
      total: parsedTotal,
      digest,
      data: fromBase64Url(data),
    };
  } catch {
    return null;
  }
}

export interface CollectorProgress {
  readonly received: number;
  readonly total: number;
}

/**
 * Rassemble les trames au fil des lectures.
 *
 * Les trames défilent en boucle : le récepteur n'a pas besoin de les voir dans
 * l'ordre, ni du premier coup. Il rattrape ce qui lui manque au tour suivant, ce
 * qui évite d'avoir à synchroniser les deux téléphones.
 */
export class FrameCollector {
  private session: string | null = null;
  private digest: string | null = null;
  private total = 0;
  private readonly received = new Map<number, Uint8Array>();

  get progress(): CollectorProgress {
    return { received: this.received.size, total: this.total };
  }

  /**
   * @returns `true` si la trame appartient à l'échange en cours et a été
   *          retenue ; `false` si elle est illisible ou étrangère.
   */
  accept(raw: string): boolean {
    const frame = parseFrame(raw);
    if (null === frame) {
      return false;
    }

    // Une session inconnue alors qu'on en suivait une autre : l'utilisateur a
    // recommencé en face. On repart de zéro plutôt que de mélanger.
    if (null !== this.session && frame.session !== this.session) {
      this.reset();
    }

    this.session = frame.session;
    this.digest = frame.digest;
    this.total = frame.total;
    this.received.set(frame.index, frame.data);

    return true;
  }

  get complete(): boolean {
    return 0 < this.total && this.received.size === this.total;
  }

  /** Recompose et décompresse. `null` tant qu'il manque des trames. */
  async payload(): Promise<Uint8Array | null> {
    if (!this.complete) {
      return null;
    }

    const parts: Uint8Array[] = [];
    for (let index = 0; index < this.total; index++) {
      const part = this.received.get(index);
      if (undefined === part) {
        return null;
      }
      parts.push(part);
    }

    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const compressed = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      compressed.set(part, offset);
      offset += part.length;
    }

    if (fingerprint(compressed) !== this.digest) {
      // Trames de deux sessions mélangées, ou lecture corrompue. On repart
      // plutôt que de livrer des octets faux au CRDT.
      this.reset();
      throw new TranslatableError('errors.nearby.corrupted');
    }

    return decompress(compressed);
  }

  reset(): void {
    this.session = null;
    this.digest = null;
    this.total = 0;
    this.received.clear();
  }
}
