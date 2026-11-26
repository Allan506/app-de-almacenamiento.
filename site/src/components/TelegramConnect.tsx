import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, MinusCircle, ScanSearch, Stethoscope, Wrench, XCircle } from "lucide-react";
import { useState } from "react";
import { HttpTelegramTransport, MAX_CHUNK_BYTES, TelegramClient, validateBotToken } from "../lib/telegram";

export type TelegramDraft = { bot_token: string; chat_id: string; chunk_mb: number };

export const CHUNK_OPTIONS = [
  { mb: 19, label: "19 MB (recomendado)" },
  { mb: 10, label: "10 MB" },
  { mb: 5, label: "5 MB" },
  { mb: 1, label: "1 MB" },
];

export const chunkBytesFromMb = (mb: number) => Math.min(MAX_CHUNK_BYTES, Math.round(mb * 1024 * 1024));

export function TelegramConnect({
  draft,
  onChange,
  onError,
  compact = false,
}: {
  draft: TelegramDraft;
  onChange: (draft: TelegramDraft) => void;
  onError?: (message: string) => void;
  compact?: boolean;
}) {
  const [detecting, setDetecting] = useState(false);

  const detect = async () => {
    const invalid = validateBotToken(draft.bot_token);
    if (invalid) {
      onError?.(invalid);
      return;
    }
    setDetecting(true);
    onError?.("");
    try {
      const client = new TelegramClient(new HttpTelegramTransport(draft.bot_token.trim()), draft.chat_id || "0");
      const deadline = Date.now() + 21_000;
      for (;;) {
        const chatId = await client.discoverChatId();
        if (chatId !== null) {
          onChange({ ...draft, chat_id: String(chatId) });
          return;
        }
        if (Date.now() > deadline) {
          onError?.(
            "Telegram no ve ningun mensaje tuyo. Abre el bot en Telegram, pulsa Iniciar y envia cualquier mensaje; luego pulsa Detectar otra vez.",
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (cause) {
      onError?.(cause instanceof Error ? cause.message : "No se pudo consultar el bot");
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="bot-token">
          Token de tu espacio
        </label>
        <input
          id="bot-token"
          className="field font-mono text-[12px]"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="123456789:AAH..."
          value={draft.bot_token}
          onChange={(event) => onChange({ ...draft, bot_token: event.target.value })}
        />
        <p className="mt-1.5 text-[11px] text-slate-500">
          Se guarda solo en este navegador. Crea tu espacio con{" "}
          <a
            className="inline-flex items-center gap-1 text-cloud-300 hover:text-cloud-200"
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
          >
            @BotFather <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      <div>
        <label className="label" htmlFor="chat-id">
          Chat donde se guardan los archivos
        </label>
        <div className="flex gap-2">
          <input
            id="chat-id"
            className="field font-mono text-[12px]"
            inputMode="numeric"
            placeholder="123456789"
            value={draft.chat_id}
            onChange={(event) => onChange({ ...draft, chat_id: event.target.value })}
          />
          <button type="button" className="btn-ghost shrink-0 px-3" onClick={detect} disabled={detecting}>
            {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            {detecting ? "Buscando" : "Detectar"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Abre una conversacion con tu bot, pulsa Iniciar y envia un mensaje; luego pulsa Detectar.
        </p>
      </div>

      <ConnectionCheck draft={draft} onDetected={(chatId) => onChange({ ...draft, chat_id: chatId })} />

      {!compact && (
        <details className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <summary className="cursor-pointer text-[12px] font-medium text-slate-300">Opciones avanzadas</summary>
          <div className="mt-3">
            <label className="label" htmlFor="chunk-size">
              Tamano de cada trozo
            </label>
            <select
              id="chunk-size"
              className="field"
              value={draft.chunk_mb}
              onChange={(event) => onChange({ ...draft, chunk_mb: Number(event.target.value) })}
            >
              {CHUNK_OPTIONS.map((option) => (
                <option key={option.mb} value={option.mb}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-slate-500">
              La Bot API acepta 20 MB por archivo. Nube parte los archivos grandes en trozos de este tamano.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

type CheckState = "idle" | "running" | "ok" | "fail" | "skip";
type Check = { id: string; label: string; state: CheckState; detail?: string };

const ICONS: Record<CheckState, typeof CheckCircle2> = {
  idle: MinusCircle,
  running: Loader2,
  ok: CheckCircle2,
  fail: XCircle,
  skip: MinusCircle,
};

/** Diagnostico paso a paso: dice exactamente en que falla la conexion con Telegram. */
function ConnectionCheck({ draft, onDetected }: { draft: TelegramDraft; onDetected: (chatId: string) => void }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [webhook, setWebhook] = useState(false);

  const update = (id: string, patch: Partial<Check>) =>
    setChecks((list) => list.map((check) => (check.id === id ? { ...check, ...patch } : check)));

  const run = async () => {
    setRunning(true);
    setWebhook(false);
    const base: Check[] = [
      { id: "token", label: "Formato del token", state: "running" },
      { id: "bot", label: "El bot responde (getMe)", state: "idle" },
      { id: "updates", label: "Mensajes recibidos (getUpdates)", state: "idle" },
      { id: "chat", label: "Chat accesible (getChat)", state: "idle" },
    ];
    setChecks(base);
    try {
      const invalid = validateBotToken(draft.bot_token);
      update("token", { state: invalid ? "fail" : "ok", detail: invalid ?? undefined });
      if (invalid) {
        update("bot", { state: "skip" });
        update("updates", { state: "skip" });
        update("chat", { state: "skip" });
        return;
      }
      const client = new TelegramClient(new HttpTelegramTransport(draft.bot_token.trim()), draft.chat_id || "0");

      update("bot", { state: "running" });
      try {
        const me = await client.verifyBot();
        update("bot", { state: "ok", detail: me.username ? `@${me.username}` : `id ${me.id}` });
      } catch (cause) {
        update("bot", { state: "fail", detail: describe(cause) });
        update("updates", { state: "skip" });
        update("chat", { state: "skip" });
        return;
      }

      update("updates", { state: "running" });
      let detected: string | null = null;
      try {
        const chatId = await client.discoverChatId();
        detected = chatId === null ? null : String(chatId);
        update("updates", {
          state: "ok",
          detail: detected ? `chat ${detected}` : "sin mensajes todavia",
        });
      } catch (cause) {
        const message = describe(cause);
        setWebhook(/webhook/i.test(message));
        update("updates", { state: "fail", detail: message });
      }

      update("chat", { state: "running" });
      const target = draft.chat_id.trim() || detected;
      if (!target) {
        update("chat", { state: "skip", detail: "sin chat_id: envia un mensaje al bot y pulsa Detectar" });
        return;
      }
      try {
        const chat = await new TelegramClient(new HttpTelegramTransport(draft.bot_token.trim()), target).verifyChat();
        update("chat", { state: "ok", detail: chat.title || chat.username || chat.type });
        if (!draft.chat_id.trim() && detected) onDetected(detected);
      } catch (cause) {
        update("chat", { state: "fail", detail: describe(cause) });
      }
    } finally {
      setRunning(false);
    }
  };

  const dropWebhook = async () => {
    setRunning(true);
    try {
      await new TelegramClient(new HttpTelegramTransport(draft.bot_token.trim()), draft.chat_id || "0").clearWebhook();
      setWebhook(false);
      await run();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost px-3 py-2 text-[12px]" onClick={run} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
          Probar conexion
        </button>
        <span className="text-[11px] text-slate-500">Comprueba token, bot, mensajes y chat.</span>
      </div>

      {checks.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {checks.map((check) => {
            const Icon = ICONS[check.state];
            const tone =
              check.state === "ok"
                ? "text-emerald-400"
                : check.state === "fail"
                  ? "text-rose-400"
                  : check.state === "running"
                    ? "text-cloud-300"
                    : "text-slate-600";
            return (
              <li key={check.id} className="flex items-start gap-2 text-[11.5px]">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone} ${check.state === "running" ? "animate-spin" : ""}`} />
                <span className="text-slate-300">{check.label}</span>
                {check.detail && <span className="min-w-0 flex-1 truncate text-slate-500">· {check.detail}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {webhook && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <p className="flex-1 text-[11px] text-amber-200">
            Tu bot tiene un webhook: mientras exista, Telegram no deja leer mensajes.
          </p>
          <button type="button" className="btn-ghost px-2 py-1 text-[11px]" onClick={dropWebhook} disabled={running}>
            <Wrench className="h-3 w-3" /> Quitar webhook
          </button>
        </div>
      )}
    </div>
  );
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Error desconocido";
}
