import { Clock3, Cloud, HardDrive, Infinity as InfinityIcon, PieChart, Plus, Settings, Smartphone, Star, Trash2, X } from "lucide-react";
import { promptInstall, useInstallPrompt } from "../lib/pwa";
import { formatBytes } from "../lib/format";
import type { Section, VaultConfig, VaultStats } from "../lib/types";

const NAV: { id: Section; label: string; icon: typeof HardDrive }[] = [
  { id: "drive", label: "Mi unidad", icon: HardDrive },
  { id: "recent", label: "Recientes", icon: Clock3 },
  { id: "favorites", label: "Favoritos", icon: Star },
  { id: "trash", label: "Papelera", icon: Trash2 },
  { id: "storage", label: "Almacenamiento", icon: PieChart },
];

const TYPE_COLORS = ["bg-cloud-400", "bg-rose-400", "bg-fuchsia-400", "bg-emerald-400", "bg-amber-400"];

export function Sidebar({
  section,
  onSection,
  stats,
  config,
  onUpload,
  onNewFolder,
  onSettings,
  mobileOpen,
  onCloseMobile,
}: {
  section: Section;
  onSection: (section: Section) => void;
  stats: VaultStats | null;
  config: VaultConfig;
  onUpload: () => void;
  onNewFolder: () => void;
  onSettings: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const canInstall = useInstallPrompt();
  const used = stats?.used ?? 0;
  const segments = (stats?.by_type ?? [])
    .map((entry, index) => ({ ...entry, color: TYPE_COLORS[index % TYPE_COLORS.length] }))
    .filter((entry) => entry.size > 0);

  const content = (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-cloud-400 via-cloud-500 to-violet-500 text-white shadow-lg shadow-cloud-600/30">
            <Cloud className="h-4.5 w-4.5" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-white">Nube</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Almacenamiento</p>
          </div>
        </div>
        <button className="icon-btn lg:hidden" onClick={onCloseMobile} aria-label="Cerrar menu">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <button onClick={onUpload} className="btn-primary w-full">
          <Plus className="h-4 w-4" /> Subir archivos
        </button>
        <button onClick={onNewFolder} className="btn-ghost w-full">
          <Plus className="h-4 w-4" /> Nueva carpeta
        </button>
      </div>

      <nav className="space-y-1">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-link ${section === id ? "nav-link-active" : ""}`}
            onClick={() => {
              onSection(id);
              onCloseMobile();
            }}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1 text-left">{label}</span>
            {id === "trash" && (stats?.trash_count ?? 0) > 0 && (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                {stats?.trash_count}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Espacio usado</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              <InfinityIcon className="h-3 w-3" /> Ilimitado
            </span>
          </div>
          <p className="mt-1 text-xl font-bold tracking-tight text-white">{formatBytes(used)}</p>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/10">
            {segments.length
              ? segments.map((entry) => (
                  <div
                    key={entry.label}
                    className={entry.color}
                    style={{ width: `${(entry.size / Math.max(used, 1)) * 100}%` }}
                    title={`${entry.label}: ${formatBytes(entry.size)}`}
                  />
                ))
              : null}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {stats?.files ?? 0} {(stats?.files ?? 0) === 1 ? "archivo" : "archivos"} · {stats?.folders ?? 0}{" "}
            {(stats?.folders ?? 0) === 1 ? "carpeta" : "carpetas"}
          </p>
        </div>

        {canInstall && (
          <button className="btn-ghost w-full px-3 py-2 text-[12px]" onClick={() => void promptInstall()}>
            <Smartphone className="h-4 w-4" /> Instalar Nube
          </button>
        )}

        <button
          className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-white/15 hover:bg-white/[0.05]"
          onClick={onSettings}
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-cloud-500/15 text-cloud-200">
            {config.driver === "telegram" ? <Cloud className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-slate-100">
              {config.driver === "telegram" ? config.bot_username || "Nube en la nube" : "Este navegador"}
            </span>
            <span className="block truncate text-[10px] text-slate-500">
              {config.driver === "telegram" ? "Espacio ilimitado" : "Solo en este dispositivo"}
            </span>
          </span>
          <Settings className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[268px] shrink-0 border-r border-white/[0.06] bg-ink-900/40 backdrop-blur-xl lg:block">
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onCloseMobile} />
          <div className="absolute inset-y-0 left-0 w-[280px] animate-scale-in border-r border-white/10 bg-ink-900 shadow-2xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
}
