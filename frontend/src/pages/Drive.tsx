import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  CloudUpload,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Inbox,
  Link2,
  Loader2,
  PieChart,
  RotateCcw,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import {
  api,
  ApiError,
  downloadUrl,
  getMediaToken,
  uploadFile,
  type Breadcrumb,
  type NodeItem,
  type Share,
  type Stats,
} from "../lib/api";
import { formatBytes, formatDate, timeAgo } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Sidebar, type Section } from "../components/Sidebar";
import { Topbar } from "../components/Topbar";
import { FileItem } from "../components/FileItem";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ShareModal } from "../components/ShareModal";
import { PreviewModal } from "../components/PreviewModal";
import { AccountModal } from "../components/AccountModal";
import { UploadPanel, type UploadTask } from "../components/UploadPanel";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "folder", label: "Carpetas" },
  { id: "image", label: "Imagenes" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "document", label: "Documentos" },
];

const ACTION_LABELS: Record<string, string> = {
  login: "Inicio de sesion",
  logout: "Cierre de sesion",
  upload: "Subida",
  download: "Descarga",
  share: "Enlace creado",
  unshare: "Enlace revocado",
  trash: "A la papelera",
  restore: "Restaurado",
  purge: "Eliminado",
  rename: "Renombrado",
  move: "Movido",
  folder: "Carpeta creada",
};

const TITLES: Record<Section, { title: string; subtitle: string }> = {
  drive: { title: "Mi unidad", subtitle: "Todos tus archivos, organizados y siempre disponibles." },
  recent: { title: "Recientes", subtitle: "Lo ultimo que has anadido a tu nube." },
  favorites: { title: "Favoritos", subtitle: "Accesos rapidos a lo que mas utilizas." },
  shared: { title: "Compartidos", subtitle: "Gestiona los enlaces publicos que has creado." },
  trash: { title: "Papelera", subtitle: "Restaura elementos o eliminalos definitivamente." },
  storage: { title: "Almacenamiento", subtitle: "Uso, distribucion y actividad de tu cuenta." },
};

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  action: () => Promise<void>;
};

export function Drive() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, signOut, setUser } = useAuth();

  const [section, setSection] = useState<Section>("drive");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb[]>([]);
  const [items, setItems] = useState<NodeItem[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState<"grid" | "list">(
    () => (localStorage.getItem("nube.view") as "grid" | "list") || "grid",
  );
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [dragging, setDragging] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [mobileNav, setMobileNav] = useState(false);

  const [prompt, setPrompt] = useState<{ mode: "folder" | "rename"; node?: NodeItem } | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [promptBusy, setPromptBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [shareNode, setShareNode] = useState<NodeItem | null>(null);
  const [previewNode, setPreviewNode] = useState<NodeItem | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      toast.error("Algo salio mal", error instanceof Error ? error.message : undefined);
    },
    [navigate, toast],
  );

  const refreshStats = useCallback(async () => {
    try {
      setStats(await api.stats());
    } catch {
      /* non critical */
    }
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      if (section === "storage") {
        setStats(await api.stats());
        setLoading(false);
        return;
      }
      if (section === "shared") {
        setShares(await api.listShares());
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await api.listNodes({
        parent_id: section === "drive" ? folderId : null,
        search: debounced || undefined,
        kind: kind !== "all" ? kind : undefined,
        favorites: section === "favorites",
        trashed: section === "trash",
        recent: section === "recent",
        sort,
      });
      setItems(result.items);
      setBreadcrumb(result.breadcrumb);
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  }, [user, section, folderId, debounced, kind, sort, handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    localStorage.setItem("nube.view", view);
  }, [view]);

  useEffect(() => {
    const images = items.filter((item) => item.kind === "file" && item.mime_type.startsWith("image/")).slice(0, 80);
    if (!images.length) return;
    let cancelled = false;
    getMediaToken()
      .then((token) => {
        if (cancelled) return;
        setThumbs(Object.fromEntries(images.map((item) => [item.id, `/api/nodes/${item.id}/raw?t=${token}`])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [items]);

  const currentFolderName = useMemo(
    () => breadcrumb[breadcrumb.length - 1]?.name ?? "Mi unidad",
    [breadcrumb],
  );

  const heading = section === "drive" ? currentFolderName : TITLES[section].title;
  const subtitle = section === "drive" && breadcrumb.length > 0 ? `${items.length} elementos en esta carpeta` : TITLES[section].subtitle;

  const goSection = (next: Section) => {
    setSection(next);
    setSearch("");
    setKind("all");
    if (next === "drive") setFolderId(null);
  };

  const openFolder = (node: NodeItem) => {
    setFolderId(node.id);
    setSection("drive");
    setSearch("");
  };

  const triggerDownload = async (node: NodeItem) => {
    try {
      const url = await downloadUrl(node.id);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast.info("Descarga iniciada", node.name);
    } catch (error) {
      handleError(error);
    }
  };

  const runUpload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const target = section === "drive" ? folderId : null;
      for (const file of files) {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setUploads((current) => [...current, { id, name: file.name, progress: 0, status: "uploading" }]);
        try {
          const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined;
          await uploadFile(file, target, relative || undefined, (progress) =>
            setUploads((current) => current.map((task) => (task.id === id ? { ...task, progress } : task))),
          );
          setUploads((current) =>
            current.map((task) => (task.id === id ? { ...task, progress: 100, status: "done" } : task)),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error desconocido";
          setUploads((current) =>
            current.map((task) => (task.id === id ? { ...task, status: "error", error: message } : task)),
          );
          toast.error(`No se pudo subir ${file.name}`, message);
        }
      }
      await load();
      void refreshStats();
    },
    [section, folderId, load, refreshStats, toast],
  );

  const submitPrompt = async () => {
    const value = promptValue.trim();
    if (!value || !prompt) return;
    setPromptBusy(true);
    try {
      if (prompt.mode === "folder") {
        await api.createFolder(value, section === "drive" ? folderId : null);
        toast.success("Carpeta creada");
      } else if (prompt.node) {
        await api.updateNode(prompt.node.id, { name: value });
        toast.success("Nombre actualizado");
      }
      setPrompt(null);
      await load();
      void refreshStats();
    } catch (error) {
      handleError(error);
    } finally {
      setPromptBusy(false);
    }
  };

  const toggleFavorite = async (node: NodeItem) => {
    try {
      const updated = await api.updateNode(node.id, { is_favorite: !node.is_favorite });
      setItems((current) => current.map((item) => (item.id === node.id ? { ...item, is_favorite: updated.is_favorite } : item)));
      void refreshStats();
    } catch (error) {
      handleError(error);
    }
  };

  const trash = (node: NodeItem) =>
    setConfirm({
      title: "Mover a la papelera",
      message: `"${node.name}"${node.kind === "folder" ? " y todo su contenido" : ""} se movera a la papelera. Podras restaurarlo despues.`,
      confirmLabel: "Mover a la papelera",
      action: async () => {
        await api.trashNode(node.id);
        toast.info("Movido a la papelera", node.name);
        await load();
        void refreshStats();
      },
    });

  const purge = (node: NodeItem) =>
    setConfirm({
      title: "Eliminar definitivamente",
      message: `"${node.name}" se borrara para siempre. Esta accion no se puede deshacer.`,
      confirmLabel: "Eliminar para siempre",
      action: async () => {
        await api.purgeNode(node.id);
        toast.success("Eliminado definitivamente");
        await load();
        void refreshStats();
      },
    });

  const restore = async (node: NodeItem) => {
    try {
      await api.restoreNode(node.id);
      toast.success("Elemento restaurado", node.name);
      await load();
      void refreshStats();
    } catch (error) {
      handleError(error);
    }
  };

  const revokeShare = async (share: Share) => {
    try {
      await api.deleteShare(share.id);
      setShares((current) => current.filter((item) => item.id !== share.id));
      toast.info("Enlace revocado");
      void refreshStats();
    } catch (error) {
      handleError(error);
    }
  };

  const copyShare = async (share: Share) => {
    await navigator.clipboard.writeText(share.url).catch(() => undefined);
    toast.success("Enlace copiado");
  };

  if (!user) return null;

  const isEmpty = !loading && items.length === 0;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        section={section}
        onSection={goSection}
        stats={stats}
        user={user}
        onUpload={() => fileInput.current?.click()}
        onNewFolder={() => {
          setPromptValue("");
          setPrompt({ mode: "folder" });
        }}
        onAccount={() => setAccountOpen(true)}
        onSignOut={() => void signOut().then(() => navigate("/login"))}
        mobileOpen={mobileNav}
        onCloseMobile={() => setMobileNav(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          search={search}
          onSearch={setSearch}
          view={view}
          onView={setView}
          sort={sort}
          onSort={setSort}
          onOpenMenu={() => setMobileNav(true)}
          onAccount={() => setAccountOpen(true)}
          hideSort={section === "storage" || section === "shared"}
        />

        <main
          className="relative flex-1 overflow-y-auto"
          onDragOver={(event) => {
            event.preventDefault();
            if (section !== "trash" && section !== "shared" && section !== "storage") setDragging(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (section === "trash" || section === "shared" || section === "storage") return;
            void runUpload(Array.from(event.dataTransfer.files));
          }}
        >
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-7 md:py-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                {section === "drive" && breadcrumb.length > 0 && (
                  <div className="mb-2 flex items-center gap-1 overflow-x-auto text-xs text-slate-500">
                    <button
                      onClick={() => {
                        setFolderId(null);
                        setSearch("");
                      }}
                      className="rounded-md px-1.5 py-1 transition hover:bg-white/[0.06] hover:text-slate-200"
                    >
                      Mi unidad
                    </button>
                    {breadcrumb.map((crumb, index) => (
                      <span key={crumb.id ?? index} className="flex items-center gap-1">
                        <ChevronRight className="h-3 w-3 shrink-0" />
                        <button
                          onClick={() => setFolderId(crumb.id)}
                          className={`max-w-[180px] truncate rounded-md px-1.5 py-1 transition hover:bg-white/[0.06] hover:text-slate-200 ${
                            index === breadcrumb.length - 1 ? "font-semibold text-slate-200" : ""
                          }`}
                        >
                          {crumb.name}
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <h1 className="truncate text-2xl font-bold tracking-tight text-white md:text-[26px]">{heading}</h1>
                <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {section === "trash" && !!items.length && (
                  <button
                    className="btn-danger"
                    onClick={() =>
                      setConfirm({
                        title: "Vaciar la papelera",
                        message: "Se eliminaran definitivamente todos los elementos de la papelera. Esta accion no se puede deshacer.",
                        confirmLabel: "Vaciar papelera",
                        action: async () => {
                          const result = await api.emptyTrash();
                          toast.success("Papelera vaciada", `${result.removed} elementos eliminados`);
                          await load();
                          void refreshStats();
                        },
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" /> Vaciar papelera
                  </button>
                )}
                {section !== "trash" && section !== "shared" && section !== "storage" && (
                  <>
                    <button className="btn-ghost" onClick={() => folderInput.current?.click()}>
                      <FolderPlus className="h-4 w-4" /> Subir carpeta
                    </button>
                    <button className="btn-primary" onClick={() => fileInput.current?.click()}>
                      <Upload className="h-4 w-4" /> Subir archivos
                    </button>
                  </>
                )}
              </div>
            </div>

            {(section === "drive" || section === "recent" || section === "favorites") && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setKind(filter.id)}
                    className={`chip ${kind === filter.id ? "chip-active" : ""}`}
                  >
                    {filter.label}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-slate-600">
                  {loading ? "Cargando..." : `${items.length} elemento${items.length === 1 ? "" : "s"}`}
                </span>
              </div>
            )}

            <div className="mt-5">
              {loading ? (
                <div className={view === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "space-y-2"}>
                  {Array.from({ length: view === "grid" ? 8 : 6 }).map((_, index) => (
                    <div key={index} className={view === "grid" ? "h-[168px] skeleton" : "h-14 skeleton"} />
                  ))}
                </div>
              ) : section === "storage" ? (
                <StorageView stats={stats} />
              ) : section === "shared" ? (
                <SharesView shares={shares} onCopy={copyShare} onRevoke={revokeShare} />
              ) : isEmpty ? (
                <EmptyState section={section} search={debounced} onUpload={() => fileInput.current?.click()} onNewFolder={() => setPrompt({ mode: "folder" })} />
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {items.map((node) => (
                    <FileItem
                      key={node.id}
                      node={node}
                      view="grid"
                      trash={section === "trash"}
                      thumbnail={thumbs[node.id]}
                      onOpen={openFolder}
                      onPreview={setPreviewNode}
                      onDownload={(item) => void triggerDownload(item)}
                      onShare={setShareNode}
                      onRename={(item) => {
                        setPromptValue(item.name);
                        setPrompt({ mode: "rename", node: item });
                      }}
                      onToggleFavorite={(item) => void toggleFavorite(item)}
                      onTrash={trash}
                      onRestore={(item) => void restore(item)}
                      onPurge={purge}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {items.map((node) => (
                    <FileItem
                      key={node.id}
                      node={node}
                      view="list"
                      trash={section === "trash"}
                      onOpen={openFolder}
                      onPreview={setPreviewNode}
                      onDownload={(item) => void triggerDownload(item)}
                      onShare={setShareNode}
                      onRename={(item) => {
                        setPromptValue(item.name);
                        setPrompt({ mode: "rename", node: item });
                      }}
                      onToggleFavorite={(item) => void toggleFavorite(item)}
                      onTrash={trash}
                      onRestore={(item) => void restore(item)}
                      onPurge={purge}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-ink-950/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-cloud-400/60 px-14 py-12">
                <CloudUpload className="h-10 w-10 text-cloud-300" />
                <p className="text-sm font-semibold text-white">Suelta para subir a {section === "drive" ? currentFolderName : "tu nube"}</p>
                <p className="text-xs text-slate-400">Archivos grandes bienvenidos: sin limites artificiales</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          void runUpload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        // @ts-expect-error non-standard attribute used by Chromium/WebKit
        webkitdirectory="true"
        directory=""
        className="hidden"
        onChange={(event) => {
          void runUpload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      <UploadPanel
        tasks={uploads}
        onClear={() => setUploads((current) => current.filter((task) => task.status === "uploading"))}
        onDismiss={(id) => setUploads((current) => current.filter((task) => task.id !== id))}
      />

      <Modal
        open={!!prompt}
        onClose={() => setPrompt(null)}
        title={prompt?.mode === "rename" ? "Renombrar" : "Nueva carpeta"}
        description={prompt?.mode === "rename" ? prompt.node?.name : "Se creara en la ubicacion actual"}
        size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setPrompt(null)} disabled={promptBusy}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={() => void submitPrompt()} disabled={promptBusy || !promptValue.trim()}>
              {promptBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
              {prompt?.mode === "rename" ? "Guardar" : "Crear carpeta"}
            </button>
          </>
        }
      >
        <input
          autoFocus
          value={promptValue}
          onChange={(event) => setPromptValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submitPrompt();
          }}
          placeholder={prompt?.mode === "rename" ? "Nuevo nombre" : "Nombre de la carpeta"}
          className="field"
          maxLength={200}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await confirm.action();
          } catch (error) {
            handleError(error);
          }
        }}
        onClose={() => setConfirm(null)}
      />

      <ShareModal node={shareNode} onClose={() => setShareNode(null)} onChanged={() => void load()} />

      <PreviewModal
        node={previewNode}
        onClose={() => setPreviewNode(null)}
        onDownload={(item) => void triggerDownload(item)}
        onShare={(item) => {
          setPreviewNode(null);
          setShareNode(item);
        }}
      />

      <AccountModal
        open={accountOpen}
        user={user}
        stats={stats}
        onClose={() => setAccountOpen(false)}
        onUpdated={(updated) => {
          setUser(updated);
          void refreshStats();
        }}
        onSignOut={() => void signOut().then(() => navigate("/login"))}
        onDeleteAccount={() => {
          setAccountOpen(false);
          setConfirm({
            title: "Eliminar tu cuenta",
            message: "Se borraran tu cuenta y todos los archivos de forma permanente. Esta accion no se puede deshacer.",
            confirmLabel: "Eliminar cuenta",
            action: async () => {
              await api.deleteAccount();
              await signOut();
              navigate("/login", { replace: true });
            },
          });
        }}
      />
    </div>
  );
}

function EmptyState({
  section,
  search,
  onUpload,
  onNewFolder,
}: {
  section: Section;
  search: string;
  onUpload: () => void;
  onNewFolder: () => void;
}) {
  const config = search
    ? { icon: Search, title: "Sin resultados", text: `No encontramos nada para "${search}".` }
    : section === "trash"
      ? { icon: Trash2, title: "La papelera esta vacia", text: "Los elementos eliminados apareceran aqui." }
      : section === "favorites"
        ? { icon: Star, title: "Sin favoritos", text: "Marca archivos con la estrella para tenerlos siempre a mano." }
        : section === "recent"
          ? { icon: Inbox, title: "Nada reciente", text: "Sube tu primer archivo para empezar." }
          : { icon: FolderOpen, title: "Esta carpeta esta vacia", text: "Arrastra archivos aqui o usa los botones para empezar." };
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 py-20 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{config.title}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-slate-500">{config.text}</p>
      {!search && section !== "trash" && section !== "favorites" && (
        <div className="mt-5 flex gap-2">
          <button className="btn-primary" onClick={onUpload}>
            <Upload className="h-4 w-4" /> Subir archivos
          </button>
          <button className="btn-ghost" onClick={onNewFolder}>
            <FolderPlus className="h-4 w-4" /> Nueva carpeta
          </button>
        </div>
      )}
    </div>
  );
}

function SharesView({
  shares,
  onCopy,
  onRevoke,
}: {
  shares: Share[];
  onCopy: (share: Share) => void;
  onRevoke: (share: Share) => void;
}) {
  if (shares.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 py-20 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400">
          <Link2 className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-white">Aun no compartes nada</h3>
        <p className="mt-1 max-w-sm text-[13px] text-slate-500">
          Usa el menu de cualquier archivo o carpeta y elige "Compartir" para generar un enlace.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {shares.map((share) => (
        <div key={share.id} className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4 transition hover:border-cloud-400/25">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cloud-500/15 text-cloud-200">
              {share.node_kind === "folder" ? <FolderOpen className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">{share.node_name}</p>
              <p className="text-[11px] text-slate-500">
                {share.node_kind === "folder" ? "Carpeta" : formatBytes(share.node_size)} · {share.download_count} descargas
              </p>
            </div>
          </div>
          <p className="mt-3 truncate rounded-lg bg-ink-950/60 px-2.5 py-2 font-mono text-[11px] text-cloud-200">{share.url}</p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>{share.expires_at ? `Caduca ${formatDate(share.expires_at)}` : "Sin caducidad"}</span>
            <span>{share.has_password ? "Con contrasena" : "Publico"}</span>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-ghost flex-1 py-2 text-xs" onClick={() => onCopy(share)}>
              <Copy className="h-3.5 w-3.5" /> Copiar
            </button>
            <a href={share.url} target="_blank" rel="noreferrer" className="btn-ghost py-2 text-xs">
              <Download className="h-3.5 w-3.5" /> Abrir
            </a>
            <button className="btn-danger px-3 py-2 text-xs" onClick={() => onRevoke(share)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StorageView({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 skeleton" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "En uso", value: formatBytes(stats.used), icon: HardDrive, tone: "text-cloud-200 bg-cloud-500/15" },
    { label: "Archivos", value: String(stats.files), icon: FilePlus2, tone: "text-emerald-300 bg-emerald-500/15" },
    { label: "Carpetas", value: String(stats.folders), icon: FolderOpen, tone: "text-amber-300 bg-amber-500/15" },
    { label: "Compartidos", value: String(stats.shared), icon: Share2, tone: "text-violet-300 bg-violet-500/15" },
  ];

  const total = stats.by_type.reduce((sum, item) => sum + item.size, 0) || 1;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4">
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white">{value}</p>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <PieChart className="h-4 w-4 text-cloud-300" /> Distribucion por tipo
            </h3>
            <span className="text-[11px] text-slate-500">{stats.quota ? `${formatBytes(stats.quota)} de plan` : "Sin limite"}</span>
          </div>

          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
            {stats.by_type.length === 0 ? (
              <div className="h-full w-full bg-white/10" />
            ) : (
              stats.by_type.map((item, index) => (
                <div
                  key={item.label}
                  className={["bg-cloud-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400", "bg-violet-400"][index % 5]}
                  style={{ width: `${(item.size / total) * 100}%` }}
                  title={`${item.label}: ${formatBytes(item.size)}`}
                />
              ))
            )}
          </div>

          <div className="mt-4 space-y-2.5">
            {stats.by_type.length === 0 && <p className="text-xs text-slate-500">Sube archivos para ver el desglose.</p>}
            {stats.by_type.map((item, index) => (
              <div key={item.label} className="flex items-center gap-2.5 text-xs">
                <span className={["h-2.5 w-2.5 rounded-full bg-cloud-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400", "bg-violet-400"][index % 5]} />
                <span className="flex-1 text-slate-300">{item.label}</span>
                <span className="text-slate-500">{item.count} archivos</span>
                <span className="w-16 text-right font-medium text-slate-200">{formatBytes(item.size)}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5 text-xs">
            <span className="flex items-center gap-2 text-slate-400">
              <RotateCcw className="h-3.5 w-3.5" /> En papelera
            </span>
            <span className="text-slate-200">
              {stats.trash_count} elementos · {formatBytes(stats.trash_size)}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-ink-850/60 p-5">
          <h3 className="text-sm font-semibold text-white">Actividad reciente</h3>
          <div className="mt-4 space-y-3">
            {stats.activity.length === 0 && <p className="text-xs text-slate-500">Todavia no hay actividad.</p>}
            {stats.activity.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cloud-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-300">
                    <span className="font-medium text-slate-200">{ACTION_LABELS[item.action] ?? item.action}</span>
                    {item.node_name ? ` · ${item.node_name}` : ""}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    {timeAgo(item.created_at)}
                    {item.size ? ` · ${formatBytes(item.size)}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
