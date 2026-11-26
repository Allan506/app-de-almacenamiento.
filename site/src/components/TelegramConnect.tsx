import { ExternalLink, Loader2, ScanSearch } from "lucide-react";
import { useState } from "react";
import { HttpTelegramTransport, MAX_CHUNK_BYTES, TelegramClient } from "../lib/telegram";

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
    if (!draft.bot_token.trim()) {
      onError?.("Pega primero el token del bot");
      return;
    }
    setDetecting(true);
    try {
      const client = new TelegramClient(new HttpTelegramTransport(draft.bot_token.trim()), draft.chat_id || "0");
      const chatId = await client.discoverChatId();
      if (chatId === null) {
        onError?.("No hay mensajes recientes. Abre tu bot en Telegram, pulsa Iniciar y envia cualquier mensaje.");
        return;
      }
      onChange({ ...draft, chat_id: String(chatId) });
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
            Detectar
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Abre una conversacion con tu bot, pulsa Iniciar y envia un mensaje; luego pulsa Detectar.
        </p>
      </div>

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
