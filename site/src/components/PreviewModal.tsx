import { Download, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Vault } from "../lib/library";
import { formatBytes, formatDateTime } from "../lib/format";
import { previewKind } from "../lib/download";
import type { VaultNode } from "../lib/types";
import { Modal } from "./Modal";

type PreviewState = {
  loading: boolean;
  progress: number;
  error: string | null;
  url: string | null;
  text: string | null;
  truncated: boolean;
};

const EMPTY: PreviewState = { loading: true, progress: 0, error: null, url: null, text: null, truncated: false };

export function PreviewModal({
  node,
  vault,
  onClose,
  onDownload,
}: {
  node: VaultNode | null;
  vault: Vault;
  onClose: () => void;
  onDownload: (node: VaultNode) => void;
}) {
  const [state, setState] = useState<PreviewState>(EMPTY);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    setState(EMPTY);
    if (!node) return;

    const kind = previewKind(node.mime_type);
    if (!kind) {
      setState({ ...EMPTY, loading: false, progress: 1 });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const releaseUrl = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
    releaseUrl();

    void (async () => {
      try {
        const blob = await vault.readFile(
          node,
          (loaded, total) => {
            if (!cancelled) setState((current) => ({ ...current, progress: total ? loaded / total : 0 }));
          },
          controller.signal,
        );
        if (cancelled) return;

        if (kind === "text") {
          const sample = blob.slice(0, 300 * 1024);
          const text = await sample.text();
          if (cancelled) return;
          setState({ loading: false, progress: 1, error: null, url: null, text, truncated: blob.size > sample.size });
          return;
        }

        const url = URL.createObjectURL(new Blob([blob], { type: node.mime_type }));
        urlRef.current = url;
        setState({ loading: false, progress: 1, error: null, url, text: null, truncated: false });
      } catch (cause) {
        if (cancelled) return;
        setState({
          loading: false,
          progress: 0,
          error: cause instanceof Error ? cause.message : "No se pudo cargar la vista previa",
          url: null,
          text: null,
          truncated: false,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      releaseUrl();
    };
  }, [node, vault]);

  const kind = node ? previewKind(node.mime_type) : null;

  return (
    <Modal
      open={Boolean(node)}
      onClose={onClose}
      title={node?.name}
      subtitle={node ? `${formatBytes(node.size)} · ${formatDateTime(node.created_at)}` : undefined}
      size="xl"
      footer={
        node && (
          <button className="btn-primary" onClick={() => onDownload(node)}>
            <Download className="h-4 w-4" /> Descargar
          </button>
        )
      }
    >
      <div className="flex min-h-[240px] items-center justify-center rounded-xl bg-ink-950/60 p-3">
        {state.loading && (
          <div className="flex w-full max-w-xs flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-cloud-300" />
            <p className="text-xs text-slate-400">Descargando desde Telegram... {Math.round(state.progress * 100)}%</p>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-cloud-400 transition-all" style={{ width: `${state.progress * 100}%` }} />
            </div>
          </div>
        )}

        {!state.loading && state.error && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <TriangleAlert className="h-6 w-6 text-amber-300" />
            <p className="max-w-sm text-xs text-slate-400">{state.error}</p>
          </div>
        )}

        {!state.loading && !state.error && kind === "image" && state.url && (
          <img src={state.url} alt={node?.name} className="max-h-[65vh] w-auto rounded-lg object-contain" />
        )}
        {!state.loading && !state.error && kind === "video" && state.url && (
          <video src={state.url} controls autoPlay className="max-h-[65vh] w-full rounded-lg" />
        )}
        {!state.loading && !state.error && kind === "audio" && state.url && (
          <div className="w-full max-w-md py-8">
            <audio src={state.url} controls autoPlay className="w-full" />
          </div>
        )}
        {!state.loading && !state.error && kind === "pdf" && state.url && (
          <iframe src={state.url} title={node?.name} className="h-[65vh] w-full rounded-lg bg-white" />
        )}
        {!state.loading && !state.error && kind === "text" && state.text !== null && (
          <div className="w-full">
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink-900/80 p-4 text-xs leading-relaxed text-slate-300">
              {state.text}
            </pre>
            {state.truncated && (
              <p className="mt-2 text-center text-[11px] text-slate-500">
                Vista previa limitada a los primeros 300 KB. Descarga el archivo para verlo completo.
              </p>
            )}
          </div>
        )}
        {!state.loading && !state.error && !kind && (
          <div className="py-10 text-center text-xs text-slate-400">
            Este tipo de archivo no tiene vista previa. Puedes descargarlo.
          </div>
        )}
      </div>
    </Modal>
  );
}
