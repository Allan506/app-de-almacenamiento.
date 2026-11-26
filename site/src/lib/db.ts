import type { ActivityEvent, VaultNode } from "./types";

const DB_NAME = "nube-lite";
const DB_VERSION = 1;
const STORE_SETTINGS = "settings";
const STORE_NODES = "nodes";
const STORE_BLOBS = "blobs";
const STORE_EVENTS = "events";
const MAX_EVENTS = 300;

function request<T>(input: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    input.onsuccess = () => resolve(input.result);
    input.onerror = () => reject(input.error ?? new Error("Error de IndexedDB"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Error de IndexedDB"));
    tx.onabort = () => reject(tx.error ?? new Error("Transaccion cancelada"));
  });
}

export class VaultDb {
  private constructor(private readonly db: IDBDatabase) {}

  static open(): Promise<VaultDb> {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(DB_NAME, DB_VERSION);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
        if (!db.objectStoreNames.contains(STORE_NODES)) db.createObjectStore(STORE_NODES, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORE_EVENTS)) db.createObjectStore(STORE_EVENTS, { keyPath: "id", autoIncrement: true });
      };
      opening.onsuccess = () => resolve(new VaultDb(opening.result));
      opening.onerror = () => reject(opening.error ?? new Error("No se pudo abrir IndexedDB"));
    });
  }

  async getSetting<T>(key: string): Promise<T | null> {
    const tx = this.db.transaction(STORE_SETTINGS, "readonly");
    const row = await request<{ key: string; value: T } | undefined>(tx.objectStore(STORE_SETTINGS).get(key));
    return row ? row.value : null;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    const tx = this.db.transaction(STORE_SETTINGS, "readwrite");
    tx.objectStore(STORE_SETTINGS).put({ key, value });
    await transactionDone(tx);
  }

  async deleteSetting(key: string): Promise<void> {
    const tx = this.db.transaction(STORE_SETTINGS, "readwrite");
    tx.objectStore(STORE_SETTINGS).delete(key);
    await transactionDone(tx);
  }

  async allNodes(): Promise<VaultNode[]> {
    const tx = this.db.transaction(STORE_NODES, "readonly");
    return request<VaultNode[]>(tx.objectStore(STORE_NODES).getAll());
  }

  async putNode(node: VaultNode): Promise<void> {
    const tx = this.db.transaction(STORE_NODES, "readwrite");
    tx.objectStore(STORE_NODES).put(node);
    await transactionDone(tx);
  }

  async putNodes(nodes: VaultNode[]): Promise<void> {
    if (!nodes.length) return;
    const tx = this.db.transaction(STORE_NODES, "readwrite");
    const store = tx.objectStore(STORE_NODES);
    nodes.forEach((node) => store.put(node));
    await transactionDone(tx);
  }

  async deleteNodes(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const tx = this.db.transaction(STORE_NODES, "readwrite");
    const store = tx.objectStore(STORE_NODES);
    ids.forEach((id) => store.delete(id));
    await transactionDone(tx);
  }

  async clearNodes(): Promise<void> {
    const tx = this.db.transaction(STORE_NODES, "readwrite");
    tx.objectStore(STORE_NODES).clear();
    await transactionDone(tx);
  }

  async putBlob(id: string, blob: Blob): Promise<void> {
    const tx = this.db.transaction(STORE_BLOBS, "readwrite");
    tx.objectStore(STORE_BLOBS).put({ id, blob });
    await transactionDone(tx);
  }

  async getBlob(id: string): Promise<Blob | null> {
    const tx = this.db.transaction(STORE_BLOBS, "readonly");
    const row = await request<{ id: string; blob: Blob } | undefined>(tx.objectStore(STORE_BLOBS).get(id));
    return row ? row.blob : null;
  }

  async deleteBlobs(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const tx = this.db.transaction(STORE_BLOBS, "readwrite");
    const store = tx.objectStore(STORE_BLOBS);
    ids.forEach((id) => store.delete(id));
    await transactionDone(tx);
  }

  async addEvent(event: ActivityEvent): Promise<void> {
    const tx = this.db.transaction(STORE_EVENTS, "readwrite");
    const store = tx.objectStore(STORE_EVENTS);
    store.add(event);
    const keys = await request<IDBValidKey[]>(store.getAllKeys());
    if (keys.length > MAX_EVENTS) keys.slice(0, keys.length - MAX_EVENTS).forEach((key) => store.delete(key));
    await transactionDone(tx);
  }

  async recentEvents(limit = 30): Promise<ActivityEvent[]> {
    const tx = this.db.transaction(STORE_EVENTS, "readonly");
    const rows = await request<ActivityEvent[]>(tx.objectStore(STORE_EVENTS).getAll());
    return rows.slice(-limit).reverse();
  }

  async clearEvents(): Promise<void> {
    const tx = this.db.transaction(STORE_EVENTS, "readwrite");
    tx.objectStore(STORE_EVENTS).clear();
    await transactionDone(tx);
  }

  async clearAll(): Promise<void> {
    const tx = this.db.transaction([STORE_SETTINGS, STORE_NODES, STORE_BLOBS, STORE_EVENTS], "readwrite");
    [STORE_SETTINGS, STORE_NODES, STORE_BLOBS, STORE_EVENTS].forEach((name) => tx.objectStore(name).clear());
    await transactionDone(tx);
  }

  close(): void {
    this.db.close();
  }
}
