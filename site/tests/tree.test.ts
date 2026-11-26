import { describe, expect, it } from "vitest";
import { dedupeName, buildBreadcrumb, buildStats, folderOptions, matchesQuery, pathOf, subtreeIds, wouldCycle } from "../src/lib/tree";
import type { VaultNode } from "../src/lib/types";

const node = (overrides: Partial<VaultNode>): VaultNode => ({
  id: "id",
  parent_id: null,
  name: "archivo.txt",
  kind: "file",
  size: 0,
  mime_type: "text/plain",
  chunks: [],
  blob_key: null,
  is_favorite: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  trash_id: null,
  ...overrides,
});

const tree: VaultNode[] = [
  node({ id: "docs", name: "Documentos", kind: "folder", mime_type: "inode/directory" }),
  node({ id: "2026", name: "2026", kind: "folder", mime_type: "inode/directory", parent_id: "docs" }),
  node({ id: "pdf", name: "informe.pdf", parent_id: "2026", mime_type: "application/pdf", size: 1200 }),
  node({ id: "img", name: "foto.png", parent_id: "docs", mime_type: "image/png", size: 300 }),
  node({ id: "root-file", name: "notas.md", mime_type: "text/markdown", size: 25 }),
];

describe("dedupeName", () => {
  it("anade contador solo cuando hay conflicto entre hermanos vivos", () => {
    expect(dedupeName(tree, null, "notas.md")).toBe("notas (1).md");
    expect(dedupeName(tree, "docs", "foto.png")).toBe("foto (1).png");
    expect(dedupeName(tree, "docs", "foto.png", "img")).toBe("foto.png");
    expect(dedupeName(tree, null, "nuevo.txt")).toBe("nuevo.txt");
    // Nombres reservados por otra subida en paralelo dentro de la misma carpeta.
    expect(dedupeName(tree, null, "nuevo.txt", undefined, new Set(["nuevo.txt"]))).toBe("nuevo (1).txt");
  });
});

describe("arbol", () => {
  it("calcula descendientes y evita ciclos", () => {
    expect(subtreeIds(tree, "docs").sort()).toEqual(["2026", "img", "pdf"]);
    expect(wouldCycle(tree, "docs", "2026")).toBe(true);
    expect(wouldCycle(tree, "docs", "docs")).toBe(true);
    expect(wouldCycle(tree, "img", "docs")).toBe(false);
  });

  it("construye breadcrumb y rutas completas", () => {
    expect(buildBreadcrumb(tree, "2026")).toEqual([
      { id: "docs", name: "Documentos" },
      { id: "2026", name: "2026" },
    ]);
    expect(pathOf(tree, tree[2])).toBe("Documentos/2026/informe.pdf");
  });

  it("lista carpetas con profundidad para el selector de destino", () => {
    expect(folderOptions(tree).map((option) => `${"-".repeat(option.depth)}${option.name}`)).toEqual([
      "Mi unidad",
      "-Documentos",
      "--2026",
    ]);
  });

  it("busca sin distinguir mayusculas ni tildes", () => {
    expect(matchesQuery(tree[0], "documentos")).toBe(true);
    expect(matchesQuery(tree[3], "FOTO")).toBe(true);
    expect(matchesQuery(tree[3], "informe")).toBe(false);
  });
});

describe("buildStats", () => {
  it("suma solo archivos vivos y separa la papelera", () => {
    const stats = buildStats([...tree, node({ id: "old", name: "viejo.zip", size: 5000, deleted_at: "2026-02-01T00:00:00.000Z" })], []);
    expect(stats.used).toBe(1525);
    expect(stats.files).toBe(3);
    expect(stats.folders).toBe(2);
    expect(stats.trash_count).toBe(1);
    expect(stats.trash_size).toBe(5000);
    expect(stats.by_type.find((group) => group.label === "Documentos")).toEqual({ label: "Documentos", size: 1225, count: 2 });
  });
});
