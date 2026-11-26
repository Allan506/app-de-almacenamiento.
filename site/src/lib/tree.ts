import { categoryOf, splitName } from "./format";
import type { ActivityEvent, Breadcrumb, SortKey, VaultNode, VaultStats } from "./types";

export function uid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function liveChildren(nodes: VaultNode[], parentId: string | null): VaultNode[] {
  return nodes.filter((node) => node.parent_id === parentId && node.deleted_at === null);
}

export function buildBreadcrumb(nodes: VaultNode[], folderId: string | null): Breadcrumb[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const trail: Breadcrumb[] = [];
  const seen = new Set<string>();
  let current = folderId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = byId.get(current);
    if (!node) break;
    trail.push({ id: node.id, name: node.name });
    current = node.parent_id;
  }
  return trail.reverse();
}

export function subtreeIds(nodes: VaultNode[], rootId: string): string[] {
  const byParent = new Map<string | null, VaultNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }
  const found: string[] = [];
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    const children = byParent.get(current) ?? [];
    for (const child of children) {
      if (child.id === rootId || found.includes(child.id)) continue;
      found.push(child.id);
      queue.push(child.id);
    }
  }
  return found;
}

/** Evita mover una carpeta dentro de si misma o de uno de sus descendientes. */
export function wouldCycle(nodes: VaultNode[], nodeId: string, targetFolderId: string | null): boolean {
  if (!targetFolderId) return false;
  if (nodeId === targetFolderId) return true;
  return subtreeIds(nodes, nodeId).includes(targetFolderId);
}

export function dedupeName(
  nodes: VaultNode[],
  parentId: string | null,
  name: string,
  ignoreId?: string,
  reserved?: Set<string>,
): string {
  const taken = new Set(
    nodes
      .filter((node) => node.parent_id === parentId && node.deleted_at === null && node.id !== ignoreId)
      .map((node) => node.name.toLowerCase()),
  );
  reserved?.forEach((value) => taken.add(value));
  if (!taken.has(name.toLowerCase())) return name;
  const [stem, ext] = splitName(name);
  let counter = 1;
  while (taken.has(`${stem} (${counter})${ext}`.toLowerCase())) counter += 1;
  return `${stem} (${counter})${ext}`;
}

export function matchesKind(node: VaultNode, kind: string): boolean {
  if (!kind || kind === "all") return true;
  if (kind === "folder") return node.kind === "folder";
  if (kind === "document")
    return node.kind === "file" && !node.mime_type.startsWith("image/") && !node.mime_type.startsWith("video/") && !node.mime_type.startsWith("audio/");
  return node.kind === "file" && node.mime_type.startsWith(`${kind}/`);
}

const strip = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function matchesQuery(node: VaultNode, query: string): boolean {
  return strip(node.name).includes(strip(query.trim()));
}

export function sortNodes(nodes: VaultNode[], sort: SortKey): VaultNode[] {
  const descending = sort.startsWith("-");
  const field = sort.replace("-", "");
  const compare = (a: VaultNode, b: VaultNode) => {
    if (field === "size") return a.size - b.size || a.name.localeCompare(b.name, "es");
    if (field === "date") return a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name, "es");
    return a.name.localeCompare(b.name, "es", { numeric: true });
  };
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return descending ? -compare(a, b) : compare(a, b);
  });
}

/** Ruta tipo "carpeta/sub/archivo.pdf" para el zip. */
export function pathOf(nodes: VaultNode[], node: VaultNode): string {
  const parts = [node.name];
  const byId = new Map(nodes.map((item) => [item.id, item]));
  let current = node.parent_id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const parent = byId.get(current);
    if (!parent) break;
    parts.unshift(parent.name);
    current = parent.parent_id;
  }
  return parts.join("/");
}

export type FolderOption = { id: string | null; name: string; depth: number };

/** Arbol plano de carpetas vivas para el selector de destino. */
export function folderOptions(nodes: VaultNode[]): FolderOption[] {
  const options: FolderOption[] = [{ id: null, name: "Mi unidad", depth: 0 }];
  const walk = (parentId: string | null, depth: number) => {
    const children = liveChildren(nodes, parentId)
      .filter((node) => node.kind === "folder")
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
    for (const child of children) {
      options.push({ id: child.id, name: child.name, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(null, 1);
  return options;
}

export function buildStats(nodes: VaultNode[], activity: ActivityEvent[]): VaultStats {
  const live = nodes.filter((node) => node.deleted_at === null);
  const files = live.filter((node) => node.kind === "file");
  const trashed = nodes.filter((node) => node.deleted_at !== null && node.kind === "file");

  const groups: { label: string; match: (node: VaultNode) => boolean }[] = [
    { label: "Imagenes", match: (node) => node.mime_type.startsWith("image/") },
    { label: "Videos", match: (node) => node.mime_type.startsWith("video/") },
    { label: "Audio", match: (node) => node.mime_type.startsWith("audio/") },
    { label: "Documentos", match: (node) => ["pdf", "doc", "text"].includes(categoryOf(node.name, node.mime_type, node.kind)) },
  ];

  const by_type = groups.map((group) => {
    const matched = files.filter(group.match);
    return { label: group.label, size: matched.reduce((sum, node) => sum + node.size, 0), count: matched.length };
  });
  const rest = files.filter((node) => !groups.some((group) => group.match(node)));
  by_type.push({ label: "Otros", size: rest.reduce((sum, node) => sum + node.size, 0), count: rest.length });

  return {
    used: files.reduce((sum, node) => sum + node.size, 0),
    files: files.length,
    folders: live.filter((node) => node.kind === "folder").length,
    trash_size: trashed.reduce((sum, node) => sum + node.size, 0),
    trash_count: nodes.filter((node) => node.deleted_at !== null).length,
    favorites: live.filter((node) => node.is_favorite).length,
    by_type,
    activity,
  };
}
