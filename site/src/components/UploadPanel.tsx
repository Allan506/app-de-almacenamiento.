import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, CloudUpload, Loader2, X } from "lucide-react";
import { useState } from "react";
import type { UploadTask } from "../lib/types";

type Props = {
  tasks: UploadTask[];
  onClear: () => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
};

export function UploadPanel({ tasks, onClear, onCancel, onDismiss }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  if (!tasks.length) return null;

  const active = tasks.filter((task) => task.status === "uploading" || task.status === "queued").length;
  const failed = tasks.filter((task) => task.status === "error").length;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-ink-850/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-3.5 py-2.5">
        <CloudUpload className={`h-4 w-4 ${active ? "text-cloud-300" : failed ? "text-rose-400" : "text-emerald-400"}`} />
        <p className="flex-1 text-xs font-semibold text-white">
          {active
            ? `Subiendo ${active} archivo${active > 1 ? "s" : ""}...`
            : failed
              ? `${failed} con error`
              : "Subida completada"}
        </p>
        <button className="icon-btn h-7 w-7" onClick={() => setCollapsed((value) => !value)} aria-label="Contraer panel">
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button className="icon-btn h-7 w-7" onClick={onClear} aria-label="Limpiar lista">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-60 space-y-2 overflow-y-auto p-2.5">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <div className="flex items-center gap-2">
                {(task.status === "uploading" || task.status === "queued") && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cloud-300" />
                )}
                {task.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                {task.status === "error" && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
                {(task.status === "canceled" || task.status === "queued") && task.status === "canceled" && (
                  <X className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <p className="min-w-0 flex-1 truncate text-[12px] text-slate-200">{task.name}</p>
                <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                  {task.status === "error"
                    ? "Error"
                    : task.status === "canceled"
                      ? "Cancelado"
                      : task.status === "queued"
                        ? "En cola"
                        : `${task.progress}%`}
                </span>
                {task.status === "uploading" || task.status === "queued" ? (
                  <button
                    className="shrink-0 text-slate-500 transition hover:text-rose-300"
                    onClick={() => onCancel(task.id)}
                    aria-label="Cancelar subida"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    className="shrink-0 text-slate-600 transition hover:text-white"
                    onClick={() => onDismiss(task.id)}
                    aria-label="Quitar de la lista"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all ${
                    task.status === "error"
                      ? "bg-rose-500"
                      : task.status === "done"
                        ? "bg-emerald-400"
                        : "bg-cloud-400"
                  }`}
                  style={{ width: `${task.status === "error" ? 100 : task.progress}%` }}
                />
              </div>
              {task.error && <p className="mt-1 truncate text-[10px] text-rose-300">{task.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
