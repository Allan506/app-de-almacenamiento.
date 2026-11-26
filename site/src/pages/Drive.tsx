import {
  ArrowDownToLine,
  ChevronRight,
  CloudOff,
  FolderOpen,
  Home,
  Infinity as InfinityIcon,
  Loader2,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ConfirmDialog, PromptDialog } from "../components/Dialogs";
import { FileCard, FileRow, type ItemAction } from "../components/FileViews";
import { MoveModal } from "../components/MoveModal";
import { PreviewModal } from "../components/PreviewModal";
import { SettingsModal } from "../components/SettingsModal";
import { Sidebar } from "../components/Sidebar";
import { StoragePanel } from "../components/StoragePanel";
import { Topbar } from "../components/Topbar";
import { UploadPanel } from "../components/UploadPanel";
import { useToast } from "../components/Toasts";
import { useBackHandler } from "../lib/backstack";
import { saveBlob } from "../lib/download";
import { filesFromDrop, filesFromInput, type PickedFile } from "../lib/files";
import { formatBytes } from "../lib/format";
import type { Vault } from "../lib/library";
import { buildBreadcrumb, liveChildren, matchesKind, matchesQuery, sortNodes, uid } from "../lib/tree";
import type { Section, SortKey, UploadTask, VaultConfig, VaultNode, VaultStats } from "../lib/types";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "folder", label: "Carpetas" },
  { id: "image", label: "Imagenes" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "document", label: "Documentos" },
];

const TITLES: Record<Section, { title: string; subtitle: string }> = {
  drive: { title: "Mi unidad", subtitle: "Todo tu contenido, en un solo lugar." },
  recent: { title: "Recientes", subtitle: "Lo ultimo que has anadido a tu nube." },
  favorites: { title: "Favoritos", subtitle: "Accesos rapidos a lo que mas usas." },
  trash: { title: "Papelera", subtitle: "Restaura lo que necesites o borralo para siempre." },
  storage: { title: "Almacenamiento", subtitle: "Cuanto ocupas y como se reparte." },
};

type QueueJob = { taskId: string; file: File; path: string; parentId: string | null; controller: AbortController };

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  action: () => Promise<void>;
};

type DownloadState = { name: string; progress: number };

export function Drive({
  vault,
  config,
  onConfigChange,
  onDisconnect,
}: {
  vault: Vault;
  config: VaultConfig;
  onConfigChange: (config: VaultConfig) => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const toast = useToast();

  const [nodes, setNodes] = useState<VaultNode[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("drive");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState<SortKey>(() => (localStorage.getItem("nube-lite.sort") as SortKey) || "name");
  const [view, setView] = useState<"grid" | "list">(
    () => (localStorage.getItem("nube-lite.view") as "grid" | "list") || "grid",
  );
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [dragging, setDragging] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [preview, setPreview] = useState<VaultNode | null>(null);
  const [moveNode, setMoveNode] = useState<VaultNode | null>(null);
  const [prompt, setPrompt] = useState<{ mode: "folder" | "rename"; node?: VaultNode } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [download, setDownload] = useState<DownloadState | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const queue = useRef<QueueJob[]>([]);
  const active = useRef(0);
  const dragDepth = useRef(0);

  const refresh = useCallback(async () => {
    const [list, statistics] = await Promise.all([vault.nodes(), vault.stats()]);
    setNodes(list);
    setStats(statistics);
  }, [vault]);

  const reportError = useCallback(
    (error: unknown, title: string) => {
      toast.error(title, error instanceof Error ? error.message : undefined);
    },
    [toast],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((error: unknown) => reportError(error, "No se pudo cargar la nube"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, reportError]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    localStorage.setItem("nube-lite.view", view);
  }, [view]);

  useBackHandler(() => {
    if (mobileNav) {
      setMobileNav(false);
      return true;
    }
    if (search) {
      setSearch("");
      setDebounced("");
      return true;
    }
    if (section !== "drive") {
      setSection("drive");
      setFolderId(null);
      return true;
    }
    if (folderId) {
      setFolderId(null);
      return true;
    }
    return false;
  }, 1);

  useEffect(() => {
    localStorage.setItem("nube-lite.sort", sort);
  }, [sort]);

  useEffect(() => {
    if (section !== "drive" || !folderId) return;
    const folder = nodes.find((node) => node.id === folderId && !node.deleted_at && node.kind === "folder");
    if (!folder) setFolderId(null);
  }, [nodes, section, folderId]);

  const trashRoots = useMemo(() => {
    const trashedIds = new Set(nodes.filter((node) => node.deleted_at).map((node) => node.id));
    return nodes.filter((node) => node.deleted_at && (!node.parent_id || !trashedIds.has(node.parent_id)));
  }, [nodes]);

  const items = useMemo(() => {
    const live = nodes.filter((node) => !node.deleted_at);
    if (section === "trash") return sortNodes(trashRoots, "-date");
    if (debounced)
      return sortNodes(live.filter((node) => matchesQuery(node, debounced) && matchesKind(node, kind)), sort);
    if (section === "favorites")
      return sortNodes(live.filter((node) => node.is_favorite && matchesKind(node, kind)), sort);
    if (section === "recent") return sortNodes(live.filter((node) => matchesKind(node, kind)), "-date").slice(0, 60);
    return sortNodes(liveChildren(live, folderId).filter((node) => matchesKind(node, kind)), sort);
  }, [nodes, trashRoots, section, debounced, kind, sort, folderId]);

  const breadcrumb = useMemo(() => buildBreadcrumb(nodes, folderId), [nodes, folderId]);
  const currentFolder = useMemo(() => nodes.find((node) => node.id === folderId) ?? null, [nodes, folderId]);
  const transferRoot = section === "drive" ? folderId : null;

  const updateTask = (id: string, patch: Partial<UploadTask>) =>
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)));

  function pump() {
    while (active.current < 2 && queue.current.length) {
      const job = queue.current.shift()!;
      active.current += 1;
      updateTask(job.taskId, { status: "uploading", progress: 0 });
      void vault
        .uploadFile(
          job.file,
          job.parentId,
          job.path,
          (loaded, total) => {
            if (total > 0) updateTask(job.taskId, { progress: Math.min(100, Math.round((loaded / total) * 100)) });
          },
          job.controller.signal,
        )
        .then(() => {
          updateTask(job.taskId, { status: "done", progress: 100 });
        })
        .catch((error: unknown) => {
          const aborted = job.controller.signal.aborted;
          updateTask(job.taskId, {
            status: aborted ? "canceled" : "error",
            error: aborted ? undefined : error instanceof Error ? error.message : "Error desconocido",
          });
          if (!aborted) toast.error("No se pudo subir", `${job.path}: ${error instanceof Error ? error.message : "error"}`);
        })
        .finally(() => {
          active.current -= 1;
          void refresh().finally(pump);
        });
    }
  }

  const addUploads = (picked: PickedFile[]) => {
    if (!picked.length) return;
    const jobs: QueueJob[] = picked.map(({ file, path }) => ({
      taskId: uid(),
      file,
      path,
      parentId: transferRoot,
      controller: new AbortController(),
    }));
    setTasks((current) => [
      ...current,
      ...jobs.map((job) => ({
        id: job.taskId,
        name: job.path,
        progress: 0,
        status: "queued" as const,
        controller: job.controller,
      })),
    ]);
    queue.current.push(...jobs);
    toast.info(`${jobs.length} archivo${jobs.length > 1 ? "s" : ""} en cola`);
    pump();
  };

  const cancelTask = (id: string) => {
    const queued = queue.current.find((job) => job.taskId === id);
    if (queued) {
      queue.current = queue.current.filter((job) => job.taskId !== id);
      updateTask(id, { status: "canceled" });
      return;
    }
    setTasks((current) => {
      current.find((item) => item.id === id)?.controller.abort();
      return current.map((item) => (item.id === id ? { ...item, status: "canceled" } : item));
    });
  };

  const downloadNode = async (node: VaultNode) => {
    setDownload({ name: node.name, progress: 0 });
    try {
      const blob =
        node.kind === "folder"
          ? await vault.zipFolder(node, (ratio) =>
              setDownload({ name: `${node.name}.zip`, progress: Math.round(ratio * 100) }),
            )
          : await vault.readFile(node, (loaded, total) =>
              setDownload({ name: node.name, progress: total ? Math.round((loaded / total) * 100) : 0 }),
            );
      saveBlob(blob, node.kind === "folder" ? `${node.name}.zip` : node.name);
      toast.success("Descarga lista", `${node.name} · ${formatBytes(blob.size)}`);
    } catch (error) {
      reportError(error, "No se pudo descargar");
    } finally {
      setDownload(null);
    }
  };

  const handleAction = (action: ItemAction, node: VaultNode) => {
    switch (action) {
      case "open":
        if (node.kind === "folder") {
          setSection("drive");
          setFolderId(node.id);
          setSearch("");
          setKind("all");
        } else {
          setPreview(node);
        }
        break;
      case "preview":
        setPreview(node);
        break;
      case "download":
        void downloadNode(node);
        break;
      case "rename":
        setPrompt({ mode: "rename", node });
        break;
      case "move":
        setMoveNode(node);
        break;
      case "favorite":
        void vault
          .setFavorite(node, !node.is_favorite)
          .then(refresh)
          .catch((error: unknown) => reportError(error, "No se pudo actualizar"));
        break;
      case "trash":
        setConfirm({
          title: "Mover a la papelera",
          message:
            node.kind === "folder"
              ? `"${node.name}" y todo su contenido se moveran a la papelera. Podras restaurarlo despues.`
              : `"${node.name}" se movera a la papelera. Podras restaurarlo despues.`,
          confirmLabel: "Mover a la papelera",
          action: async () => {
            await vault.trashNode(node);
            toast.success("Movido a la papelera", node.name);
            await refresh();
          },
        });
        break;
      case "restore":
        setConfirm({
          title: "Restaurar elemento",
          message: `"${node.name}" volvera a su carpeta original.`,
          confirmLabel: "Restaurar",
          tone: "primary",
          action: async () => {
            await vault.restoreNode(node);
            toast.success("Restaurado", node.name);
            await refresh();
          },
        });
        break;
      case "purge":
        setConfirm({
          title: "Borrar para siempre",
          message: `"${node.name}" se eliminara definitivamente, tambien de Telegram. Esta accion no se puede deshacer.`,
          confirmLabel: "Borrar para siempre",
          action: async () => {
            await vault.purgeNode(node);
            toast.success("Eliminado", node.name);
            await refresh();
          },
        });
        break;
    }
  };

  const submitPrompt = async (value: string) => {
    if (!prompt) return;
    if (prompt.mode === "folder") {
      await vault.createFolder(value, transferRoot);
      toast.success("Carpeta creada", value);
    } else if (prompt.node) {
      await vault.renameNode(prompt.node, value);
      toast.success("Renombrado", value);
    }
    await refresh();
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await confirm.action();
      setConfirm(null);
    } catch (error) {
      reportError(error, "No se pudo completar");
    } finally {
      setConfirmBusy(false);
    }
  };

  const emptyTrash = () => {
    if (!trashRoots.length) return;
    setConfirm({
      title: "Vaciar la papelera",
      message: `Se borraran ${trashRoots.length} elemento(s) para siempre, incluidos los mensajes en Telegram.`,
      confirmLabel: "Vaciar papelera",
      action: async () => {
        const removed = await vault.emptyTrash();
        toast.success(`${removed} elementos eliminados`);
        await refresh();
      },
    });
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    try {
      addUploads(await filesFromDrop(event.dataTransfer));
    } catch (error) {
      reportError(error, "No se pudieron leer los archivos");
    }
  };

  const title = debounced ? { title: "Busqueda", subtitle: `Resultados para "${debounced}"` } : TITLES[section];

  return (
    <div
      className="flex h-full min-h-0"
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <Sidebar
        section={section}
        onSection={setSection}
        stats={stats}
        config={config}
        onUpload={() => fileInput.current?.click()}
        onNewFolder={() => setPrompt({ mode: "folder" })}
        onSettings={() => setSettingsOpen(true)}
        mobileOpen={mobileNav}
        onCloseMobile={() => setMobileNav(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          search={search}
          onSearch={setSearch}
          view={view}
          onView={setView}
          sort={sort}
          onSort={setSort}
          onUpload={() => fileInput.current?.click()}
          onNewFolder={() => setPrompt({ mode: "folder" })}
          onMenu={() => setMobileNav(true)}
        />

        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-4 sm:px-5">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title.title}</h1>
                <p className="mt-0.5 text-[12px] text-slate-500">{title.subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                {section === "trash" && trashRoots.length > 0 && (
                  <button className="btn-danger px-3 py-2 text-[12px]" onClick={emptyTrash}>
                    <Trash2 className="h-4 w-4" /> Vaciar papelera
                  </button>
                )}
                {section === "drive" && (
                  <button className="btn-ghost px-3 py-2 text-[12px]" onClick={() => folderInput.current?.click()}>
                    <FolderOpen className="h-4 w-4" />
                    <span className="hidden sm:inline">Subir carpeta</span>
                  </button>
                )}
              </div>
            </div>

            {section === "drive" && !debounced && (
              <nav className="mt-3 flex flex-wrap items-center gap-1 text-[12px]" aria-label="Ruta de carpetas">
                <button
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-white/[0.06] ${
                    folderId ? "text-slate-400" : "font-semibold text-white"
                  }`}
                  onClick={() => setFolderId(null)}
                >
                  <Home className="h-3.5 w-3.5" /> Mi unidad
                </button>
                {breadcrumb.map((crumb) => (
                  <span key={crumb.id} className="inline-flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                    <button
                      className={`rounded-lg px-2 py-1 transition hover:bg-white/[0.06] ${
                        crumb.id === folderId ? "font-semibold text-white" : "text-slate-400"
                      }`}
                      onClick={() => setFolderId(crumb.id)}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </nav>
            )}

            {section !== "storage" && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    className={`chip ${kind === filter.id ? "chip-active" : ""}`}
                    onClick={() => setKind(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
                {section !== "drive" && items.length > 0 && (
                  <span className="ml-auto text-[11px] text-slate-500">{items.length} elementos</span>
                )}
              </div>
            )}

            <div className="mt-4">
              {section === "storage" ? (
                <StoragePanel stats={stats} />
              ) : loading ? (
                <div className={view === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" : "space-y-2"}>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className={view === "grid" ? "skeleton h-28" : "skeleton h-14"} />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  section={section}
                  query={debounced}
                  onUpload={() => fileInput.current?.click()}
                  onFolder={() => setPrompt({ mode: "folder" })}
                />
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {items.map((node) => (
                    <FileCard key={node.id} node={node} section={section} onAction={handleAction} />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {items.map((node) => (
                    <FileRow key={node.id} node={node} section={section} onAction={handleAction} />
                  ))}
                </div>
              )}
            </div>

            {section !== "storage" && items.length > 0 && (
              <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-slate-600">
                <InfinityIcon className="h-3 w-3" /> Sin cuotas ni caducidad: tus archivos siguen en tu espacio de Nube.
              </p>
            )}
          </div>
        </main>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          addUploads(filesFromInput(event.target));
          event.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(event) => {
          addUploads(filesFromInput(event.target));
          event.target.value = "";
        }}
      />

      <UploadPanel
        tasks={tasks}
        onClear={() => setTasks((current) => current.filter((task) => task.status === "uploading"))}
        onCancel={cancelTask}
        onDismiss={(id) => setTasks((current) => current.filter((task) => task.id !== id))}
      />

      {download && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(340px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-ink-850/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 shrink-0 text-cloud-300" />
            <p className="min-w-0 flex-1 truncate text-[12px] text-slate-200">{download.name}</p>
            <span className="text-[10px] tabular-nums text-slate-500">{download.progress}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cloud-400 transition-all" style={{ width: `${download.progress}%` }} />
          </div>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink-950/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-cloud-400/60 px-12 py-10">
            <Upload className="h-8 w-8 animate-bounce text-cloud-300" />
            <p className="text-sm font-semibold text-white">
              Suelta para subir a {currentFolder?.name ?? "Mi unidad"}
            </p>
            <p className="text-[11px] text-slate-400">Se conservan las carpetas y se trocean los archivos grandes.</p>
          </div>
        </div>
      )}

      <PreviewModal node={preview} vault={vault} onClose={() => setPreview(null)} onDownload={downloadNode} />

      <MoveModal
        node={moveNode}
        nodes={nodes}
        onClose={() => setMoveNode(null)}
        onMove={async (target) => {
          if (!moveNode) return;
          await vault.moveNode(moveNode, target);
          toast.success("Movido", moveNode.name);
          await refresh();
        }}
      />

      <PromptDialog
        open={Boolean(prompt)}
        title={prompt?.mode === "rename" ? "Renombrar" : "Nueva carpeta"}
        label={prompt?.mode === "rename" ? "Nuevo nombre" : "Nombre de la carpeta"}
        initialValue={prompt?.mode === "rename" ? prompt.node?.name ?? "" : ""}
        placeholder={prompt?.mode === "rename" ? "documento.pdf" : "Proyectos"}
        confirmLabel={prompt?.mode === "rename" ? "Renombrar" : "Crear"}
        hint={prompt?.mode === "folder" ? `Se creara en ${currentFolder?.name ?? "Mi unidad"}.` : undefined}
        onClose={() => setPrompt(null)}
        onSubmit={submitPrompt}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        busy={confirmBusy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />

      <SettingsModal
        open={settingsOpen}
        config={config}
        vault={vault}
        usedBytes={stats?.used ?? 0}
        onClose={() => setSettingsOpen(false)}
        onSave={onConfigChange}
        onWipe={onDisconnect}
        onDataChanged={refresh}
      />
    </div>
  );
}

function EmptyState({
  section,
  query,
  onUpload,
  onFolder,
}: {
  section: Section;
  query: string;
  onUpload: () => void;
  onFolder: () => void;
}) {
  const copy: Record<Section, { icon: typeof CloudOff; title: string; text: string }> = {
    drive: {
      icon: Upload,
      title: "Esta carpeta esta vacia",
      text: "Arrastra archivos o carpetas, o usa los botones de arriba.",
    },
    recent: { icon: CloudOff, title: "Aun no hay actividad", text: "Sube tu primer archivo y aparecera aqui." },
    favorites: { icon: Search, title: "Sin favoritos", text: "Marca con la estrella lo que quieras tener a mano." },
    trash: {
      icon: Trash2,
      title: "La papelera esta vacia",
      text: "Los elementos borrados se guardan aqui hasta que los elimines.",
    },
    storage: { icon: CloudOff, title: "Sin datos", text: "" },
  };
  const item = query
    ? { icon: Search, title: "Sin resultados", text: `No encontramos nada para "${query}".` }
    : copy[section];
  const Icon = item.icon;

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-200">{item.title}</p>
      <p className="mt-1 max-w-sm text-[12px] text-slate-500">{item.text}</p>
      {section === "drive" && !query && (
        <div className="mt-4 flex gap-2">
          <button className="btn-primary px-3 py-2 text-[12px]" onClick={onUpload}>
            <Upload className="h-4 w-4" /> Subir archivos
          </button>
          <button className="btn-ghost px-3 py-2 text-[12px]" onClick={onFolder}>
            Nueva carpeta
          </button>
        </div>
      )}
    </div>
  );
}

export function DriveSplash() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-cloud-400" />
        <p className="text-xs text-slate-500">Cargando tu nube...</p>
      </div>
    </div>
  );
}
