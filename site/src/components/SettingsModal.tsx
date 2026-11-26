import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  Database,
  FileUp,
  HardDrive,
  Loader2,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { normalizeConfig } from "../lib/config";
import { saveBlob } from "../lib/download";
import { Vault } from "../lib/library";
import { formatBytes } from "../lib/format";
import { isStandalone, promptInstall, useInstallPrompt } from "../lib/pwa";
import type { VaultConfig } from "../lib/types";
import { ConfirmDialog } from "./Dialogs";
import { Modal } from "./Modal";
import { TelegramConnect, chunkBytesFromMb, type TelegramDraft } from "./TelegramConnect";
import { useToast } from "./Toasts";

export function SettingsModal({
  open,
  config,
  vault,
  usedBytes,
  onClose,
  onSave,
  onWipe,
  onDataChanged,
}: {
  open: boolean;
  config: VaultConfig;
  vault: Vault;
  usedBytes: number;
  onClose: () => void;
  onSave: (config: VaultConfig) => Promise<void>;
  onWipe: () => Promise<void>;
  onDataChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const canInstall = useInstallPrompt();
  const [draft, setDraft] = useState<TelegramDraft>({
    bot_token: config.bot_token,
    chat_id: config.chat_id,
    chunk_mb: Math.max(1, Math.round(config.chunk_bytes / (1024 * 1024))),
  });
  const [busy, setBusy] = useState<null | "save" | "export" | "import" | "wipe">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({
      bot_token: config.bot_token,
      chat_id: config.chat_id,
      chunk_mb: Math.max(1, Math.round(config.chunk_bytes / (1024 * 1024))),
    });
    setError(null);
    setSaved(false);
  }, [open, config]);

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const next = normalizeConfig({
        ...config,
        bot_token: draft.bot_token,
        chat_id: draft.chat_id,
        chunk_bytes: chunkBytesFromMb(draft.chunk_mb),
      });
      const changed = next.bot_token !== config.bot_token || next.chat_id !== config.chat_id;
      if (next.driver === "telegram" && changed) {
        next.bot_username = (await Vault.verify(next)).bot;
      }
      await onSave(next);
      setSaved(true);
      toast.success("Ajustes guardados");
      window.setTimeout(() => setSaved(false), 2500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron guardar los ajustes");
    } finally {
      setBusy(null);
    }
  };

  const exportManifest = async () => {
    setBusy("export");
    try {
      const blob = await vault.exportManifest();
      saveBlob(blob, `nube-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success("Copia exportada", "Incluye solo metadatos, nunca el token del bot.");
    } catch (cause) {
      toast.error("No se pudo exportar", cause instanceof Error ? cause.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const importManifest = async (file: File) => {
    setBusy("import");
    try {
      const result = await vault.importManifest(await file.text());
      toast.success(
        `${result.imported} elementos importados`,
        result.skipped ? `${result.skipped} ya existian y se han omitido.` : undefined,
      );
      await onDataChanged();
    } catch (cause) {
      toast.error("No se pudo importar", cause instanceof Error ? cause.message : undefined);
    } finally {
      setBusy(null);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const wipe = async () => {
    setBusy("wipe");
    try {
      await onWipe();
      setConfirmWipe(false);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Ajustes"
        subtitle="Conexion, copias de seguridad y datos locales"
        size="lg"
      >
        <div className="space-y-6">
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Almacenamiento</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-cloud-500/15 text-cloud-200">
                {config.driver === "telegram" ? <Database className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-white">
                  {config.driver === "telegram" ? config.bot_username || "Telegram" : "Solo este navegador"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {config.driver === "telegram"
                    ? `Chat ${config.chat_id} · trozos de ${Math.round(config.chunk_bytes / (1024 * 1024))} MB`
                    : "IndexedDB del navegador"}
                </p>
              </div>
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-slate-300">
                {formatBytes(usedBytes)} usados
              </span>
            </div>
          </section>

          {config.driver === "telegram" ? (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Conexion con Telegram</h3>
              <div className="mt-3">
                <TelegramConnect draft={draft} onChange={setDraft} onError={setError} />
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300/80">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Si cambias de bot o de chat, los archivos ya subidos dejaran de estar accesibles desde aqui.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button className="btn-primary px-3 py-2 text-[12px]" onClick={save} disabled={Boolean(busy)}>
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {saved ? "Guardado" : "Guardar cambios"}
                </button>
              </div>
              {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
            </section>
          ) : (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[11px] text-slate-400">
              Estas en modo local. Para pasar a Telegram necesitas empezar de cero: borra los datos de este navegador y
              vuelve a conectar desde la pantalla inicial.
            </section>
          )}

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Copia de seguridad</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              El indice de tu nube (carpetas, nombres y referencias a los trozos) vive en este navegador. Exportalo para
              recuperarlo si borras los datos del sitio o cambias de equipo con el mismo chat de Telegram.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-ghost px-3 py-2 text-[12px]" onClick={exportManifest} disabled={Boolean(busy)}>
                {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                Exportar indice
              </button>
              <button className="btn-ghost px-3 py-2 text-[12px]" onClick={() => importRef.current?.click()} disabled={Boolean(busy)}>
                {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                Importar indice
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importManifest(file);
                }}
              />
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Aplicacion</h3>
            <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-[12px] font-semibold text-white">Instala Nube en tu equipo</p>
              {isStandalone() ? (
                <p className="mt-1 text-[11px] text-slate-500">Ya estas usando la version instalada, a pantalla completa.</p>
              ) : canInstall ? (
                <button className="btn-ghost mt-2 px-3 py-2 text-[12px]" onClick={() => void promptInstall()}>
                  <Smartphone className="h-4 w-4" /> Instalar Nube
                </button>
              ) : (
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  En iPhone o iPad: Compartir y luego Anadir a la pantalla de inicio. En Android o escritorio: menu del
                  navegador y luego Instalar aplicacion.
                </p>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Zona de riesgo</h3>
            <button className="btn-danger mt-2 px-3 py-2 text-[12px]" onClick={() => setConfirmWipe(true)}>
              <Trash2 className="h-4 w-4" /> Borrar los datos de este navegador
            </button>
          </section>

          <p className="border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-slate-600">
            Nube 1.0 · Aplicacion web instalable. Tus archivos viven en tu espacio y el token nunca se comparte.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmWipe}
        title="Borrar datos locales"
        message="Se borraran el indice de archivos, la configuracion y los archivos guardados en este navegador. Los archivos que tengas en Telegram permaneceran en el chat."
        confirmLabel="Borrar todo"
        busy={busy === "wipe"}
        onConfirm={wipe}
        onCancel={() => setConfirmWipe(false)}
      />
    </>
  );
}
