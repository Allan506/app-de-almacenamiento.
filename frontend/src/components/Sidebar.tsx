import {
  Clock3,
  HardDrive,
  Link2,
  LogOut,
  PieChart,
  Plus,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { Stats, User } from "../lib/api";
import { formatBytes, initialsOf, percent } from "../lib/format";
import { Logo } from "./Logo";

export type Section = "drive" | "recent" | "favorites" | "shared" | "trash" | "storage";

const NAV: { id: Section; label: string; icon: typeof HardDrive }[] = [
  { id: "drive", label: "Mi unidad", icon: HardDrive },
  { id: "recent", label: "Recientes", icon: Clock3 },
  { id: "favorites", label: "Favoritos", icon: Star },
  { id: "shared", label: "Compartidos", icon: Link2 },
  { id: "trash", label: "Papelera", icon: Trash2 },
  { id: "storage", label: "Almacenamiento", icon: PieChart },
];

type Props = {
  section: Section;
  onSection: (section: Section) => void;
  stats: Stats | null;
  user: User;
  onUpload: () => void;
  onNewFolder: () => void;
  onAccount: () => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function Sidebar({
  section,
  onSection,
  stats,
  user,
  onUpload,
  onNewFolder,
  onAccount,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: Props) {
  const used = stats?.used ?? 0;
  const quota = stats?.quota ?? 0;
  const usage = percent(used, quota);

  const content = (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex items-center justify-between px-1">
        <Logo />
        <button className="icon-btn lg:hidden" onClick={onCloseMobile} aria-label="Cerrar menu">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <button onClick={onUpload} className="btn-primary w-full">
          <Plus className="h-4 w-4" />
          Subir archivos
        </button>
        <button onClick={onNewFolder} className="btn-ghost w-full">
          <Plus className="h-4 w-4" />
          Nueva carpeta
        </button>
      </div>

      <nav className="space-y-1">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              onSection(id);
              onCloseMobile();
            }}
            className={`nav-link w-full ${section === id ? "nav-link-active" : ""}`}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="flex-1 text-left">{label}</span>
            {id === "trash" && !!stats?.trash_count && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                {stats.trash_count}
              </span>
            )}
            {id === "shared" && !!stats?.shared && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                {stats.shared}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>Almacenamiento</span>
            <span className="text-slate-300">{formatBytes(used)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cloud-400 to-violet-400 transition-all duration-500"
              style={{ width: quota ? `${Math.max(usage, 3)}%` : "100%" }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {quota ? `${usage}% de ${formatBytes(quota)}` : "Espacio ilimitado"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2">
          <button onClick={onAccount} className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-white/[0.05]">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: user.color }}
            >
              {initialsOf(user.display_name, user.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">{user.display_name}</p>
              <p className="truncate text-[11px] text-slate-500">{user.email}</p>
            </div>
            <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
          </button>
          <button
            onClick={onSignOut}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-white/[0.05] hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesion
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[272px] shrink-0 border-r border-white/[0.06] bg-ink-900/50 backdrop-blur-xl lg:block">
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={onCloseMobile} />
          <aside className="relative h-full w-[286px] animate-fade-up border-r border-white/10 bg-ink-900">{content}</aside>
        </div>
      )}
    </>
  );
}
