import { TranslatableError } from '@shopping-list/util/i18n';
import * as Y from 'yjs';

import {
  announce,
  completeAsInitiator,
  completeAsResponder,
  decodeMessage,
  encodeMessage,
  MESSAGE_DIFF,
  MESSAGE_DIFF_AND_VECTOR,
  MESSAGE_STATE_VECTOR,
  NearbyMessage,
  respond,
} from './nearby-protocol';

const ORIGIN = Symbol('qr');
const VECTEUR = new Uint8Array([1, 2, 3]);
const DIFF = new Uint8Array([250, 0, 7]);

function courses(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>('courses');
}

/** Un téléphone parti du même état qu'un autre, comme après une synchro. */
function clone(source: Y.Doc): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(source));
  return doc;
}

/** Le différentiel porté par un message d'étape 2, 3 ou 4. */
function diffDe(message: NearbyMessage): Uint8Array {
  if (MESSAGE_STATE_VECTOR === message.kind) {
    throw new Error('un vecteur d’état ne porte pas de différentiel');
  }
  return message.diff;
}

/** L'erreur levée, pour inspecter ce qu'elle transporte jusqu'à l'affichage. */
function erreurDe(action: () => unknown): TranslatableError {
  try {
    action();
  } catch (raison) {
    return raison as TranslatableError;
  }
  throw new Error('aucune erreur levée');
}

describe('enveloppe binaire', () => {
  it('fait un aller-retour sur chacun des trois messages', () => {
    const messages: readonly NearbyMessage[] = [
      { kind: MESSAGE_STATE_VECTOR, vector: VECTEUR },
      { kind: MESSAGE_DIFF_AND_VECTOR, vector: VECTEUR, diff: DIFF },
      { kind: MESSAGE_DIFF, diff: DIFF },
    ];

    expect(
      messages.map((message) => decodeMessage(encodeMessage(message))),
    ).toEqual(messages);
  });

  it('garde les deux segments distincts même quand le premier est vide', () => {
    // Un répondeur qui n'a rien à donner annonce quand même son vecteur : sans
    // longueur explicite devant chaque segment, les deux se confondraient.
    const message: NearbyMessage = {
      kind: MESSAGE_DIFF_AND_VECTOR,
      vector: new Uint8Array(),
      diff: DIFF,
    };

    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('refuse un code vide', () => {
    expect(() => decodeMessage(new Uint8Array())).toThrow(
      'errors.nearby.emptyMessage',
    );
  });

  it('refuse une enveloppe qui annonce plus d’octets qu’elle n’en porte', () => {
    expect(() =>
      decodeMessage(new Uint8Array([MESSAGE_DIFF, 0, 0, 0, 12, 1, 2])),
    ).toThrow('errors.nearby.truncatedMessage');
  });

  it('refuse une enveloppe amputée de son dernier segment', () => {
    const complète = encodeMessage({
      kind: MESSAGE_DIFF_AND_VECTOR,
      vector: VECTEUR,
      diff: DIFF,
    });

    expect(() =>
      decodeMessage(complète.subarray(0, complète.length - 1)),
    ).toThrow('errors.nearby.truncatedMessage');
  });

  it('nomme le type de message qu’il ne connaît pas', () => {
    // Une version future du protocole scannée par une version ancienne : mieux
    // vaut le dire à l'utilisateur que fusionner n'importe quoi.
    const erreur = erreurDe(() =>
      decodeMessage(new Uint8Array([9, 0, 0, 0, 0])),
    );

    expect(erreur.key).toBe('errors.nearby.unknownMessage');
    expect(erreur.params).toEqual({ kind: 9 });
  });
});

describe('étapes de l’échange', () => {
  it('refuse un code présenté à la mauvaise étape', () => {
    const doc = new Y.Doc();
    courses(doc).set('a', 'Lait');

    expect(() => respond(doc, { kind: MESSAGE_DIFF, diff: DIFF })).toThrow(
      'errors.nearby.wrongStep',
    );
    expect(() => completeAsInitiator(doc, announce(doc), ORIGIN)).toThrow(
      'errors.nearby.wrongStep',
    );
    expect(() => completeAsResponder(doc, announce(doc), ORIGIN)).toThrow(
      'errors.nearby.wrongStep',
    );
    expect(() =>
      completeAsResponder(doc, respond(doc, announce(doc)), ORIGIN),
    ).toThrow('errors.nearby.wrongStep');
  });

  it('n’applique rien à l’étape 2, faute d’avoir reçu du contenu', () => {
    const phoneA = new Y.Doc();
    courses(phoneA).set('a', 'Lait');
    const phoneB = new Y.Doc();
    const reçues: unknown[] = [];
    phoneB.on('update', () => reçues.push(null));

    respond(phoneB, announce(phoneA));

    // L'étape 2 ne reçoit qu'un vecteur d'état : rien à appliquer, et surtout
    // pas de quoi faire croire à un article arrivé.
    expect(reçues).toEqual([]);
    expect([...courses(phoneB).values()]).toEqual([]);
  });

  it('ne renvoie à la dernière étape que ce qui manque en face', () => {
    const partagé = new Y.Doc();
    courses(partagé).set('p1', 'Lait');
    const phoneA = clone(partagé);
    const phoneB = clone(partagé);
    courses(phoneA).set('p2', 'Pain');

    const dernier = completeAsInitiator(
      phoneA,
      respond(phoneB, announce(phoneA)),
      ORIGIN,
    );

    // Ce que porte le dernier code décide de la faisabilité : le catalogue déjà
    // connu d'en face n'a rien à y faire.
    const reçu = new Y.Doc();
    Y.applyUpdate(reçu, diffDe(dernier));

    expect([...courses(reçu).values()]).toEqual(['Pain']);
  });

  it('marque de l’origine fournie ce que le répondeur applique', () => {
    const phoneA = new Y.Doc();
    courses(phoneA).set('a', 'Lait');
    const phoneB = new Y.Doc();
    courses(phoneB).set('b', 'Pain');

    const origines: unknown[] = [];
    phoneB.on('update', (_u: Uint8Array, origine: unknown) =>
      origines.push(origine),
    );

    const dernier = completeAsInitiator(
      phoneA,
      respond(phoneB, announce(phoneA)),
      ORIGIN,
    );
    completeAsResponder(phoneB, dernier, ORIGIN);

    // Sans cette origine, la mise à jour repartirait vers les autres canaux de
    // synchronisation comme si elle venait de l'utilisateur.
    expect(origines).toEqual([ORIGIN]);
    expect([...courses(phoneB).values()].sort()).toEqual(['Lait', 'Pain']);
  });
});
