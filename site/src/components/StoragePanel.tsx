import {
  ArrowDownToLine,
  Clock3,
  FileArchive,
  FileText,
  FolderPlus,
  HardDrive,
  Infinity as InfinityIcon,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { formatBytes, timeAgo } from "../lib/format";
import type { VaultStats } from "../lib/types";

const ACTION_META: Record<string, { label: string; icon: typeof Upload; color: string }> = {
  upload: { label: "Subida", icon: Upload, color: "text-emerald-300 bg-emerald-500/10" },
  download: { label: "Descarga", icon: ArrowDownToLine, color: "text-sky-300 bg-sky-500/10" },
  trash: { label: "A la papelera", icon: Trash2, color: "text-rose-300 bg-rose-500/10" },
  restore: { label: "Restaurado", icon: RotateCcw, color: "text-amber-300 bg-amber-500/10" },
  purge: { label: "Eliminado", icon: Trash2, color: "text-rose-300 bg-rose-500/10" },
  rename: { label: "Renombrado", icon: Pencil, color: "text-cloud-200 bg-cloud-500/10" },
  move: { label: "Movido", icon: HardDrive, color: "text-cloud-200 bg-cloud-500/10" },
  folder: { label: "Carpeta creada", icon: FolderPlus, color: "text-cloud-200 bg-cloud-500/10" },
  import: { label: "Copia importada", icon: FileArchive, color: "text-violet-300 bg-violet-500/10" },
};

const TYPE_COLORS = ["bg-cloud-400", "bg-rose-400", "bg-fuchsia-400", "bg-emerald-400", "bg-amber-400"];

function Metric({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof HardDrive }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-cloud-300" />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

export function StoragePanel({ stats }: { stats: VaultStats | null }) {
  if (!stats) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="skeleton h-28" />
        ))}
      </div>
    );
  }

  const total = Math.max(stats.used, 1);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Espacio usado" value={formatBytes(stats.used)} hint="Sin cuota ni limite" icon={InfinityIcon} />
        <Metric label="Archivos" value={String(stats.files)} hint="Guardados en tu almacenamiento" icon={FileText} />
        <Metric label="Carpetas" value={String(stats.folders)} hint="Organizacion actual" icon={FolderPlus} />
        <Metric
          label="Papelera"
          value={formatBytes(stats.trash_size)}
          hint={`${stats.trash_count} elementos recuperables`}
          icon={Trash2}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-white">Distribucion por tipo</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Solo cuentan los archivos que no estan en la papelera.</p>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10">
            {stats.by_type.map((entry, index) =>
              entry.size > 0 ? (
                <div
                  key={entry.label}
                  className={TYPE_COLORS[index % TYPE_COLORS.length]}
                  style={{ width: `${(entry.size / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-4 space-y-2.5">
            {stats.by_type.map((entry, index) => (
              <li key={entry.label} className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${TYPE_COLORS[index % TYPE_COLORS.length]}`} />
                <span className="flex-1 text-xs text-slate-300">{entry.label}</span>
                <span className="text-[11px] text-slate-500">{entry.count} archivos</span>
                <span className="w-20 text-right text-xs font-semibold tabular-nums text-slate-200">
                  {formatBytes(entry.size)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h3 className="text-sm font-semibold text-white">Actividad reciente</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Guardada solo en este navegador.</p>
          {stats.activity.length === 0 ? (
            <p className="mt-6 text-center text-xs text-slate-500">Aun no hay actividad. Sube tu primer archivo.</p>
          ) : (
            <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {stats.activity.map((event) => {
                const meta = ACTION_META[event.action] ?? {
                  label: event.action,
                  icon: Clock3,
                  color: "text-slate-300 bg-slate-500/10",
                };
                const Icon = meta.icon;
                return (
                  <li key={`${event.created_at}-${event.node_id}-${event.action}`} className="flex items-center gap-2.5">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${meta.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-slate-300">
                        <span className="text-slate-500">{meta.label}: </span>
                        {event.node_name}
                      </p>
                      <p className="text-[10px] text-slate-600">
                        {timeAgo(event.created_at)}
                        {event.size ? ` · ${formatBytes(event.size)}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
