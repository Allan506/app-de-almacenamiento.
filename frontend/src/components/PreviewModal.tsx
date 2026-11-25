import { useEffect, useState } from "react";
import { Download, Loader2, Share2, FileQuestion } from "lucide-react";
import { rawUrl, type NodeItem } from "../lib/api";
import { CATEGORY_STYLES, categoryOf, formatBytes, formatDateTime } from "../lib/format";
import { Modal } from "./Modal";
import { FileIcon } from "./FileIcon";

type Props = {
  node: NodeItem | null;
  onClose: () => void;
  onDownload: (node: NodeItem) => void;
  onShare: (node: NodeItem) => void;
  shareToken?: string;
  shareAccess?: string;
  showShare?: boolean;
};

export function PreviewModal({
  node,
  onClose,
  onDownload,
  onShare,
  shareToken,
  shareAccess,
  showShare = true,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const category = node ? categoryOf(node.name, node.mime_type, node.kind) : "other";

  useEffect(() => {
    setUrl(null);
    setText(null);
    setError(null);
    if (!node) return;

    let cancelled = false;
    const resolve = async () => {
      try {
        const nextUrl = shareToken
          ? `/api/public/shares/${shareToken}/raw${shareAccess ? `?access=${encodeURIComponent(shareAccess)}` : ""}`
          : await rawUrl(node.id);
        if (cancelled) return;
        setUrl(nextUrl);

        if (category === "text" && node.size < 2 * 1024 * 1024) {
          const response = await fetch(nextUrl);
          if (!response.ok) throw new Error("No se pudo cargar el texto");
          const content = await response.text();
          if (!cancelled) setText(content);
        }
      } catch {
        if (!cancelled) setError("No se pudo cargar la vista previa. Descarga el archivo para verlo.");
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [node, category, shareToken, shareAccess]);

  if (!node) return null;
  const style = CATEGORY_STYLES[category];

  return (
    <Modal
      open={!!node}
      onClose={onClose}
      title={node.name}
      description={`${formatBytes(node.size)} · ${style.label} · ${formatDateTime(node.created_at)}`}
      size="xl"
      footer={
        <>
          {showShare && (
            <button className="btn-ghost" onClick={() => onShare(node)}>
              <Share2 className="h-4 w-4" /> Compartir
            </button>
          )}
          <button className="btn-primary" onClick={() => onDownload(node)}>
            <Download className="h-4 w-4" /> Descargar
          </button>
        </>
      }
    >
      <div className="grid min-h-[280px] place-items-center overflow-hidden rounded-xl border border-white/[0.07] bg-ink-950/60">
        {error ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <FileIcon name={node.name} mime={node.mime_type} kind={node.kind} size="lg" />
            <p className="text-sm text-slate-400">{error}</p>
          </div>
        ) : !url ? (
          <div className="flex flex-col items-center gap-3 p-10 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-xs">Preparando vista previa...</p>
          </div>
        ) : category === "image" ? (
          <img src={url} alt={node.name} className="max-h-[62vh] w-auto object-contain" />
        ) : category === "video" ? (
          <video src={url} controls autoPlay className="max-h-[62vh] w-full bg-black" />
        ) : category === "audio" ? (
          <div className="flex w-full flex-col items-center gap-5 p-10">
            <FileIcon name={node.name} mime={node.mime_type} kind={node.kind} size="lg" />
            <audio src={url} controls className="w-full max-w-md" />
          </div>
        ) : category === "pdf" ? (
          <iframe src={url} title={node.name} className="h-[62vh] w-full bg-white" />
        ) : category === "text" ? (
          text === null ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          ) : (
            <pre className="max-h-[62vh] w-full overflow-auto whitespace-pre-wrap p-5 font-mono text-[12.5px] leading-relaxed text-slate-300">
              {text}
            </pre>
          )
        ) : (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <FileQuestion className="h-10 w-10 text-slate-500" />
            <p className="text-sm text-slate-400">Este formato no admite vista previa.</p>
            <button className="btn-ghost" onClick={() => onDownload(node)}>
              <Download className="h-4 w-4" /> Descargar archivo
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
