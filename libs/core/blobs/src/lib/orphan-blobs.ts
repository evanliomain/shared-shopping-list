/**
 * Quelles photos locales peuvent être effacées.
 *
 * Le stockage est adressé par contenu, donc immuable : rien ne supprime jamais
 * une entrée en même temps qu'on retire sa référence. Remplacer la photo d'un
 * produit, ou revenir à un emoji, laisse simplement l'ancienne derrière — et
 * `onPhotoPicked` enregistre même avant que la fiche soit validée. Sans ménage,
 * IndexedDB grossit sans borne.
 *
 * La décision vit ici, séparée de l'entrée-sortie, parce que le magasin
 * lui-même n'est pas testable : jsdom n'implémente pas IndexedDB.
 */

/** Le strict nécessaire pour décider, sans charger les pixels. */
export interface BlobMeta {
  readonly hash: string;
  readonly storedAt: number;
}

/** Sept jours. */
export const DEFAULT_BLOB_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Les empreintes à effacer : ni référencées, ni récentes.
 *
 * Le délai de grâce n'est pas de la prudence décorative. Une photo peut être
 * légitimement orpheline pendant un moment : après un échange par QR, un
 * produit arrive parfois avant son image, et une photo prise sur cet appareil
 * attend que la fiche soit enregistrée. Effacer sans fenêtre reviendrait à
 * supprimer une image sur le point de devenir référencée.
 *
 * `reachable` doit couvrir **tout** le catalogue, produits archivés compris :
 * désarchiver rétablit la fiche, donc sa photo doit avoir survécu.
 */
export function orphanBlobsToDelete(input: {
  readonly stored: readonly BlobMeta[];
  readonly reachable: ReadonlySet<string>;
  readonly now: number;
  readonly graceMs?: number;
}): string[] {
  const { stored, reachable, now, graceMs = DEFAULT_BLOB_GRACE_MS } = input;

  return stored
    .filter(
      (meta) => !reachable.has(meta.hash) && meta.storedAt + graceMs <= now,
    )
    .map((meta) => meta.hash);
}
