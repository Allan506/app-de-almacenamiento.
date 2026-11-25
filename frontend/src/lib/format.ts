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

export type FileCategory = "image" | "video" | "audio" | "pdf" | "text" | "archive" | "sheet" | "doc" | "folder" | "other";

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
  if (mime.startsWith("text/") || ["md", "json", "xml", "yml", "yaml", "js", "ts", "tsx", "py", "css", "html", "sh", "log"].includes(ext))
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

export function initialsOf(name: string, email?: string): string {
  const source = name?.trim() || email?.split("@")[0] || "U";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "U").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function percent(used: number, quota: number): number {
  if (!quota) return 0;
  return Math.min(100, Math.round((used / quota) * 100));
}
