export type PickedFile = { file: File; path: string };

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const collected: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(collected);
          return;
        }
        collected.push(...batch);
        next();
      }, reject);
    next();
  });
}

async function walk(entry: FileSystemEntry, prefix: string, output: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    output.push({ file, path: `${prefix}${file.name}` });
    return;
  }
  if (entry.isDirectory) {
    const directory = entry as FileSystemDirectoryEntry;
    const children = await readEntries(directory.createReader());
    for (const child of children) await walk(child, `${prefix}${directory.name}/`, output);
  }
}

/** Carpetas arrastradas: conserva la estructura relativa y detecta anidamiento. */
export async function filesFromDrop(transfer: DataTransfer): Promise<PickedFile[]> {
  const items = Array.from(transfer.items ?? []);
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (!entries.length) {
    return Array.from(transfer.files ?? []).map((file) => ({ file, path: file.name }));
  }

  const output: PickedFile[] = [];
  for (const entry of entries) await walk(entry, "", output);
  return output;
}

export function filesFromInput(input: HTMLInputElement): PickedFile[] {
  return Array.from(input.files ?? []).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}
