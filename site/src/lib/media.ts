import { previewKindFor } from "./preview";
import type { VaultNode } from "./types";

export type MediaKind = "audio" | "video";

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export type LoopMode = "off" | "all" | "one";

export function mediaKindOf(node: Pick<VaultNode, "name" | "mime_type" | "kind">): MediaKind | null {
  const kind = previewKindFor(node);
  return kind === "audio" || kind === "video" ? kind : null;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const padded = String(rest).padStart(2, "0");
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${padded}`;
  return `${minutes}:${padded}`;
}

export function nextRate(rate: number, direction: 1 | -1 = 1): number {
  const index = RATES.findIndex((value) => Math.abs(value - rate) < 0.01);
  const base = index >= 0 ? index : RATES.indexOf(1);
  const next = Math.min(RATES.length - 1, Math.max(0, base + direction));
  return RATES[next];
}

export function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}

/** Lista reproducible: mismo tipo, sin papelera y en el orden en que se ven. */
export function buildPlaylist(nodes: VaultNode[], current: VaultNode, kind: MediaKind): VaultNode[] {
  const list = nodes.filter((node) => node.kind === "file" && !node.deleted_at && mediaKindOf(node) === kind);
  if (!list.some((node) => node.id === current.id)) list.push(current);
  return list;
}

/** Siguiente o anterior dentro de la lista, con vuelta opcional. */
export function stepPlaylist(
  playlist: VaultNode[],
  currentId: string,
  step: 1 | -1,
  options: { wrap?: boolean; shuffle?: boolean; random?: () => number } = {},
): VaultNode | null {
  if (!playlist.length) return null;
  if (options.shuffle) {
    const pool = playlist.filter((node) => node.id !== currentId);
    if (!pool.length) return null;
    const random = options.random ?? Math.random;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null;
  }
  const index = playlist.findIndex((node) => node.id === currentId);
  if (index < 0) return playlist[0] ?? null;
  const next = index + step;
  if (next < 0) return options.wrap === false ? null : playlist[playlist.length - 1];
  if (next >= playlist.length) return options.wrap === false ? null : playlist[0];
  return playlist[next];
}

export type ResumeStore = {
  read: (id: string) => number;
  write: (id: string, seconds: number) => void;
  clear: (id: string) => void;
};

const RESUME_PREFIX = "nube-lite.pos.";
const MAX_RESUME_ENTRIES = 80;

/** Recuerda por donde ibas en cada archivo, sin crecer sin control. */
export function createResumeStore(storage: Storage | null): ResumeStore {
  const keys = () => {
    if (!storage) return [];
    const list: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(RESUME_PREFIX)) list.push(key);
    }
    return list;
  };

  return {
    read: (id) => {
      if (!storage) return 0;
      const raw = Number(storage.getItem(RESUME_PREFIX + id));
      return Number.isFinite(raw) && raw > 0 ? raw : 0;
    },
    write: (id, seconds) => {
      if (!storage || !Number.isFinite(seconds) || seconds < 1) return;
      try {
        storage.setItem(RESUME_PREFIX + id, String(Math.floor(seconds)));
        const all = keys();
        for (const key of all.slice(0, Math.max(0, all.length - MAX_RESUME_ENTRIES))) storage.removeItem(key);
      } catch {
        /* Sin espacio: se ignora. */
      }
    },
    clear: (id) => {
      storage?.removeItem(RESUME_PREFIX + id);
    },
  };
}

export function readNumber(storage: Storage | null, key: string, fallback: number): number {
  if (!storage) return fallback;
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) && storage.getItem(key) !== null ? value : fallback;
}

export function writeNumber(storage: Storage | null, key: string, value: number): void {
  try {
    storage?.setItem(key, String(value));
  } catch {
    /* Sin almacenamiento: se queda en memoria. */
  }
}

/** Texto del boton de repeticion segun el modo. */
export function loopLabel(mode: LoopMode): string {
  if (mode === "one") return "Repetir este archivo";
  if (mode === "all") return "Repetir la lista";
  return "Sin repeticion";
}

export function nextLoopMode(mode: LoopMode): LoopMode {
  if (mode === "off") return "all";
  if (mode === "all") return "one";
  return "off";
}
