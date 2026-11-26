import { Zip, ZipPassThrough } from "fflate";

export type ZipEntry = {
  path: string;
  size: number;
  load: () => Promise<Blob>;
};

/** Crea el zip por streaming: solo un archivo en memoria a la vez. */
export async function createZip(
  entries: ZipEntry[],
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const output: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) {
      failure = error;
      return;
    }
    output.push(chunk);
  });

  const total = entries.reduce((sum, entry) => sum + entry.size, 0) || 1;
  let processed = 0;

  for (const entry of entries) {
    if (failure) break;
    if (signal?.aborted) throw new DOMException("Operacion cancelada", "AbortError");
    const file = new ZipPassThrough(entry.path);
    zip.add(file);
    const blob = await entry.load();
    const reader = blob.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      file.push(value, false);
      processed += value.length;
      onProgress?.(Math.min(1, processed / total));
    }
    file.push(new Uint8Array(0), true);
    processed += Math.max(0, entry.size - blob.size);
    onProgress?.(Math.min(1, processed / total));
  }

  zip.end();
  if (failure) throw failure;
  return new Blob(output as unknown as BlobPart[], { type: "application/zip" });
}

/** Ruta dentro del zip relativa a la carpeta descargada. */
export function relativePath(
  nodes: { id: string; parent_id: string | null; name: string }[],
  nodeId: string,
  rootId: string,
): string {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const parts: string[] = [];
  let current = byId.get(nodeId);
  const seen = new Set<string>();
  while (current && current.id !== rootId) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    parts.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return parts.join("/");
}
