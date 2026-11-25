import { useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  FolderOpen,
  MoreVertical,
  Pencil,
  RotateCcw,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { NodeItem } from "../lib/api";
import { CATEGORY_STYLES, categoryOf, formatBytes, formatDate, timeAgo } from "../lib/format";
import { FileIcon } from "./FileIcon";

type Actions = {
  onOpen: (node: NodeItem) => void;
  onPreview: (node: NodeItem) => void;
  onDownload: (node: NodeItem) => void;
  onShare: (node: NodeItem) => void;
  onRename: (node: NodeItem) => void;
  onToggleFavorite: (node: NodeItem) => void;
  onTrash: (node: NodeItem) => void;
  onRestore: (node: NodeItem) => void;
  onPurge: (node: NodeItem) => void;
};

type Props = Actions & {
  node: NodeItem;
  view: "grid" | "list";
  trash?: boolean;
  thumbnail?: string | null;
};

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
        danger ? "text-rose-300 hover:bg-rose-500/10" : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export function FileItem(props: Props) {
  const { node, view, trash, thumbnail, onOpen, onPreview, onDownload, onShare, onRename, onToggleFavorite, onTrash, onRestore, onPurge } =
    props;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const style = CATEGORY_STYLES[categoryOf(node.name, node.mime_type, node.kind)];

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as HTMLElement)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const open = () => (node.kind === "folder" && !trash ? onOpen(node) : onPreview(node));

  const menu = (
    <div ref={menuRef} className="relative">
      <button
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((value) => !value);
        }}
        className={`icon-btn h-8 w-8 ${menuOpen ? "bg-white/10 text-white" : ""}`}
        aria-label="Acciones"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {menuOpen && (
        <div
          className="absolute right-0 z-30 mt-1 w-52 animate-scale-in rounded-xl border border-white/10 bg-ink-800 p-1.5 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          {trash ? (
            <>
              <MenuItem icon={RotateCcw} label="Restaurar" onClick={() => (setMenuOpen(false), onRestore(node))} />
              <MenuItem icon={X} label="Eliminar definitivamente" danger onClick={() => (setMenuOpen(false), onPurge(node))} />
            </>
          ) : (
            <>
              {node.kind === "folder" ? (
                <MenuItem icon={FolderOpen} label="Abrir carpeta" onClick={() => (setMenuOpen(false), onOpen(node))} />
              ) : (
                <MenuItem icon={Eye} label="Previsualizar" onClick={() => (setMenuOpen(false), onPreview(node))} />
              )}
              <MenuItem icon={Download} label="Descargar" onClick={() => (setMenuOpen(false), onDownload(node))} />
              <MenuItem icon={Share2} label="Compartir" onClick={() => (setMenuOpen(false), onShare(node))} />
              <MenuItem icon={Star} label={node.is_favorite ? "Quitar de favoritos" : "Anadir a favoritos"} onClick={() => (setMenuOpen(false), onToggleFavorite(node))} />
              <MenuItem icon={Pencil} label="Renombrar" onClick={() => (setMenuOpen(false), onRename(node))} />
              <div className="my-1 h-px bg-white/[0.07]" />
              <MenuItem icon={Trash2} label="Mover a la papelera" danger onClick={() => (setMenuOpen(false), onTrash(node))} />
            </>
          )}
        </div>
      )}
    </div>
  );

  if (view === "list") {
    return (
      <div
        onClick={open}
        className="group flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-white/[0.07] hover:bg-white/[0.03]"
      >
        <FileIcon name={node.name} mime={node.mime_type} kind={node.kind} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{node.name}</p>
          <p className="truncate text-[11px] text-slate-500">
            {node.kind === "folder" ? "Carpeta" : formatBytes(node.size)} · {trash ? `Eliminado ${timeAgo(node.deleted_at)}` : formatDate(node.created_at)}
            {node.has_share && " · Compartido"}
          </p>
        </div>
        <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:block ${style.bg} ${style.text}`}>
          {style.label}
        </span>
        {node.is_favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300" />}
        <div className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">{menu}</div>
        <div className="w-8 shrink-0 group-hover:hidden" />
      </div>
    );
  }

  return (
    <div
      onClick={open}
      className="group relative cursor-pointer rounded-2xl border border-white/[0.07] bg-ink-850/60 p-3.5 transition
        hover:-translate-y-0.5 hover:border-cloud-400/30 hover:bg-ink-800/80 hover:shadow-card"
    >
      <div className="relative mb-3 flex h-24 items-center justify-center overflow-hidden rounded-xl bg-ink-900/60">
        {thumbnail ? (
          <img src={thumbnail} alt={node.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <FileIcon name={node.name} mime={node.mime_type} kind={node.kind} size="lg" />
        )}
        {node.is_favorite && (
          <Star className="absolute left-2 top-2 h-3.5 w-3.5 fill-amber-300 text-amber-300 drop-shadow" />
        )}
      </div>

      <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        {menu}
      </div>

      <p className="truncate text-[13px] font-semibold text-slate-100" title={node.name}>
        {node.name}
      </p>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
        <span className="truncate">
          {node.kind === "folder" ? "Carpeta" : formatBytes(node.size)}
          {node.has_share && " · Compartido"}
        </span>
        <span className="shrink-0">{trash ? timeAgo(node.deleted_at) : formatDate(node.created_at)}</span>
      </div>

    </div>
  );
}
