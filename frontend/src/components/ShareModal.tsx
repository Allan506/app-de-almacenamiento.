import { useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, Lock, ShieldOff, Trash2 } from "lucide-react";
import { api, type NodeItem, type Share } from "../lib/api";
import { formatDate } from "../lib/format";
import { Modal } from "./Modal";
import { useToast } from "../context/ToastContext";

type Props = {
  node: NodeItem | null;
  onClose: () => void;
  onChanged: () => void;
};

const EXPIRY_OPTIONS = [
  { value: 0, label: "Sin caducidad" },
  { value: 24, label: "24 horas" },
  { value: 24 * 7, label: "7 dias" },
  { value: 24 * 30, label: "30 dias" },
];

export function ShareModal({ node, onClose, onChanged }: Props) {
  const toast = useToast();
  const [shares, setShares] = useState<Share[]>([]);
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState(0);
  const [allowDownload, setAllowDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    if (!node) return;
    try {
      const all = await api.listShares();
      setShares(all.filter((share) => share.node_id === node.id));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void load();
    setPassword("");
    setExpiry(0);
    setAllowDownload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  const create = async () => {
    if (!node) return;
    setBusy(true);
    try {
      const share = await api.createShare({
        node_id: node.id,
        password: password.trim() ? password.trim() : null,
        expires_in_hours: expiry || null,
        allow_download: allowDownload,
      });
      await load();
      await navigator.clipboard.writeText(share.url).catch(() => undefined);
      setCopied(share.url);
      toast.success("Enlace creado", "Copiado al portapapeles.");
      onChanged();
    } catch (error) {
      toast.error("No se pudo crear el enlace", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (share: Share) => {
    try {
      await api.deleteShare(share.id);
      setShares((current) => current.filter((item) => item.id !== share.id));
      toast.info("Enlace revocado");
      onChanged();
    } catch (error) {
      toast.error("No se pudo revocar", error instanceof Error ? error.message : undefined);
    }
  };

  const copy = async (share: Share) => {
    await navigator.clipboard.writeText(share.url).catch(() => undefined);
    setCopied(share.url);
    toast.success("Enlace copiado");
    window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Modal
      open={!!node}
      onClose={onClose}
      title="Compartir"
      description={node ? `${node.kind === "folder" ? "Carpeta" : "Archivo"}: ${node.name}` : undefined}
      size="lg"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          <button className="btn-primary" onClick={create} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Crear enlace
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="share-password">
              Contrasena (opcional)
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="share-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Sin contrasena"
                className="field pl-9"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="share-expiry">
              Caducidad
            </label>
            <select
              id="share-expiry"
              value={expiry}
              onChange={(event) => setExpiry(Number(event.target.value))}
              className="field appearance-none"
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-ink-850">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
          <span className="text-sm text-slate-300">Permitir descargas</span>
          <span
            onClick={() => setAllowDownload((value) => !value)}
            className={`relative h-6 w-11 rounded-full transition ${allowDownload ? "bg-cloud-500" : "bg-white/15"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${allowDownload ? "left-[22px]" : "left-0.5"}`}
            />
          </span>
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Enlaces activos</p>
            <span className="text-[11px] text-slate-500">{shares.length}</span>
          </div>
          {shares.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-slate-500">
              Aun no hay enlaces para este elemento.
            </div>
          ) : (
            <div className="space-y-2">
              {shares.map((share) => (
                <div key={share.id} className="rounded-xl border border-white/[0.07] bg-ink-900/50 p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11.5px] text-cloud-200">{share.url}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span>{share.download_count} descargas</span>
                        <span>{share.expires_at ? `Caduca ${formatDate(share.expires_at)}` : "Sin caducidad"}</span>
                        {share.has_password ? (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <Lock className="h-3 w-3" /> Protegido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <ShieldOff className="h-3 w-3" /> Publico
                          </span>
                        )}
                      </p>
                    </div>
                    <button className="icon-btn h-8 w-8" onClick={() => void copy(share)} aria-label="Copiar enlace">
                      {copied === share.url ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button className="icon-btn h-8 w-8 hover:text-rose-300" onClick={() => void revoke(share)} aria-label="Revocar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
