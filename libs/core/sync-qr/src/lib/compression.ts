/**
 * Compression via `CompressionStream`, native depuis Safari 16.4 et Chrome 80.
 *
 * `deflate-raw` plutôt que `gzip` : pas d'en-tête ni de somme de contrôle à
 * transporter, et chaque octet économisé compte quand la charge doit tenir dans
 * le moins de QR codes possible.
 */
const FORMAT = 'deflate-raw';

export function isCompressionAvailable(): boolean {
  return 'undefined' !== typeof CompressionStream;
}

/**
 * `CompressionStream` et `DecompressionStream` dérivent de
 * `GenericTransformStream` : côté écriture ils acceptent n'importe quel
 * `BufferSource`, ce qui les rend incompatibles avec un
 * `TransformStream<Uint8Array, Uint8Array>` plus étroit.
 */
async function pump(
  bytes: Uint8Array,
  stream: GenericTransformStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();

  const chunks: Uint8Array[] = [];
  const reader = (stream.readable as ReadableStream<Uint8Array>).getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function compress(bytes: Uint8Array): Promise<Uint8Array> {
  return pump(bytes, new CompressionStream(FORMAT));
}

export function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  return pump(bytes, new DecompressionStream(FORMAT));
}
