import { useEffect, useState } from "react";
import { Check, Loader2, LogOut, Mail, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { api, type Stats, type User } from "../lib/api";
import { formatBytes, formatDate, initialsOf, percent } from "../lib/format";
import { Modal } from "./Modal";
import { useToast } from "../context/ToastContext";

type Props = {
  open: boolean;
  user: User;
  stats: Stats | null;
  onClose: () => void;
  onUpdated: (user: User) => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
};

export function AccountModal({ open, user, stats, onClose, onUpdated, onSignOut, onDeleteAccount }: Props) {
  const toast = useToast();
  const [name, setName] = useState(user.display_name);
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(user.display_name), [user.display_name, open]);

  const save = async () => {
    if (!name.trim() || name.trim() === user.display_name) return;
    setBusy(true);
    try {
      const updated = await api.updateMe(name.trim());
      onUpdated(updated);
      toast.success("Perfil actualizado");
    } catch (error) {
      toast.error("No se pudo guardar", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const usage = percent(stats?.used ?? 0, stats?.quota ?? 0);

  return (
    <Modal open={open} onClose={onClose} title="Tu cuenta" description="Perfil y espacio de almacenamiento" size="md">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div
            className="grid h-16 w-16 place-items-center rounded-2xl text-xl font-bold text-white shadow-lg"
            style={{ backgroundColor: user.color }}
          >
            {initialsOf(user.display_name, user.email)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{user.display_name}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-slate-400">
              <Mail className="h-3.5 w-3.5" /> {user.email}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Acceso verificado por OTP
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Archivos", value: stats?.files ?? 0 },
            { label: "Carpetas", value: stats?.folders ?? 0 },
            { label: "Compartidos", value: stats?.shared ?? 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center">
              <p className="text-lg font-bold text-white">{item.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Espacio utilizado</span>
            <span className="font-semibold text-slate-200">
              {formatBytes(stats?.used ?? 0)} {stats?.quota ? `/ ${formatBytes(stats.quota)}` : "· ilimitado"}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cloud-400 to-violet-400"
              style={{ width: stats?.quota ? `${Math.max(usage, 2)}%` : "100%" }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Miembro desde {formatDate(user.created_at)} ·{" "}
            {stats?.quota ? `${usage}% del plan` : "Sin limite de espacio ni cuotas artificiales"}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="display-name">
            Nombre visible
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="display-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                className="field pl-9"
              />
            </div>
            <button className="btn-ghost" onClick={() => void save()} disabled={busy || name.trim() === user.display_name}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Guardar
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/[0.07] pt-4 sm:flex-row sm:justify-between">
          <button className="btn-ghost" onClick={onSignOut}>
            <LogOut className="h-4 w-4" /> Cerrar sesion
          </button>
          <button className="btn-danger" onClick={onDeleteAccount}>
            <Trash2 className="h-4 w-4" /> Eliminar cuenta y datos
          </button>
        </div>
      </div>
    </Modal>
  );
}
