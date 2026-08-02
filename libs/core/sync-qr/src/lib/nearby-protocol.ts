import * as Y from 'yjs';

/**
 * Protocole d'échange de proximité, en trois codes et deux scans.
 *
 * ```
 * Tél. A                              Tél. B
 * ──────                              ──────
 * [1] affiche stateVector(A)   ──►    scanne
 *                                     calcule diff B→A
 *                                     affiche { stateVector(B), diff B→A }
 * [2] scanne                   ◄──
 *     applique diff B→A
 *     calcule diff A→B
 *     affiche diff A→B
 *                              ──►    [3] scanne
 *                                     applique diff A→B
 * ```
 *
 * On échange des **différences**, jamais l'état complet. C'est ce qui rend
 * l'échange faisable : un catalogue de 300 produits pèse une dizaine de
 * kilo-octets compressés, soit une quinzaine de QR — infaisable à scanner. En
 * rayon, la différence entre les deux téléphones se limite à quelques cases
 * cochées, donc à **une seule trame**.
 */

export const MESSAGE_STATE_VECTOR = 1;
export const MESSAGE_DIFF_AND_VECTOR = 2;
export const MESSAGE_DIFF = 3;

export type NearbyMessage =
  | { readonly kind: typeof MESSAGE_STATE_VECTOR; readonly vector: Uint8Array }
  | {
      readonly kind: typeof MESSAGE_DIFF_AND_VECTOR;
      readonly vector: Uint8Array;
      readonly diff: Uint8Array;
    }
  | { readonly kind: typeof MESSAGE_DIFF; readonly diff: Uint8Array };

/**
 * Enveloppe binaire : un octet de type, puis les segments, chacun précédé de sa
 * longueur sur 32 bits. Pas de JSON — encoder du binaire en texte pour le
 * réencoder ensuite gaspillerait un tiers de la capacité du QR.
 */
export function encodeMessage(message: NearbyMessage): Uint8Array {
  const segments =
    MESSAGE_STATE_VECTOR === message.kind
      ? [message.vector]
      : MESSAGE_DIFF === message.kind
        ? [message.diff]
        : [message.vector, message.diff];

  const size =
    1 + segments.reduce((sum, segment) => sum + 4 + segment.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);

  out[0] = message.kind;
  let offset = 1;
  for (const segment of segments) {
    view.setUint32(offset, segment.length);
    offset += 4;
    out.set(segment, offset);
    offset += segment.length;
  }

  return out;
}

export function decodeMessage(bytes: Uint8Array): NearbyMessage {
  if (0 === bytes.length) {
    throw new Error('Message vide.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = bytes[0];
  let offset = 1;

  const readSegment = (): Uint8Array => {
    if (offset + 4 > bytes.length) {
      throw new Error('Message tronqué.');
    }
    const length = view.getUint32(offset);
    offset += 4;
    if (offset + length > bytes.length) {
      throw new Error('Message tronqué.');
    }
    const segment = bytes.slice(offset, offset + length);
    offset += length;
    return segment;
  };

  switch (kind) {
    case MESSAGE_STATE_VECTOR:
      return { kind: MESSAGE_STATE_VECTOR, vector: readSegment() };
    case MESSAGE_DIFF_AND_VECTOR: {
      const vector = readSegment();
      return { kind: MESSAGE_DIFF_AND_VECTOR, vector, diff: readSegment() };
    }
    case MESSAGE_DIFF:
      return { kind: MESSAGE_DIFF, diff: readSegment() };
    default:
      throw new Error(`Type de message inconnu : ${kind}.`);
  }
}

/** Étape 1 — l'initiateur annonce ce qu'il possède. */
export function announce(doc: Y.Doc): NearbyMessage {
  return { kind: MESSAGE_STATE_VECTOR, vector: Y.encodeStateVector(doc) };
}

/**
 * Étape 2 — le répondeur applique ce qu'il peut donner, et annonce le sien.
 *
 * Il n'applique rien ici : il n'a reçu qu'un vecteur d'état, pas de contenu.
 */
export function respond(doc: Y.Doc, message: NearbyMessage): NearbyMessage {
  if (MESSAGE_STATE_VECTOR !== message.kind) {
    throw new Error("Ce code ne correspond pas à cette étape de l'échange.");
  }

  return {
    kind: MESSAGE_DIFF_AND_VECTOR,
    vector: Y.encodeStateVector(doc),
    diff: Y.encodeStateAsUpdate(doc, message.vector),
  };
}

/** Étape 3 — l'initiateur applique, puis renvoie ce qui manque en face. */
export function completeAsInitiator(
  doc: Y.Doc,
  message: NearbyMessage,
  origin: unknown,
): NearbyMessage {
  if (MESSAGE_DIFF_AND_VECTOR !== message.kind) {
    throw new Error("Ce code ne correspond pas à cette étape de l'échange.");
  }

  Y.applyUpdate(doc, message.diff, origin);

  return {
    kind: MESSAGE_DIFF,
    diff: Y.encodeStateAsUpdate(doc, message.vector),
  };
}

/** Étape 4 — le répondeur applique le dernier différentiel. Fin de l'échange. */
export function completeAsResponder(
  doc: Y.Doc,
  message: NearbyMessage,
  origin: unknown,
): void {
  if (MESSAGE_DIFF !== message.kind) {
    throw new Error("Ce code ne correspond pas à cette étape de l'échange.");
  }

  Y.applyUpdate(doc, message.diff, origin);
}
