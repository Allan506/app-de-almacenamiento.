import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, Download, FolderOpen, Loader2, Lock, ShieldCheck, Timer } from "lucide-react";
import { api, ApiError, shareDownloadUrl, shareRawUrl, type NodeItem, type ShareInfo } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import { FileIcon } from "../components/FileIcon";
import { PreviewModal } from "../components/PreviewModal";
import { Logo } from "../components/Logo";

export function PublicShare() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [items, setItems] = useState<NodeItem[]>([]);
  const [access, setAccess] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [preview, setPreview] = useState<NodeItem | null>(null);

  useEffect(() => {
    api
      .shareInfo(token)
      .then((value) => {
        setInfo(value);
        if (!value.requires_password) setAccess("");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Enlace no valido"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (access === null || !info || info.kind !== "folder") return;
    api.shareItems(token, access || undefined).then(setItems).catch(() => undefined);
  }, [access, info, token]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setUnlocking(true);
    try {
      const result = await api.unlockShare(token, password);
      setAccess(result.access);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo desbloquear");
    } finally {
      setUnlocking(false);
    }
  };

  const download = (nodeId?: string) => {
    const url = shareDownloadUrl(token, access || undefined, nodeId);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <div className="relative flex min-h-full flex-col">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-cloud-500/20 blur-[110px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-violet-500/15 blur-[110px]" />

      <header className="relative mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-6">
        <Logo />
        <a href="/" className="btn-ghost text-xs">
          Crear mi nube <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </header>

      <main className="relative mx-auto w-full max-w-3xl flex-1 px-5 pb-12">
        {loading ? (
          <div className="card grid h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : error && !info ? (
          <div className="card p-10 text-center">
            <p className="text-lg font-semibold text-white">Enlace no disponible</p>
            <p className="mt-2 text-sm text-slate-400">{error}</p>
          </div>
        ) : info ? (
          <div className="card animate-fade-up overflow-hidden">
            <div className="border-b border-white/[0.07] p-6 sm:p-8">
              <div className="flex flex-wrap items-start gap-4">
                <FileIcon name={info.name} mime={info.mime_type} kind={info.kind} size="lg" />
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-xl font-bold tracking-tight text-white">{info.name}</h1>
                  <p className="mt-1 text-[13px] text-slate-400">
                    {info.kind === "folder" ? "Carpeta compartida" : formatBytes(info.size)} · Compartido por{" "}
                    <span className="text-slate-200">{info.owner}</span>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-slate-400">
                      <ShieldCheck className="h-3 w-3 text-emerald-400" /> Verificado
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-slate-400">
                      <Timer className="h-3 w-3" /> {info.expires_at ? `Caduca ${formatDate(info.expires_at)}` : "Sin caducidad"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-slate-400">
                      {info.download_count} descargas
                    </span>
                  </div>
                </div>
              </div>

              {info.requires_password && access === null ? (
                <form onSubmit={unlock} className="mt-6 max-w-sm">
                  <label className="label" htmlFor="share-password">
                    Este enlace esta protegido
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        id="share-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Contrasena del enlace"
                        className="field pl-9"
                        autoFocus
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={unlocking || !password}>
                      {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      Abrir
                    </button>
                  </div>
                  {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
                </form>
              ) : (
                access !== null && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {info.allow_download && (
                      <button className="btn-primary" onClick={() => download()}>
                        <Download className="h-4 w-4" />
                        {info.kind === "folder" ? "Descargar todo (.zip)" : "Descargar archivo"}
                      </button>
                    )}
                    {info.kind === "file" && (
                      <button
                        className="btn-ghost"
                        onClick={() =>
                          setPreview({
                            id: "",
                            parent_id: null,
                            name: info.name,
                            kind: "file",
                            size: info.size,
                            mime_type: info.mime_type,
                            is_favorite: false,
                            created_at: info.created_at,
                            updated_at: info.created_at,
                            deleted_at: null,
                            has_share: true,
                          })
                        }
                      >
                        Vista previa
                      </button>
                    )}
                  </div>
                )
              )}
            </div>

            {info.kind === "file" && info.mime_type.startsWith("image/") && access !== null && (
              <div className="border-t border-white/[0.07] bg-ink-950/40 p-4">
                <img
                  src={shareRawUrl(token, access || undefined)}
                  alt={info.name}
                  className="mx-auto max-h-[52vh] w-auto rounded-xl object-contain"
                />
              </div>
            )}

            {info.kind === "folder" && access !== null && (
              <div className="p-3 sm:p-4">
                {items.length === 0 ? (
                  <p className="px-3 py-8 text-center text-xs text-slate-500">Esta carpeta esta vacia.</p>
                ) : (
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.04]"
                      >
                        <FileIcon name={item.name} mime={item.mime_type} kind={item.kind} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-200">{item.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {item.kind === "folder" ? "Carpeta" : formatBytes(item.size)}
                          </p>
                        </div>
                        {item.kind === "file" && info.allow_download && (
                          <button className="icon-btn" onClick={() => download(item.id)} aria-label="Descargar">
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        <p className="mt-8 flex items-center justify-center gap-2 text-center text-[11px] text-slate-600">
          <FolderOpen className="h-3.5 w-3.5" /> Compartido de forma segura con Nube
        </p>
      </main>

      <PreviewModal
        node={preview}
        onClose={() => setPreview(null)}
        onDownload={() => download()}
        onShare={() => undefined}
        shareToken={token}
        shareAccess={access ?? undefined}
        showShare={false}
      />
    </div>
  );
}
