import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileArchive,
  FileQuestion,
  Loader2,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  Star,
  Trash2,
  TriangleAlert,
  WrapText,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBytes, formatDateTime, guessMime } from "../lib/format";
import type { Vault } from "../lib/library";
import {
  languageOf,
  listZipEntries,
  parseDelimited,
  parseInline,
  parseMarkdown,
  prettyJson,
  previewKindFor,
  readsAsText,
  tokenizeJson,
  type PreviewKind,
  type ZipEntry,
} from "../lib/preview";
import type { VaultNode } from "../lib/types";
import { MediaPlayer } from "./MediaPlayer";
import { Modal } from "./Modal";

const TEXT_LIMIT = 512 * 1024;
const ZIP_LIMIT = 48 * 1024 * 1024;

type Loaded =
  | { state: "loading"; progress: number }
  | { state: "ready"; url: string | null; text: string | null; truncated: boolean; entries?: ZipEntry[]; zipTruncated?: boolean }
  | { state: "error"; message: string };

type Props = {
  node: VaultNode | null;
  siblings: VaultNode[];
  vault: Vault;
  onClose: () => void;
  onNavigate: (node: VaultNode) => void;
  onDownload: (node: VaultNode) => void;
  onRename: (node: VaultNode) => void;
  onMove: (node: VaultNode) => void;
  onTrash: (node: VaultNode) => void;
  onToggleFavorite: (node: VaultNode) => void;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="chip"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((token, index) => {
        if (token.type === "code") {
          return (
            <code key={index} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-cloud-200">
              {token.value}
            </code>
          );
        }
        if (token.type === "bold") return <strong key={index} className="font-semibold text-white">{token.value}</strong>;
        if (token.type === "italic") return <em key={index}>{token.value}</em>;
        if (token.type === "link") {
          return (
            <a key={index} href={token.href} target="_blank" rel="noreferrer noopener" className="text-cloud-300 underline">
              {token.value}
            </a>
          );
        }
        return <span key={index}>{token.value}</span>;
      })}
    </>
  );
}

function MarkdownView({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-slate-300">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const sizes = ["text-lg", "text-base", "text-sm", "text-sm", "text-xs", "text-xs"];
          return (
            <p key={index} className={`font-semibold text-white ${sizes[block.level - 1] ?? "text-sm"}`}>
              <InlineText text={block.text} />
            </p>
          );
        }
        if (block.type === "paragraph") {
          return (
            <p key={index}>
              <InlineText text={block.text} />
            </p>
          );
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={index} className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineText text={item} />
                </li>
              ))}
            </Tag>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={index} className="overflow-auto rounded-lg bg-ink-950/80 p-3 font-mono text-[11px] text-slate-300">
              {block.code}
            </pre>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={index} className="border-l-2 border-cloud-500/50 pl-3 text-slate-400">
              <InlineText text={block.text} />
            </blockquote>
          );
        }
        if (block.type === "rule") return <hr key={index} className="border-white/10" />;
        return (
          <div key={index} className="overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-white/[0.04] text-slate-400">
                <tr>
                  {block.head.map((cell, cellIndex) => (
                    <th key={cellIndex} className="px-2 py-1.5 font-semibold">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-white/[0.06]">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-2 py-1.5">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function CsvView({ source }: { source: string }) {
  const table = useMemo(() => parseDelimited(source), [source]);
  if (!table.head.length) return <p className="text-xs text-slate-400">No hay filas que mostrar.</p>;
  return (
    <div>
      <div className="max-h-[58vh] overflow-auto rounded-lg border border-white/10">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-ink-850 text-slate-400">
            <tr>
              {table.head.map((cell, index) => (
                <th key={index} className="whitespace-nowrap border-b border-white/10 px-2 py-1.5 font-semibold">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="odd:bg-white/[0.02]">
                {table.head.map((_, cellIndex) => (
                  <td key={cellIndex} className="max-w-[280px] truncate border-b border-white/[0.05] px-2 py-1.5 text-slate-300">
                    {row[cellIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {table.total} fila(s) · separador: {table.delimiter}
        {table.truncated ? ` · se muestran las primeras ${table.rows.length}` : ""}
      </p>
    </div>
  );
}

function JsonView({ source }: { source: string }) {
  const parsed = useMemo(() => prettyJson(source), [source]);
  if (!parsed.ok) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-amber-300">El archivo no es JSON valido; se muestra tal cual.</p>
        <pre className="max-h-[58vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink-950/80 p-3 font-mono text-[11px] text-slate-300">
          {source}
        </pre>
      </div>
    );
  }
  const tokens = tokenizeJson(parsed.text);
  const color: Record<string, string> = {
    plain: "text-slate-400",
    key: "text-cloud-200",
    string: "text-emerald-300",
    number: "text-amber-200",
    literal: "text-fuchsia-300",
  };
  return (
    <div>
      <pre className="max-h-[58vh] overflow-auto rounded-lg bg-ink-950/80 p-3 font-mono text-[11px] leading-relaxed">
        {tokens.map((token, index) => (
          <span key={index} className={color[token.type]}>
            {token.value}
          </span>
        ))}
      </pre>
      <p className="mt-2 text-[11px] text-slate-500">
        JSON valido · {parsed.count} {parsed.kind === "array" ? "elementos" : parsed.kind === "object" ? "claves" : "valor"}
      </p>
    </div>
  );
}

function TextView({ node, source, truncated, kind }: { node: VaultNode; source: string; truncated: boolean; kind: PreviewKind }) {
  const [wrap, setWrap] = useState(true);
  const [mode, setMode] = useState<"view" | "code">("view");
  const isMarkdown = kind === "markdown";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="chip">{isMarkdown ? "Markdown" : languageOf(node.name)}</span>
        {isMarkdown && (
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {(["view", "code"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                className={`px-2.5 py-1 text-[11px] transition ${
                  mode === value ? "bg-cloud-500/25 text-cloud-100" : "text-slate-400 hover:text-white"
                }`}
              >
                {value === "view" ? "Vista" : "Codigo"}
              </button>
            ))}
          </div>
        )}
        <button className="chip" onClick={() => setWrap((value) => !value)} aria-pressed={wrap}>
          <WrapText className="h-3.5 w-3.5" /> {wrap ? "Sin ajuste" : "Ajustar"}
        </button>
        <CopyButton text={source} />
      </div>

      {isMarkdown && mode === "view" ? (
        <div className="max-h-[58vh] overflow-auto rounded-lg bg-ink-950/60 p-4">
          <MarkdownView source={source} />
        </div>
      ) : (
        <pre
          className={`max-h-[58vh] overflow-auto rounded-lg bg-ink-950/80 p-3 font-mono text-[11px] leading-relaxed text-slate-300 ${
            wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
          }`}
        >
          {source}
        </pre>
      )}

      {truncated && (
        <p className="mt-2 text-[11px] text-slate-500">
          Se muestran los primeros {formatBytes(TEXT_LIMIT)}. Descarga el archivo para verlo completo.
        </p>
      )}
    </div>
  );
}

function ZipView({ entries, truncated, node }: { entries: ZipEntry[]; truncated: boolean; node: VaultNode }) {
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  return (
    <div>
      <div className="max-h-[58vh] overflow-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-ink-850 text-slate-400">
            <tr>
              <th className="border-b border-white/10 px-2 py-1.5 font-semibold">Contenido</th>
              <th className="w-24 border-b border-white/10 px-2 py-1.5 text-right font-semibold">Tamano</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.name} className="odd:bg-white/[0.02]">
                <td className="truncate px-2 py-1.5 text-slate-300">
                  {entry.dir ? <span className="text-cloud-200">{entry.name}</span> : entry.name}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-500">{entry.dir ? "—" : formatBytes(entry.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {entries.length} entrada(s) · {formatBytes(total)} sin comprimir
        {truncated ? " · lista recortada" : ""} · {node.name} ocupa {formatBytes(node.size)}. Descarga el ZIP para extraerlo.
      </p>
    </div>
  );
}

function ImageView({ url, name }: { url: string; name: string }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [url]);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-1.5">
        <button className="chip" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} aria-label="Alejar">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-12 text-center font-mono text-[11px] text-slate-400">{Math.round(zoom * 100)}%</span>
        <button className="chip" onClick={() => setZoom((value) => Math.min(5, value + 0.25))} aria-label="Acercar">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          className="chip"
          onClick={() => {
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          <Maximize2 className="h-3.5 w-3.5" /> Ajustar
        </button>
      </div>
      <div
        className="grid max-h-[62vh] min-h-[240px] place-items-center overflow-hidden rounded-xl bg-ink-950/60"
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey && zoom === 1) return;
          event.preventDefault();
          setZoom((value) => Math.min(5, Math.max(0.5, value - event.deltaY / 500)));
        }}
        onPointerDown={(event) => {
          if (zoom <= 1) return;
          drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={() => setZoom((value) => (value === 1 ? 2 : 1))}
      >
        <img
          src={url}
          alt={name}
          draggable={false}
          className="max-h-[62vh] w-auto select-none object-contain transition-transform"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        />
      </div>
    </div>
  );
}

function InfoView({ node, message }: { node: VaultNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.04] text-slate-400">
        <FileQuestion className="h-7 w-7" />
      </div>
      <p className="max-w-sm text-xs text-slate-400">{message}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-left text-[11px] text-slate-500">
        <dt>Tipo</dt>
        <dd className="text-slate-300">{node.mime_type || guessMime(node.name)}</dd>
        <dt>Tamano</dt>
        <dd className="text-slate-300">{formatBytes(node.size)}</dd>
        <dt>Creado</dt>
        <dd className="text-slate-300">{formatDateTime(node.created_at)}</dd>
        <dt>Modificado</dt>
        <dd className="text-slate-300">{formatDateTime(node.updated_at)}</dd>
      </dl>
    </div>
  );
}

export function PreviewModal({
  node,
  siblings,
  vault,
  onClose,
  onNavigate,
  onDownload,
  onRename,
  onMove,
  onTrash,
  onToggleFavorite,
}: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading", progress: 0 });
  const urlRef = useRef<string | null>(null);
  const kind = node ? previewKindFor(node) : "none";

  const release = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(() => {
    release();
    if (!node) return;
    if (kind === "video" || kind === "audio" || kind === "none") {
      setLoaded({ state: "ready", url: null, text: null, truncated: false });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoaded({ state: "loading", progress: 0 });

    void (async () => {
      try {
        const blob = await vault.readFile(
          node,
          (done, total) => {
            if (!cancelled) setLoaded({ state: "loading", progress: total ? done / total : 0 });
          },
          controller.signal,
        );
        if (cancelled) return;

        if (kind === "zip") {
          if (blob.size > ZIP_LIMIT) {
            setLoaded({
              state: "ready",
              url: null,
              text: null,
              truncated: false,
              entries: [],
              zipTruncated: false,
            });
            return;
          }
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (cancelled) return;
          const listing = listZipEntries(bytes);
          setLoaded({
            state: "ready",
            url: null,
            text: null,
            truncated: false,
            entries: listing.entries,
            zipTruncated: listing.truncated,
          });
          return;
        }

        if (readsAsText(kind)) {
          const sample = blob.slice(0, TEXT_LIMIT);
          const text = await sample.text();
          if (cancelled) return;
          setLoaded({ state: "ready", url: null, text, truncated: blob.size > sample.size });
          return;
        }

        const url = URL.createObjectURL(new Blob([blob], { type: node.mime_type || guessMime(node.name) }));
        urlRef.current = url;
        setLoaded({ state: "ready", url, text: null, truncated: false });
      } catch (cause) {
        if (cancelled) return;
        setLoaded({ state: "error", message: cause instanceof Error ? cause.message : "No se pudo cargar la vista previa" });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [node, kind, vault, release]);

  useEffect(() => release, [release]);

  const index = node ? siblings.findIndex((item) => item.id === node.id) : -1;
  const step = useCallback(
    (delta: 1 | -1) => {
      if (!node || index < 0) return;
      const next = siblings[index + delta];
      if (next) onNavigate(next);
    },
    [index, node, onNavigate, siblings],
  );

  useEffect(() => {
    if (kind === "audio" || kind === "video") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight" && !event.shiftKey) step(1);
      if (event.key === "ArrowLeft" && !event.shiftKey) step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, kind]);

  const mediaPlaylist = useMemo(() => {
    if (!node) return [];
    return siblings.filter((item) => {
      const itemKind = previewKindFor(item);
      return itemKind === "audio" || itemKind === "video";
    });
  }, [node, siblings]);

  const subtitle = node
    ? `${formatBytes(node.size)} · ${formatDateTime(node.created_at)}${index >= 0 ? ` · ${index + 1} de ${siblings.length}` : ""}`
    : undefined;

  return (
    <Modal
      open={Boolean(node)}
      onClose={onClose}
      title={node?.name}
      subtitle={subtitle}
      size="xl"
      footer={
        node && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                className="btn-ghost px-2 py-1.5"
                onClick={() => onToggleFavorite(node)}
                aria-pressed={node.is_favorite}
                aria-label={node.is_favorite ? "Quitar de favoritos" : "Anadir a favoritos"}
              >
                <Star className={`h-4 w-4 ${node.is_favorite ? "fill-amber-300 text-amber-300" : ""}`} />
              </button>
              <button className="btn-ghost px-2 py-1.5" onClick={() => step(-1)} disabled={index <= 0} aria-label="Archivo anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                className="btn-ghost px-2 py-1.5"
                onClick={() => step(1)}
                disabled={index < 0 || index >= siblings.length - 1}
                aria-label="Archivo siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button className="btn-ghost" onClick={() => onRename(node)}>
                <Pencil className="h-4 w-4" /> Renombrar
              </button>
              <button className="btn-ghost" onClick={() => onMove(node)}>
                <ArrowLeftRight className="h-4 w-4" /> Mover
              </button>
              <button className="btn-ghost text-rose-300 hover:text-rose-200" onClick={() => onTrash(node)}>
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
              <button className="btn-primary" onClick={() => onDownload(node)}>
                <Download className="h-4 w-4" /> Descargar
              </button>
            </div>
          </div>
        )
      }
    >
      {node && (
        <div className="space-y-3">
          {(kind === "video" || kind === "audio") && (
            <MediaPlayer node={node} siblings={mediaPlaylist} vault={vault} onSelect={onNavigate} />
          )}

          {kind !== "video" && kind !== "audio" && loaded.state === "loading" && (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl bg-ink-950/60 p-6">
              <Loader2 className="h-6 w-6 animate-spin text-cloud-300" />
              <p className="text-xs text-slate-400">Descargando desde Telegram... {Math.round(loaded.progress * 100)}%</p>
              <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cloud-400 transition-all" style={{ width: `${loaded.progress * 100}%` }} />
              </div>
            </div>
          )}

          {kind !== "video" && kind !== "audio" && loaded.state === "error" && (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl bg-ink-950/60 p-6 text-center">
              <TriangleAlert className="h-6 w-6 text-amber-300" />
              <p className="max-w-sm text-xs text-slate-400">{loaded.message}</p>
            </div>
          )}

          {loaded.state === "ready" && (kind === "image" || kind === "svg") && loaded.url && (
            <ImageView url={loaded.url} name={node.name} />
          )}

          {loaded.state === "ready" && kind === "pdf" && loaded.url && (
            <iframe src={loaded.url} title={node.name} className="h-[62vh] w-full rounded-xl bg-white" />
          )}

          {loaded.state === "ready" && kind === "markdown" && loaded.text !== null && (
            <TextView node={node} source={loaded.text} truncated={loaded.truncated} kind={kind} />
          )}
          {loaded.state === "ready" && kind === "json" && loaded.text !== null && (
            <JsonView source={loaded.text} />
          )}
          {loaded.state === "ready" && kind === "csv" && loaded.text !== null && <CsvView source={loaded.text} />}
          {loaded.state === "ready" && (kind === "text" || kind === "code") && loaded.text !== null && (
            <TextView node={node} source={loaded.text} truncated={loaded.truncated} kind={kind} />
          )}

          {loaded.state === "ready" && kind === "zip" && (
            <>
              {loaded.entries && loaded.entries.length > 0 ? (
                <ZipView entries={loaded.entries} truncated={Boolean(loaded.zipTruncated)} node={node} />
              ) : (
                <InfoView
                  node={node}
                  message={
                    node.size > ZIP_LIMIT
                      ? `El ZIP ocupa ${formatBytes(node.size)}; para no bloquear el movil no se lista aqui. Descargalo para abrirlo.`
                      : "No se pudo leer el indice del ZIP. Descargalo para abrirlo."
                  }
                />
              )}
            </>
          )}

          {loaded.state === "ready" && kind === "none" && (
            <InfoView node={node} message="Este tipo de archivo no se puede previsualizar en el navegador, pero puedes descargarlo o compartirlo." />
          )}

          {kind === "zip" && (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <FileArchive className="h-3.5 w-3.5" /> Los ZIP se listan sin descomprimirse.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
