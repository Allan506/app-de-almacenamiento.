import { ArrowDownUp, FolderPlus, Grid2X2, List, Menu, Search, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SortKey } from "../lib/types";

const SORT_LABELS: { id: SortKey; label: string }[] = [
  { id: "name", label: "Nombre (A-Z)" },
  { id: "-name", label: "Nombre (Z-A)" },
  { id: "-date", label: "Mas recientes" },
  { id: "date", label: "Mas antiguos" },
  { id: "-size", label: "Mas grandes" },
  { id: "size", label: "Mas pequenos" },
];

export function Topbar({
  search,
  onSearch,
  view,
  onView,
  sort,
  onSort,
  onUpload,
  onNewFolder,
  onMenu,
}: {
  search: string;
  onSearch: (value: string) => void;
  view: "grid" | "list";
  onView: (view: "grid" | "list") => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  onUpload: () => void;
  onNewFolder: () => void;
  onMenu: () => void;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const close = (event: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [sortOpen]);

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-ink-950/70 px-3 py-2.5 backdrop-blur-xl sm:px-5">
      <button className="icon-btn lg:hidden" onClick={onMenu} aria-label="Abrir menu">
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className="field py-2.5 pl-9 pr-9 text-[13px]"
          placeholder="Buscar en toda tu nube..."
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          aria-label="Buscar archivos"
        />
        {search && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-white"
            onClick={() => onSearch("")}
            aria-label="Limpiar busqueda"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="hidden items-center gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-0.5 sm:flex">
        <button
          className={`grid h-8 w-8 place-items-center rounded-lg transition ${
            view === "grid" ? "bg-cloud-500/20 text-white" : "text-slate-500 hover:text-slate-200"
          }`}
          onClick={() => onView("grid")}
          aria-label="Vista de cuadricula"
        >
          <Grid2X2 className="h-4 w-4" />
        </button>
        <button
          className={`grid h-8 w-8 place-items-center rounded-lg transition ${
            view === "list" ? "bg-cloud-500/20 text-white" : "text-slate-500 hover:text-slate-200"
          }`}
          onClick={() => onView("list")}
          aria-label="Vista de lista"
        >
          <List className="h-4 w-4" />
        </button>
      </div>

      <div className="relative" ref={sortRef}>
        <button className="btn-ghost px-3 py-2.5 text-[12px]" onClick={() => setSortOpen((value) => !value)}>
          <ArrowDownUp className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{SORT_LABELS.find((option) => option.id === sort)?.label}</span>
        </button>
        {sortOpen && (
          <div className="absolute right-0 top-11 z-40 w-44 animate-scale-in overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 py-1 shadow-2xl backdrop-blur-xl">
            {SORT_LABELS.map((option) => (
              <button
                key={option.id}
                className={`flex w-full items-center px-3 py-2 text-left text-xs transition hover:bg-white/[0.06] ${
                  option.id === sort ? "text-cloud-200" : "text-slate-300"
                }`}
                onClick={() => {
                  onSort(option.id);
                  setSortOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="btn-ghost hidden px-3 py-2.5 text-[12px] sm:inline-flex" onClick={onNewFolder}>
        <FolderPlus className="h-4 w-4" />
        <span className="hidden md:inline">Carpeta</span>
      </button>

      <button className="btn-primary px-3 py-2.5 text-[12px]" onClick={onUpload}>
        <Upload className="h-4 w-4" />
        <span className="hidden sm:inline">Subir</span>
      </button>
    </header>
  );
}
