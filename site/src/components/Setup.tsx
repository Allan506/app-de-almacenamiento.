import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  ExternalLink,
  HardDrive,
  Infinity as InfinityIcon,
  Loader2,
  MonitorSmartphone,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { normalizeChunkBytes, normalizeConfig } from "../lib/config";
import { Vault } from "../lib/library";
import type { VaultConfig } from "../lib/types";
import { TelegramConnect, chunkBytesFromMb, type TelegramDraft } from "./TelegramConnect";

type Step = "choose" | "telegram";

const CLOUD_PERKS = ["Espacio ilimitado", "Descargas sin limite", "Mismo contenido en todos tus equipos"];

export function Setup({ onReady }: { onReady: (config: VaultConfig) => void }) {
  const [step, setStep] = useState<Step>("choose");
  const [draft, setDraft] = useState<TelegramDraft>({ bot_token: "", chat_id: "", chunk_mb: 19 });
  const [busy, setBusy] = useState<false | "telegram" | "local">(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const base = { display_name: "Mi nube", created_at: new Date().toISOString() };

  const connectTelegram = async () => {
    setError(null);
    setStatus(null);
    setBusy("telegram");
    try {
      const config = normalizeConfig({
        ...base,
        driver: "telegram",
        bot_token: draft.bot_token,
        chat_id: draft.chat_id,
        chunk_bytes: chunkBytesFromMb(draft.chunk_mb),
      });
      setStatus("Comprobando tu espacio...");
      const { bot, chat } = await Vault.verify(config);
      onReady({ ...config, bot_username: bot, display_name: chat });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo conectar");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const useLocal = () => {
    setError(null);
    setBusy("local");
    onReady({
      ...base,
      driver: "local",
      bot_token: "",
      chat_id: "",
      chunk_bytes: normalizeChunkBytes(chunkBytesFromMb(19)),
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-cloud-400 via-cloud-500 to-violet-500 text-white shadow-lg shadow-cloud-600/30">
            <Cloud className="h-4.5 w-4.5" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-white">Nube</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Tu nube personal</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className={`h-1.5 w-6 rounded-full ${step === "choose" ? "bg-cloud-400" : "bg-white/15"}`} />
          <span className={`h-1.5 w-6 rounded-full ${step === "telegram" ? "bg-cloud-400" : "bg-white/15"}`} />
          <span className="ml-1">{step === "choose" ? "Paso 1 de 2" : "Paso 2 de 2"}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 py-8">
        {step === "choose" ? (
          <div className="animate-fade-up">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Bienvenido a tu nube</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Elige donde quieres guardar tus archivos. Puedes empezar en un minuto y sin crear ninguna cuenta.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <button
                className="card group flex flex-col p-5 text-left transition hover:border-cloud-400/40 hover:bg-ink-800/70"
                onClick={() => setStep("telegram")}
                disabled={Boolean(busy)}
              >
                <span className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cloud-500/25 to-violet-500/20 text-cloud-200">
                    <InfinityIcon className="h-5 w-5" />
                  </span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    Recomendado
                  </span>
                </span>
                <p className="mt-3 text-base font-semibold text-white">Nube ilimitada</p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                  Tus archivos en un disco en la nube que ya es tuyo. Sin cuotas y con acceso desde cualquier equipo.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {CLOUD_PERKS.map((perk) => (
                    <li key={perk} className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> {perk}
                    </li>
                  ))}
                </ul>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[12px] font-semibold text-cloud-300 group-hover:text-cloud-200">
                  Conectar mi espacio <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>

              <div className="card flex flex-col p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-slate-300">
                  <HardDrive className="h-5 w-5" />
                </span>
                <p className="mt-3 text-base font-semibold text-white">Solo este dispositivo</p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                  Modo de prueba con el almacenamiento del navegador. Ideal para ver la app antes de conectar nada.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {["Sin configuracion", "Datos solo en este navegador", "Limitado por el navegador"].map((perk) => (
                    <li key={perk} className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Check className="h-3.5 w-3.5 shrink-0 text-slate-500" /> {perk}
                    </li>
                  ))}
                </ul>
                <button className="btn-ghost mt-auto w-full" onClick={useLocal} disabled={Boolean(busy)}>
                  {busy === "local" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Probar sin conectar
                </button>
              </div>
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Nada se envia a servidores de Nube: la app corre en tu navegador.
            </p>
          </div>
        ) : (
          <div className="animate-fade-up">
            <button
              className="inline-flex items-center gap-1.5 text-[12px] text-slate-400 transition hover:text-white"
              onClick={() => {
                setError(null);
                setStep("choose");
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </button>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Conecta tu espacio ilimitado</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Nube usara tu cuenta de Telegram como disco. Son dos pasos y solo se hace una vez en este navegador.
            </p>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="card p-5">
                <ol className="space-y-1.5 text-[12px] text-slate-400">
                  <li className="flex gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cloud-500/15 text-[10px] font-bold text-cloud-200">
                      1
                    </span>
                    <span>
                      Abre{" "}
                      <a
                        className="inline-flex items-center gap-1 font-medium text-cloud-300 hover:text-cloud-200"
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noreferrer"
                      >
                        @BotFather <ExternalLink className="h-3 w-3" />
                      </a>{" "}
                      y envia <code className="rounded bg-white/10 px-1">/newbot</code>. Copia el token.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cloud-500/15 text-[10px] font-bold text-cloud-200">
                      2
                    </span>
                    <span>Pega el token aqui y pulsa Detectar. Nube encuentra tu chat automaticamente.</span>
                  </li>
                </ol>

                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <TelegramConnect draft={draft} onChange={setDraft} onError={setError} />
                </div>

                {error && (
                  <p className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
                    {error}
                  </p>
                )}
                {status && !error && <p className="mt-3 text-[11px] text-slate-400">{status}</p>}

                <button className="btn-primary mt-4 w-full" onClick={connectTelegram} disabled={Boolean(busy)}>
                  {busy === "telegram" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                  Conectar y entrar
                </button>
              </div>

              <aside className="space-y-3">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="text-[12px] font-semibold text-white">Que pasa con mis archivos</p>
                  <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-400">
                    <li className="flex gap-2">
                      <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cloud-300" /> Se suben directos a tu cuenta,
                      troceados si son grandes.
                    </li>
                    <li className="flex gap-2">
                      <MonitorSmartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cloud-300" /> El indice (nombres y
                      carpetas) se queda en este navegador.
                    </li>
                    <li className="flex gap-2">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cloud-300" /> Ni Nube ni GitHub ven tus
                      archivos.
                    </li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="text-[12px] font-semibold text-white">Ya tienes una nube?</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Si borraste los datos del sitio, importa tu copia de seguridad desde{" "}
                    <span className="text-slate-300">Ajustes → Importar indice</span> despues de conectar el mismo bot.
                  </p>
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-3xl text-center text-[10px] text-slate-600">
        Nube funciona en tu navegador. No esta afiliada a Telegram ni a GitHub.
      </footer>
    </div>
  );
}
