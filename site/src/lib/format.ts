export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : decimals)} ${units[index]}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return formatDate(iso);
}

export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "archive"
  | "sheet"
  | "doc"
  | "folder"
  | "other";

export function extensionOf(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export function categoryOf(name: string, mime: string, kind: string): FileCategory {
  if (kind === "folder") return "folder";
  const ext = extensionOf(name);
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) return "archive";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "sheet";
  if (["doc", "docx", "odt", "rtf", "pages"].includes(ext)) return "doc";
  if (
    mime.startsWith("text/") ||
    ["md", "json", "xml", "yml", "yaml", "js", "ts", "tsx", "py", "css", "html", "sh", "log"].includes(ext)
  )
    return "text";
  return "other";
}

export const CATEGORY_STYLES: Record<FileCategory, { bg: string; text: string; label: string }> = {
  image: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Imagen" },
  video: { bg: "bg-rose-500/15", text: "text-rose-300", label: "Video" },
  audio: { bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", label: "Audio" },
  pdf: { bg: "bg-orange-500/15", text: "text-orange-300", label: "PDF" },
  text: { bg: "bg-sky-500/15", text: "text-sky-300", label: "Texto" },
  archive: { bg: "bg-amber-500/15", text: "text-amber-300", label: "Comprimido" },
  sheet: { bg: "bg-lime-500/15", text: "text-lime-300", label: "Hoja de calculo" },
  doc: { bg: "bg-blue-500/15", text: "text-blue-300", label: "Documento" },
  folder: { bg: "bg-cloud-500/15", text: "text-cloud-200", label: "Carpeta" },
  other: { bg: "bg-slate-500/15", text: "text-slate-300", label: "Archivo" },
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "N";
  return ((parts[0][0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const SAFE_NAME = /[\\/:*?"<>|\x00-\x1f]/g;

export function sanitizeName(name: string, fallback = "archivo"): string {
  const cleaned = (name ?? "")
    .normalize("NFC")
    .replace(/[\\/]/g, "-")
    .replace(SAFE_NAME, "")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .slice(0, 200)
    .trim();
  return cleaned || fallback;
}

export function splitName(name: string): [string, string] {
  if (name.slice(1).includes(".")) {
    const index = name.lastIndexOf(".");
    return [name.slice(0, index), name.slice(index)];
  }
  return [name, ""];
}

/** Extension segura para mostrar/descargar. */
export function guessMime(name: string, provided?: string): string {
  if (provided && provided !== "application/octet-stream") return provided;
  const ext = extensionOf(name);
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}
