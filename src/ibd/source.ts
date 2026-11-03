/**
 * Where the tablespace bytes come from. Reading by range keeps a multi-gigabyte file out of memory:
 * the map needs only each page's headers, and a page's detail is read when it is opened.
 */
export interface IbdSource {
  name: string;
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** A File the user picked or dropped. Nothing leaves the browser: Blob.slice reads it locally. */
export function blobSource(blob: Blob, name: string): IbdSource {
  return {
    name,
    size: blob.size,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  };
}

export function bytesSource(bytes: Uint8Array, name: string): IbdSource {
  return {
    name,
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  };
}

/** The bundled sample is gzipped; a host may also have undone that already, so check the magic. */
export async function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
