import { VaultDb } from "./db";
import { guessMime, sanitizeName } from "./format";
import { HttpTelegramTransport, TelegramClient, type Progress } from "./telegram";
import { buildStats, dedupeName, liveChildren, subtreeIds, uid, wouldCycle } from "./tree";
import type { ActivityEvent, Driver, VaultConfig, VaultNode, VaultStats } from "./types";
import { createZip, relativePath, type ZipEntry } from "./zip";

const stamp = () => new Date().toISOString();

export function createTelegramClient(config: VaultConfig): TelegramClient {
  return new TelegramClient(
    new HttpTelegramTransport(config.bot_token),
    config.chat_id,
    config.chunk_bytes,
  );
}

export class Vault {
  /** Serializa la creacion de carpetas y nombres: dos subidas en paralelo no deben duplicar rutas. */
  private queue: Promise<unknown> = Promise.resolve();
  private reserved = new Map<string, Set<string>>();

  private constructor(
    readonly config: VaultConfig,
    private readonly db: VaultDb,
    private readonly client: TelegramClient | null,
  ) {}

  static async open(config: VaultConfig): Promise<Vault> {
    const db = await VaultDb.open();
    const client = config.driver === "telegram" ? createTelegramClient(config) : null;
    return new Vault(config, db, client);
  }

  static async verify(config: VaultConfig): Promise<{ bot: string; chat: string }> {
    const { bot, chat } = await createTelegramClient(config).verify();
    const botName = bot.username ? `@${bot.username}` : `bot ${bot.id}`;
    const chatName = chat.title ?? chat.username ?? chat.first_name ?? String(chat.id);
    return { bot: botName, chat: chatName };
  }

  get driver(): Driver {
    return this.config.driver;
  }

  async nodes(): Promise<VaultNode[]> {
    return this.db.allNodes();
  }

  async stats(): Promise<VaultStats> {
    const [nodes, events] = await Promise.all([this.db.allNodes(), this.db.recentEvents(30)]);
    return buildStats(nodes, events);
  }

  async createFolder(name: string, parentId: string | null): Promise<VaultNode> {
    const node = await this.serialize(async () => {
      const nodes = await this.db.allNodes();
      const record = this.folderRecord(nodes, name, parentId);
      await this.db.putNode(record);
      return record;
    });
    await this.log("folder", node);
    return node;
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private reservations(parentId: string | null): Set<string> {
    const key = parentId ?? "root";
    const existing = this.reserved.get(key);
    if (existing) return existing;
    const created = new Set<string>();
    this.reserved.set(key, created);
    return created;
  }

  async renameNode(node: VaultNode, name: string): Promise<VaultNode> {
    const nodes = await this.db.allNodes();
    const clean = sanitizeName(name, node.name);
    const updated: VaultNode = {
      ...node,
      name: dedupeName(nodes, node.parent_id, clean, node.id),
      updated_at: stamp(),
    };
    await this.db.putNode(updated);
    await this.log("rename", updated);
    return updated;
  }

  async setFavorite(node: VaultNode, value: boolean): Promise<VaultNode> {
    const updated = { ...node, is_favorite: value, updated_at: stamp() };
    await this.db.putNode(updated);
    return updated;
  }

  async moveNode(node: VaultNode, targetFolderId: string | null): Promise<VaultNode> {
    const nodes = await this.db.allNodes();
    if (wouldCycle(nodes, node.id, targetFolderId)) {
      throw new Error("No puedes mover una carpeta dentro de si misma");
    }
    const updated: VaultNode = {
      ...node,
      parent_id: targetFolderId,
      name: dedupeName(nodes, targetFolderId, node.name, node.id),
      updated_at: stamp(),
    };
    await this.db.putNode(updated);
    await this.log("move", updated);
    return updated;
  }

  async trashNode(node: VaultNode): Promise<void> {
    const nodes = await this.db.allNodes();
    const ids = new Set([node.id, ...subtreeIds(nodes, node.id)]);
    const trashId = uid();
    const deletedAt = stamp();
    const updated = nodes
      .filter((item) => ids.has(item.id) && item.deleted_at === null)
      .map((item) => ({ ...item, deleted_at: deletedAt, trash_id: trashId, updated_at: deletedAt }));
    await this.db.putNodes(updated);
    await this.log("trash", node);
  }

  async restoreNode(node: VaultNode): Promise<void> {
    const nodes = await this.db.allNodes();
    const ids = new Set([node.id, ...subtreeIds(nodes, node.id)]);
    const updated = nodes
      .filter((item) => ids.has(item.id) && item.deleted_at !== null && item.trash_id === node.trash_id)
      .map((item) => ({ ...item, deleted_at: null, trash_id: null, updated_at: stamp() }));
    await this.db.putNodes(updated);
    await this.log("restore", node);
  }

  async purgeNode(node: VaultNode): Promise<void> {
    const nodes = await this.db.allNodes();
    const ids = new Set([node.id, ...subtreeIds(nodes, node.id)]);
    await this.purgeRecords(nodes.filter((item) => ids.has(item.id)));
    await this.log("purge", node);
  }

  async emptyTrash(): Promise<number> {
    const nodes = await this.db.allNodes();
    const trashed = nodes.filter((node) => node.deleted_at !== null);
    await this.purgeRecords(trashed);
    if (trashed.length) await this.log("purge", trashed[0], 0, trashed.length);
    return trashed.length;
  }

  async uploadFile(
    file: File,
    parentId: string | null,
    relativePathName = "",
    onProgress?: Progress,
    signal?: AbortSignal,
  ): Promise<VaultNode> {
    const segments = relativePathName.replace(/\\/g, "/").split("/").filter(Boolean);
    const leaf = sanitizeName(segments.length ? segments[segments.length - 1] : file.name, "archivo");

    const plan = await this.serialize(async () => {
      const nodes = await this.db.allNodes();
      let folderId = parentId;
      for (const part of segments.slice(0, -1)) {
        const folderName = sanitizeName(part, "Carpeta");
        const existing = liveChildren(nodes, folderId).find(
          (item) => item.kind === "folder" && item.name.toLowerCase() === folderName.toLowerCase(),
        );
        if (existing) {
          folderId = existing.id;
          continue;
        }
        const folder = this.folderRecord(nodes, folderName, folderId);
        await this.db.putNode(folder);
        nodes.push(folder);
        folderId = folder.id;
      }
      const reserved = this.reservations(folderId);
      const name = dedupeName(nodes, folderId, leaf, undefined, reserved);
      reserved.add(name.toLowerCase());
      return { folderId, name, id: uid() };
    });

    const { folderId, name, id } = plan;
    const base = {
      id,
      parent_id: folderId,
      name,
      kind: "file" as const,
      size: file.size,
      mime_type: guessMime(name, file.type),
      is_favorite: false,
      created_at: stamp(),
      updated_at: stamp(),
      deleted_at: null,
      trash_id: null,
    };

    const node: VaultNode =
      this.config.driver === "telegram" && this.client
        ? { ...base, chunks: await this.client.upload(file, name, onProgress, signal), blob_key: null }
        : { ...base, chunks: [], blob_key: id };

    try {
      if (this.config.driver === "local") {
        await this.db.putBlob(id, file);
      }
      await this.db.putNode(node);
    } finally {
      this.reservations(folderId).delete(name.toLowerCase());
    }
    await this.log("upload", node, file.size);
    return node;
  }

  async readFile(node: VaultNode, onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
    if (node.kind !== "file") throw new Error("Ese elemento no es un archivo");
    if (this.config.driver === "telegram" && this.client) {
      if (!node.chunks.length) return new Blob([], { type: node.mime_type });
      return this.client.download(node.chunks, onProgress, signal);
    }
    const blob = await this.db.getBlob(node.blob_key ?? node.id);
    if (!blob) throw new Error("El contenido ya no esta en este navegador");
    onProgress?.(blob.size, blob.size);
    return blob;
  }

  /** URL que el navegador puede reproducir directamente (solo archivos de un trozo). */
  async directUrl(node: VaultNode): Promise<string | null> {
    if (node.kind !== "file" || this.config.driver !== "telegram" || !this.client) return null;
    try {
      return await this.client.directUrl(node.chunks);
    } catch {
      return null;
    }
  }

  async zipFolder(
    folder: VaultNode,
    onProgress?: (ratio: number) => void,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const nodes = await this.db.allNodes();
    const ids = new Set([folder.id, ...subtreeIds(nodes, folder.id)]);
    const files = nodes.filter((node) => ids.has(node.id) && node.kind === "file" && node.deleted_at === null);
    const entries: ZipEntry[] = files.map((file) => ({
      path: relativePath(nodes, file.id, folder.id) || file.name,
      size: file.size,
      load: () => this.readFile(file),
    }));
    return createZip(entries, onProgress, signal);
  }

  async exportManifest(): Promise<Blob> {
    const nodes = await this.db.allNodes();
    const payload = {
      app: "nube-lite",
      version: 1,
      exported_at: stamp(),
      driver: this.config.driver,
      chat_id: this.config.driver === "telegram" ? this.config.chat_id : null,
      nodes,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  }

  async importManifest(text: string): Promise<{ imported: number; skipped: number }> {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("El archivo no es un JSON valido");
    }
    const candidate = payload as { app?: string; nodes?: VaultNode[] };
    if (candidate?.app !== "nube-lite" || !Array.isArray(candidate.nodes)) {
      throw new Error("Ese archivo no es una copia de seguridad de Nube");
    }
    const existing = await this.db.allNodes();
    const ids = new Set(existing.map((node) => node.id));
    const incoming = candidate.nodes
      .filter((node) => node && typeof node.id === "string" && !ids.has(node.id))
      .map((node) => ({ ...node, chunks: Array.isArray(node.chunks) ? node.chunks : [] }));
    await this.db.putNodes(incoming);
    await this.log("import", incoming[0] ?? null, 0, incoming.length);
    return { imported: incoming.length, skipped: candidate.nodes.length - incoming.length };
  }

  async wipe(): Promise<void> {
    await this.db.clearAll();
    this.db.close();
  }

  private folderRecord(nodes: VaultNode[], name: string, parentId: string | null): VaultNode {
    const clean = sanitizeName(name, "Carpeta");
    return {
      id: uid(),
      parent_id: parentId,
      name: dedupeName(nodes, parentId, clean),
      kind: "folder",
      size: 0,
      mime_type: "inode/directory",
      chunks: [],
      blob_key: null,
      is_favorite: false,
      created_at: stamp(),
      updated_at: stamp(),
      deleted_at: null,
      trash_id: null,
    };
  }

  private async purgeRecords(targets: VaultNode[]): Promise<void> {
    if (!targets.length) return;
    const chunks = targets.flatMap((node) => node.chunks ?? []);
    if (this.client && chunks.length) {
      try {
        await this.client.remove(chunks);
      } catch {
        /* Si Telegram falla, igualmente liberamos los metadatos locales. */
      }
    }
    const ids = targets.map((node) => node.id);
    await this.db.deleteBlobs(ids);
    await this.db.deleteNodes(ids);
  }

  private async log(action: string, node: VaultNode | null, size = 0, count = 0): Promise<void> {
    const event: ActivityEvent = {
      action,
      node_id: node?.id ?? null,
      node_name: count > 1 ? `${count} elementos` : (node?.name ?? ""),
      size,
      created_at: stamp(),
    };
    await this.db.addEvent(event);
  }
}
