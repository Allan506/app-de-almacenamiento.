import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createZip, relativePath, type ZipEntry } from "../src/lib/zip";
import type { VaultNode } from "../src/lib/types";

const entry = (path: string, text: string): ZipEntry => ({
  path,
  size: new TextEncoder().encode(text).length,
  load: async () => new Blob([text]),
});

describe("createZip", () => {
  it("empaqueta varios archivos y conserva rutas y contenido", async () => {
    const progress: number[] = [];
    const blob = await createZip(
      [entry("documentos/informe.pdf", "contenido pdf"), entry("documentos/fotos/verano.txt", "playa")],
      (ratio) => progress.push(ratio),
    );
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const decode = (name: string) => new TextDecoder().decode(files[name]);
    expect(decode("documentos/informe.pdf")).toBe("contenido pdf");
    expect(decode("documentos/fotos/verano.txt")).toBe("playa");
    expect(progress.at(-1)).toBe(1);
  });

  it("genera un zip valido sin archivos", async () => {
    const blob = await createZip([]);
    expect(Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer())))).toEqual([]);
  });
});

describe("relativePath", () => {
  const nodes: VaultNode[] = [
    {
      id: "root",
      parent_id: null,
      name: "Proyecto",
      kind: "folder",
      size: 0,
      mime_type: "inode/directory",
      chunks: [],
      blob_key: null,
      is_favorite: false,
      created_at: "",
      updated_at: "",
      deleted_at: null,
      trash_id: null,
    },
    {
      id: "sub",
      parent_id: "root",
      name: "docs",
      kind: "folder",
      size: 0,
      mime_type: "inode/directory",
      chunks: [],
      blob_key: null,
      is_favorite: false,
      created_at: "",
      updated_at: "",
      deleted_at: null,
      trash_id: null,
    },
    {
      id: "file",
      parent_id: "sub",
      name: "cv.pdf",
      kind: "file",
      size: 10,
      mime_type: "application/pdf",
      chunks: [],
      blob_key: null,
      is_favorite: false,
      created_at: "",
      updated_at: "",
      deleted_at: null,
      trash_id: null,
    },
  ];

  it("quita la carpeta raiz de la ruta", () => {
    expect(relativePath(nodes, "file", "root")).toBe("docs/cv.pdf");
  });
});
