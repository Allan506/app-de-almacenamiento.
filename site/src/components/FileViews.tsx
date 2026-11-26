import {
  Download,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  Image as ImageIcon,
  MoreVertical,
  Music,
  Pencil,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  FolderInput,
  Play,
  Video,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_STYLES, categoryOf, formatBytes, timeAgo } from "../lib/format";
import type { Section, VaultNode } from "../lib/types";

const ICONS = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  pdf: FileType2,
  text: FileText,
  archive: FileArchive,
  sheet: FileSpreadsheet,
  doc: FileText,
  folder: Folder,
  other: File,
};

export function FileIcon({
  node,
  size = "md",
}: {
  node: VaultNode;
  size?: "sm" | "md" | "lg";
}) {
  const category = categoryOf(node.name, node.mime_type, node.kind);
  const style = CATEGORY_STYLES[category];
  const Icon = ICONS[category];
  const box = size === "sm" ? "h-9 w-9 rounded-lg" : size === "lg" ? "h-12 w-12 rounded-xl" : "h-10 w-10 rounded-xl";
  const glyph = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  return (
    <div className={`${box} ${style.bg} grid shrink-0 place-items-center ${style.text}`}>
      <Icon className={glyph} strokeWidth={1.9} />
    </div>
  );
}

export type ItemAction =
  | "open"
  | "preview"
  | "download"
  | "rename"
  | "move"
  | "favorite"
  | "trash"
  | "restore"
  | "purge";

type ItemProps = {
  node: VaultNode;
  section: Section;
  onAction: (action: ItemAction, node: VaultNode) => void;
};

function ItemMenu({ node, section, onAction, align = "right" }: ItemProps & { align?: "right" | "left" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const run = (action: ItemAction) => {
    setOpen(false);
    onAction(action, node);
  };

  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white";

  return (
    <div className="relative" ref={ref}>
      <button
        className="icon-btn h-8 w-8"
        aria-label="Mas acciones"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-9 z-40 w-52 animate-scale-in overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 py-1 shadow-2xl backdrop-blur-xl`}
        >
          {section === "trash" ? (
            <>
              <button className={item} onClick={() => run("restore")}>
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar
              </button>
              <button className={`${item} text-rose-300 hover:text-rose-200`} onClick={() => run("purge")}>
                <XCircle className="h-3.5 w-3.5" /> Borrar para siempre
              </button>
            </>
          ) : (
            <>
              {node.kind === "folder" ? (
                <button className={item} onClick={() => run("open")}>
                  <Folder className="h-3.5 w-3.5" /> Abrir carpeta
                </button>
              ) : (
                <button className={item} onClick={() => run("preview")}>
                  <Play className="h-3.5 w-3.5" /> Vista previa
                </button>
              )}
              <button className={item} onClick={() => run("download")}>
                <Download className="h-3.5 w-3.5" /> {node.kind === "folder" ? "Descargar .zip" : "Descargar"}
              </button>
              <button className={item} onClick={() => run("rename")}>
                <Pencil className="h-3.5 w-3.5" /> Renombrar
              </button>
              <button className={item} onClick={() => run("move")}>
                <FolderInput className="h-3.5 w-3.5" /> Mover a...
              </button>
              <button className={item} onClick={() => run("favorite")}>
                {node.is_favorite ? <StarOff className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
                {node.is_favorite ? "Quitar de favoritos" : "Anadir a favoritos"}
              </button>
              <div className="my-1 h-px bg-white/[0.07]" />
              <button className={`${item} text-rose-300 hover:text-rose-200`} onClick={() => run("trash")}>
                <Trash2 className="h-3.5 w-3.5" /> Mover a la papelera
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function QuickActions({ node, section, onAction }: ItemProps) {
  if (section === "trash") {
    return (
      <div className="flex items-center">
        <button className="icon-btn h-8 w-8" onClick={() => onAction("restore", node)} aria-label="Restaurar">
          <RotateCcw className="h-4 w-4" />
        </button>
        <ItemMenu node={node} section={section} onAction={onAction} />
      </div>
    );
  }
  return (
    <div className="flex items-center">
      <button
        className="icon-btn h-8 w-8"
        onClick={() => onAction("favorite", node)}
        aria-label={node.is_favorite ? "Quitar de favoritos" : "Anadir a favoritos"}
      >
        <Star className={`h-4 w-4 ${node.is_favorite ? "fill-amber-300 text-amber-300" : ""}`} />
      </button>
      <button className="icon-btn hidden h-8 w-8 sm:grid" onClick={() => onAction("download", node)} aria-label="Descargar">
        <Download className="h-4 w-4" />
      </button>
      <ItemMenu node={node} section={section} onAction={onAction} />
    </div>
  );
}

export function FileCard(props: ItemProps) {
  const { node, section, onAction } = props;
  return (
    <div className="group relative flex flex-col rounded-2xl border border-white/[0.06] bg-ink-850/40 p-3 transition hover:border-cloud-400/30 hover:bg-ink-800/60">
      <button
        className="flex flex-1 flex-col items-start gap-3 text-left focus-visible:outline-none"
        onClick={() => onAction("open", node)}
      >
        <FileIcon node={node} size="lg" />
        <div className="w-full min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-100">{node.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {node.kind === "folder" ? "Carpeta" : formatBytes(node.size)} · {timeAgo(node.created_at)}
          </p>
        </div>
      </button>
      <div className="absolute right-1.5 top-1.5 opacity-80 transition group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="rounded-lg bg-ink-900/80 backdrop-blur">
          <QuickActions node={node} section={section} onAction={onAction} />
        </div>
      </div>
    </div>
  );
}

export function FileRow(props: ItemProps) {
  const { node, section, onAction } = props;
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition hover:border-white/[0.07] hover:bg-white/[0.03]">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onAction("open", node)}>
        <FileIcon node={node} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-slate-100">{node.name}</p>
          <p className="truncate text-[11px] text-slate-500">
            {node.kind === "folder" ? "Carpeta" : formatBytes(node.size)} · {timeAgo(node.updated_at)}
          </p>
        </div>
      </button>
      <div className="hidden w-24 shrink-0 text-right text-[11px] text-slate-500 md:block">
        {node.kind === "folder" ? "—" : formatBytes(node.size)}
      </div>
      <div className="w-24 shrink-0 text-right text-[11px] text-slate-500 sm:block">
        {new Date(node.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
      </div>
      <QuickActions node={node} section={section} onAction={onAction} />
    </div>
  );
}
