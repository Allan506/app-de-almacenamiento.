import type { ChunkRef } from "./types";

export const TELEGRAM_API = "https://api.telegram.org";
/** Limite real de la Bot API para subidas multipart: 20 MB. Dejamos margen. */
export const MAX_CHUNK_BYTES = 19 * 1024 * 1024;
export const MIN_CHUNK_BYTES = 1 * 1024 * 1024;

export type Progress = (loaded: number, total: number) => void;

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

export type TelegramFile = { name: string; blob: Blob };

export type TelegramEnvelope<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
};

/**
 * Frontera de red. Se inyecta para poder probar la orquestacion de trozos sin
 * hablar con Telegram.
 */
export interface TelegramTransport {
  call<T>(
    method: string,
    payload: Record<string, string>,
    file?: TelegramFile,
    onProgress?: Progress,
    signal?: AbortSignal,
  ): Promise<T>;
  download(filePath: string, onProgress?: Progress, signal?: AbortSignal): Promise<Blob>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Operacion cancelada", "AbortError");
}

const ERROR_HINTS: [RegExp, string][] = [
  [/unauthorized/i, "El token del bot no es valido. Copialo de nuevo desde BotFather."],
  [/chat not found/i, "No encuentro ese chat. Abre tu bot en Telegram, pulsa Iniciar y revisa el chat_id."],
  [/bot was blocked by the user/i, "Has bloqueado el bot. Desbloquealo en Telegram y vuelve a intentarlo."],
  [/not enough rights/i, "El bot no tiene permisos para escribir en ese chat."],
  [/request entity too large/i, "El trozo supera el limite de Telegram. Reduce el tamano de trozo en Ajustes."],
  [/too many requests/i, "Telegram ha limitado las peticiones. Espera unos segundos y reintenta."],
  [/webhook is active/i, "El bot tiene un webhook activo; usa un bot nuevo o elimina el webhook."],
  [/failed to get http url content/i, "Telegram no pudo procesar el archivo. Reintenta la subida."],
];

export function describeTelegramError(description: string): string {
  const match = ERROR_HINTS.find(([pattern]) => pattern.test(description));
  return match ? match[1] : description;
}

/** XHR para tener progreso real de subida; fetch no expone upload progress. */
export class HttpTelegramTransport implements TelegramTransport {
  constructor(
    private readonly token: string,
    private readonly base = TELEGRAM_API,
  ) {}

  private endpoint(method: string): string {
    return `${this.base}/bot${this.token}/${method}`;
  }

  async call<T>(
    method: string,
    payload: Record<string, string>,
    file?: TelegramFile,
    onProgress?: Progress,
    signal?: AbortSignal,
    attempt = 0,
  ): Promise<T> {
    throwIfAborted(signal);
    try {
      const envelope = await this.send<T>(method, payload, file, onProgress, signal);
      return envelope.result as T;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Operacion cancelada", "AbortError");
      const retryable =
        error instanceof TelegramError &&
        attempt < 2 &&
        (error.retryAfter !== undefined || error.code === 0 || error.code >= 500);
      if (!retryable) throw error;
      const delay = (error as TelegramError).retryAfter
        ? ((error as TelegramError).retryAfter! + 1) * 1000
        : 1200 * (attempt + 1);
      await sleep(delay);
      return this.call<T>(method, payload, file, onProgress, signal, attempt + 1);
    }
  }

  private send<T>(
    method: string,
    payload: Record<string, string>,
    file: TelegramFile | undefined,
    onProgress: Progress | undefined,
    signal: AbortSignal | undefined,
  ): Promise<TelegramEnvelope<T>> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", this.endpoint(method));
      const onAbort = () => request.abort();
      signal?.addEventListener("abort", onAbort, { once: true });

      request.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(event.loaded, event.total);
      };

      request.onload = () => {
        signal?.removeEventListener("abort", onAbort);
        let envelope: TelegramEnvelope<T> | null = null;
        try {
          envelope = JSON.parse(request.responseText) as TelegramEnvelope<T>;
        } catch {
          envelope = null;
        }
        if (envelope?.ok) {
          resolve(envelope);
          return;
        }
        const description = envelope?.description ?? `Error ${request.status}`;
        reject(
          new TelegramError(
            describeTelegramError(description),
            envelope?.error_code ?? request.status,
            envelope?.parameters?.retry_after,
          ),
        );
      };

      request.onerror = () => {
        signal?.removeEventListener("abort", onAbort);
        reject(new TelegramError("No se pudo conectar con Telegram. Revisa tu conexion y el token del bot.", 0));
      };

      request.onabort = () => {
        signal?.removeEventListener("abort", onAbort);
        reject(new DOMException("Operacion cancelada", "AbortError"));
      };

      const form = new FormData();
      Object.entries(payload).forEach(([key, value]) => form.append(key, value));
      if (file) form.append("document", file.blob, file.name);
      request.send(form);
    });
  }

  async download(filePath: string, onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
    throwIfAborted(signal);
    const response = await fetch(`${this.base}/file/bot${this.token}/${encodeURI(filePath)}`, { signal });
    if (!response.ok) {
      const status = response.status;
      throw new TelegramError(
        status === 404
          ? "Telegram ya no tiene ese archivo. Comprueba que el bot y el chat siguen siendo los mismos."
          : `Telegram devolvio ${status} al descargar un trozo.`,
        status,
      );
    }
    const total = Number(response.headers.get("content-length") ?? 0);
    if (!response.body) return response.blob();

    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      onProgress?.(loaded, total || loaded);
    }
    return new Blob(parts as unknown as BlobPart[]);
  }
}

export type ChunkPlan = { start: number; end: number };

export function planChunks(totalBytes: number, chunkBytes: number): ChunkPlan[] {
  const size = Math.max(1, Math.min(chunkBytes, MAX_CHUNK_BYTES));
  if (totalBytes <= 0) return [];
  const plans: ChunkPlan[] = [];
  for (let start = 0; start < totalBytes; start += size) {
    plans.push({ start, end: Math.min(start + size, totalBytes) });
  }
  return plans;
}

export function partFileName(name: string, index: number, total: number): string {
  const clean = name.replace(/[^\w.\- ]+/g, "_").slice(-90) || "archivo";
  const suffix = stringifySuffix(index, total);
  const dot = clean.lastIndexOf(".");
  if (dot > 0) return `${clean.slice(0, dot)}.${suffix}${clean.slice(dot)}`;
  return `${clean}.${suffix}`;
}

function stringifySuffix(index: number, total: number): string {
  return `${String(index + 1).padStart(4, "0")}-${String(total).padStart(4, "0")}`;
}

type SentDocument = { message_id: number; document: { file_id: string; file_size: number } };
export type BotInfo = { id: number; username?: string; first_name?: string };
export type ChatInfo = { id: number; type: string; title?: string; username?: string; first_name?: string };

/** Guarda y recupera archivos troceados en un chat de Telegram. */
export class TelegramClient {
  constructor(
    private readonly transport: TelegramTransport,
    readonly chatId: string,
    readonly chunkBytes: number = MAX_CHUNK_BYTES,
  ) {}

  async verify(): Promise<{ bot: BotInfo; chat: ChatInfo }> {
    const [bot, chat] = await Promise.all([
      this.transport.call<BotInfo>("getMe", {}),
      this.transport.call<ChatInfo>("getChat", { chat_id: this.chatId }),
    ]);
    return { bot, chat };
  }

  /** Ultimo chat que ha escrito al bot: evita tener que buscar el chat_id a mano. */
  async discoverChatId(): Promise<number | null> {
    type Update = {
      message?: { chat?: { id: number } };
      channel_post?: { chat?: { id: number } };
      my_chat_member?: { chat?: { id: number } };
    };
    const updates = await this.transport.call<Update[]>("getUpdates", { limit: "20", timeout: "0" });
    for (const update of [...updates].reverse()) {
      const id = update.message?.chat?.id ?? update.channel_post?.chat?.id ?? update.my_chat_member?.chat?.id;
      if (typeof id === "number") return id;
    }
    return null;
  }

  async upload(
    file: Blob,
    name: string,
    onProgress?: Progress,
    signal?: AbortSignal,
  ): Promise<ChunkRef[]> {
    if (file.size === 0) return [];
    const plans = planChunks(file.size, this.chunkBytes);
    const refs: ChunkRef[] = [];
    try {
      for (let index = 0; index < plans.length; index += 1) {
        throwIfAborted(signal);
        const plan = plans[index];
        const label = plans.length > 1 ? `${name} (parte ${index + 1}/${plans.length})` : name;
        const sent = await this.transport.call<SentDocument>(
          "sendDocument",
          {
            chat_id: this.chatId,
            caption: `nube: ${label}`.slice(0, 1024),
            disable_notification: "true",
          },
          { name: partFileName(name, index, plans.length), blob: file.slice(plan.start, plan.end) },
          (loaded) => onProgress?.(plan.start + Math.min(loaded, plan.end - plan.start), file.size),
          signal,
        );
        refs.push({ file_id: sent.document.file_id, message_id: sent.message_id, size: plan.end - plan.start });
        onProgress?.(plan.end, file.size);
      }
    } catch (error) {
      await this.remove(refs);
      throw error;
    }
    return refs;
  }

  async download(chunks: ChunkRef[], onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
    const total = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const parts: Blob[] = [];
    let loaded = 0;
    for (const chunk of chunks) {
      throwIfAborted(signal);
      const info = await this.transport.call<{ file_path: string }>("getFile", { file_id: chunk.file_id });
      const blob = await this.transport.download(
        info.file_path,
        (bytes) => onProgress?.(loaded + Math.min(bytes, chunk.size), total),
        signal,
      );
      parts.push(blob);
      loaded += chunk.size;
      onProgress?.(loaded, total);
    }
    return new Blob(parts);
  }

  async remove(chunks: ChunkRef[]): Promise<number> {
    let removed = 0;
    for (const chunk of chunks) {
      try {
        await this.transport.call("deleteMessage", {
          chat_id: this.chatId,
          message_id: String(chunk.message_id),
        });
        removed += 1;
      } catch {
        /* El mensaje pudo borrarse a mano desde Telegram: no es un error fatal. */
      }
    }
    return removed;
  }
}
