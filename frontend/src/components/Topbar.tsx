import { LayoutGrid, List, Menu, Search, SlidersHorizontal, X } from "lucide-react";
import type { User } from "../lib/api";
import { initialsOf } from "../lib/format";

type Props = {
  user: User;
  search: string;
  onSearch: (value: string) => void;
  view: "grid" | "list";
  onView: (view: "grid" | "list") => void;
  sort: string;
  onSort: (value: string) => void;
  onOpenMenu: () => void;
  onAccount: () => void;
  hideSort?: boolean;
};

const SORT_OPTIONS = [
  { value: "name", label: "Nombre (A-Z)" },
  { value: "-name", label: "Nombre (Z-A)" },
  { value: "-date", label: "Mas recientes" },
  { value: "date", label: "Mas antiguos" },
  { value: "-size", label: "Mayor tamano" },
];

export function Topbar({
  user,
  search,
  onSearch,
  view,
  onView,
  sort,
  onSort,
  onOpenMenu,
  onAccount,
  hideSort,
}: Props) {
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-ink-950/70 px-4 py-3 backdrop-blur-xl md:px-6">
      <button className="icon-btn lg:hidden" onClick={onOpenMenu} aria-label="Abrir menu">
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative order-3 w-full min-w-[180px] flex-1 md:order-1 md:w-auto">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Buscar en tu nube..."
          className="h-10 w-full rounded-xl border border-white/10 bg-ink-900/60 pl-10 pr-9 text-sm text-white placeholder:text-slate-500
            transition focus:border-cloud-400/60 focus:outline-none focus:ring-2 focus:ring-cloud-500/20"
        />
        {search && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition hover:text-white"
            onClick={() => onSearch("")}
            aria-label="Limpiar busqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="order-2 ml-auto flex items-center gap-2">
        {!hideSort && (
          <div className="relative hidden sm:block">
            <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <select
              value={sort}
              onChange={(event) => onSort(event.target.value)}
              className="h-10 appearance-none rounded-xl border border-white/10 bg-ink-900/60 pl-8 pr-7 text-xs font-medium text-slate-300
                transition hover:border-white/20 focus:border-cloud-400/60 focus:outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-ink-850">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex rounded-xl border border-white/10 bg-ink-900/60 p-0.5">
          <button
            onClick={() => onView("grid")}
            className={`grid h-9 w-9 place-items-center rounded-lg transition ${view === "grid" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
            aria-label="Vista de cuadricula"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => onView("list")}
            className={`grid h-9 w-9 place-items-center rounded-lg transition ${view === "list" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
            aria-label="Vista de lista"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={onAccount}
          className="grid h-10 w-10 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-white/10 transition hover:ring-cloud-400/60"
          style={{ backgroundColor: user.color }}
          aria-label="Cuenta"
        >
          {initialsOf(user.display_name, user.email)}
        </button>
      </div>
    </header>
  );
}
