export type NodeKind = "file" | "folder";

export type ChunkRef = {
  file_id: string;
  message_id: number;
  size: number;
};

/** Metadatos de un elemento del arbol. Los bytes viven en Telegram o en IndexedDB. */
export type VaultNode = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: NodeKind;
  size: number;
  mime_type: string;
  /** Solo driver telegram: una referencia por trozo, en orden. */
  chunks: ChunkRef[];
  /** Solo driver local: clave del blob en IndexedDB. */
  blob_key: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Identifica un borrado conjunto para restaurar el subarbol correcto. */
  trash_id: string | null;
};

export type Driver = "telegram" | "local";

export type VaultConfig = {
  driver: Driver;
  bot_token: string;
  chat_id: string;
  chunk_bytes: number;
  display_name: string;
  bot_username?: string;
  created_at: string;
};

export type ActivityEvent = {
  id?: number;
  action: string;
  node_id: string | null;
  node_name: string;
  size: number;
  created_at: string;
};

export type Breadcrumb = { id: string | null; name: string };

export type Section = "drive" | "recent" | "favorites" | "trash" | "storage";

export type SortKey = "name" | "-name" | "date" | "-date" | "size" | "-size";

export type UploadTask = {
  id: string;
  name: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error" | "canceled";
  error?: string;
  controller: AbortController;
};

export type VaultStats = {
  used: number;
  files: number;
  folders: number;
  trash_size: number;
  trash_count: number;
  favorites: number;
  by_type: { label: string; size: number; count: number }[];
  activity: ActivityEvent[];
};
